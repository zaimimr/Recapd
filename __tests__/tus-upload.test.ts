jest.mock("@react-native-async-storage/async-storage", () => {
	const store = new Map<string, string>();
	return {
		__esModule: true,
		default: {
			getItem: jest.fn(async (k: string) => store.get(k) ?? null),
			setItem: jest.fn(async (k: string, v: string) => {
				store.set(k, v);
			}),
			removeItem: jest.fn(async (k: string) => {
				store.delete(k);
			}),
			clear: jest.fn(async () => {
				store.clear();
			}),
			__store: store,
		},
	};
});

jest.mock("expo-file-system/legacy", () => ({
	EncodingType: { Base64: "base64" },
	readAsStringAsync: jest.fn(),
}));

jest.mock("@/lib/supabase", () => ({
	supabase: {
		auth: {
			getSession: jest.fn(async () => ({
				data: { session: { access_token: "test-token", user: { id: "user1" } } },
			})),
		},
	},
}));

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ORIGINAL_ENV_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

beforeAll(() => {
	process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
	process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
});

afterAll(() => {
	process.env.EXPO_PUBLIC_SUPABASE_URL = ORIGINAL_ENV_URL;
	process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = ORIGINAL_ENV_KEY;
	globalThis.fetch = ORIGINAL_FETCH;
});

import AsyncStorage from "@react-native-async-storage/async-storage";
import { readAsStringAsync } from "expo-file-system/legacy";
import {
	createTusUpload,
	getTusOffset,
	readFileChunk,
	uploadTusChunk,
	uploadMediaResumable,
} from "@/lib/tusUpload";

const mockedReadAsStringAsync = readAsStringAsync as jest.MockedFunction<typeof readAsStringAsync>;
const mockedAsyncStorage = AsyncStorage as any;

type FetchCall = { url: string; init: RequestInit };

function installFetchMock(): {
	getCalls: () => FetchCall[];
	handler: jest.Mock<Promise<Response>, [string, RequestInit]>;
} {
	const handler = jest.fn(async (_url: string, _init: RequestInit) => {
		return new Response(null, { status: 204 });
	});
	(globalThis as any).fetch = handler as any;
	const getCalls = () =>
		handler.mock.calls.map(([url, init]) => ({ url, init }) as FetchCall);
	return { getCalls, handler };
}

function makeResponse(status: number, headers: Record<string, string> = {}): Response {
	return new Response(null, { status, headers });
}

beforeEach(() => {
	mockedAsyncStorage.__store.clear();
	mockedReadAsStringAsync.mockReset();
});

describe("tusUpload protocol", () => {
	describe("createTusUpload", () => {
		it("POSTs to /storage/v1/upload/resumable with correct metadata + headers", async () => {
			const { getCalls, handler } = installFetchMock();
			handler.mockResolvedValueOnce(
				makeResponse(201, { Location: "https://example.supabase.co/storage/v1/upload/resumable/abc" })
			);

			const url = await createTusUpload({
				totalBytes: 1_000_000,
				bucket: "event-photos",
				objectName: "ev/usr/123.mp4",
				contentType: "video/mp4",
			});

			expect(url).toBe("https://example.supabase.co/storage/v1/upload/resumable/abc");
			expect(getCalls()).toHaveLength(1);
			expect(getCalls()[0].url).toBe(
				"https://example.supabase.co/storage/v1/upload/resumable"
			);
			const headers = getCalls()[0].init.headers as Record<string, string>;
			expect(headers["Tus-Resumable"]).toBe("1.0.0");
			expect(headers["Upload-Length"]).toBe("1000000");
			expect(headers["Upload-Metadata"]).toContain("bucketName ");
			expect(headers["Upload-Metadata"]).toContain("objectName ");
			expect(headers["Upload-Metadata"]).toContain("contentType ");
			expect(headers.Authorization).toBe("Bearer test-token");
			expect(headers.apikey).toBe("anon-key");
		});

		it("returns relative Location resolved against Supabase URL", async () => {
			const { handler } = installFetchMock();
			handler.mockResolvedValueOnce(
				makeResponse(201, { Location: "/storage/v1/upload/resumable/relative" })
			);

			const url = await createTusUpload({
				totalBytes: 1,
				bucket: "b",
				objectName: "o",
				contentType: "video/mp4",
			});

			expect(url).toBe(
				"https://example.supabase.co/storage/v1/upload/resumable/relative"
			);
		});

		it("throws with httpStatus on non-201", async () => {
			const { handler } = installFetchMock();
			handler.mockResolvedValueOnce(makeResponse(503));

			await expect(
				createTusUpload({
					totalBytes: 1,
					bucket: "b",
					objectName: "o",
					contentType: "video/mp4",
				})
			).rejects.toMatchObject({ httpStatus: 503 });
		});

		it("throws when Location header missing", async () => {
			const { handler } = installFetchMock();
			handler.mockResolvedValueOnce(makeResponse(201));

			await expect(
				createTusUpload({
					totalBytes: 1,
					bucket: "b",
					objectName: "o",
					contentType: "video/mp4",
				})
			).rejects.toThrow(/Location header/);
		});
	});

	describe("getTusOffset", () => {
		it("HEAD returns parsed Upload-Offset", async () => {
			const { getCalls, handler } = installFetchMock();
			handler.mockResolvedValueOnce(makeResponse(200, { "Upload-Offset": "6291456" }));

			const offset = await getTusOffset("https://example.supabase.co/storage/v1/upload/resumable/x");
			expect(offset).toBe(6_291_456);
			expect(getCalls()[0].init.method).toBe("HEAD");
		});

		it("throws with 404 when upload expired", async () => {
			const { handler } = installFetchMock();
			handler.mockResolvedValueOnce(makeResponse(404));

			await expect(
				getTusOffset("https://example.supabase.co/storage/v1/upload/resumable/x")
			).rejects.toMatchObject({ httpStatus: 404 });
		});

		it("throws when Upload-Offset header missing", async () => {
			const { handler } = installFetchMock();
			handler.mockResolvedValueOnce(makeResponse(200));

			await expect(
				getTusOffset("https://example.supabase.co/storage/v1/upload/resumable/x")
			).rejects.toThrow(/invalid Upload-Offset/);
		});
	});

	describe("uploadTusChunk", () => {
		it("PATCHes with Upload-Offset + octet-stream content-type", async () => {
			const { getCalls, handler } = installFetchMock();
			handler.mockResolvedValueOnce(
				makeResponse(204, { "Upload-Offset": "1024" })
			);
			const chunk = new Uint8Array([1, 2, 3, 4]);

			const next = await uploadTusChunk({
				tusUrl: "https://example.supabase.co/storage/v1/upload/resumable/x",
				chunk,
				offset: 0,
			});

			expect(next).toBe(1024);
			expect(getCalls()[0].init.method).toBe("PATCH");
			const headers = getCalls()[0].init.headers as Record<string, string>;
			expect(headers["Upload-Offset"]).toBe("0");
			expect(headers["Content-Type"]).toBe("application/offset+octet-stream");
		});

		it("rejects non-advancing offset", async () => {
			const { handler } = installFetchMock();
			handler.mockResolvedValueOnce(makeResponse(204, { "Upload-Offset": "0" }));

			await expect(
				uploadTusChunk({
					tusUrl: "https://x/upload/y",
					chunk: new Uint8Array([1]),
					offset: 0,
				})
			).rejects.toThrow(/non-advancing/);
		});

		it("rejects non-2xx with httpStatus", async () => {
			const { handler } = installFetchMock();
			handler.mockResolvedValueOnce(makeResponse(503));

			await expect(
				uploadTusChunk({ tusUrl: "https://x/upload/y", chunk: new Uint8Array([1]), offset: 0 })
			).rejects.toMatchObject({ httpStatus: 503 });
		});
	});

	describe("readFileChunk", () => {
		it("decodes base64 read into Uint8Array", async () => {
			mockedReadAsStringAsync.mockResolvedValueOnce("AQIDBA==");
			const bytes = await readFileChunk("file:///x.mp4", 0, 4);
			expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
			expect(mockedReadAsStringAsync).toHaveBeenCalledWith("file:///x.mp4", {
				encoding: "base64",
				position: 0,
				length: 4,
			});
		});
	});

	describe("uploadMediaResumable", () => {
		const fileSize = 15_000_000;

		it("creates, uploads all chunks, clears persisted state on success", async () => {
			mockedReadAsStringAsync.mockImplementation(async (_uri, opts: any) => {
				const len = opts.length as number;
				return Buffer.from(new Uint8Array(len)).toString("base64");
			});

			const { getCalls, handler } = installFetchMock();
			handler.mockImplementation(async (url, init) => {
				const method = (init.method ?? "GET").toUpperCase();
				if (method === "POST") {
					return makeResponse(201, {
						Location: "https://example.supabase.co/storage/v1/upload/resumable/new",
					});
				}
				if (method === "PATCH") {
					const offsetHeader = (init.headers as Record<string, string>)["Upload-Offset"];
					const startOffset = Number.parseInt(offsetHeader, 10);
					const chunkLen = (init.body as Uint8Array).byteLength;
					return makeResponse(204, {
						"Upload-Offset": String(startOffset + chunkLen),
					});
				}
				return makeResponse(204);
			});

			const result = await uploadMediaResumable({
				fileUri: "file:///big.mp4",
				fileSize,
				bucket: "event-photos",
				objectName: "ev/usr/big.mp4",
				contentType: "video/mp4",
				fileFingerprint: "fp-1",
			});

			expect(result.path).toBe("ev/usr/big.mp4");
			const patchCount = getCalls().filter((c) => (c.init.method ?? "").toUpperCase() === "PATCH").length;
			expect(patchCount).toBe(Math.ceil(fileSize / (2 * 1024 * 1024)));
			expect(mockedAsyncStorage.__store.size).toBe(0);
		});

		it("resumes from persisted offset on second call", async () => {
			const persistedTusUrl = "https://example.supabase.co/storage/v1/upload/resumable/persisted";
			await mockedAsyncStorage.setItem(
				"recapd_tus_v1_fp-resume",
				JSON.stringify({
					tusUrl: persistedTusUrl,
					totalBytes: fileSize,
					updatedAt: new Date().toISOString(),
				})
			);

			mockedReadAsStringAsync.mockImplementation(async (_uri, opts: any) => {
				const len = opts.length as number;
				return Buffer.from(new Uint8Array(len)).toString("base64");
			});

			const { getCalls, handler } = installFetchMock();
			handler.mockImplementation(async (url, init) => {
				const method = (init.method ?? "GET").toUpperCase();
				if (method === "HEAD") {
					return makeResponse(200, { "Upload-Offset": "12000000" });
				}
				if (method === "PATCH") {
					const offsetHeader = (init.headers as Record<string, string>)["Upload-Offset"];
					const startOffset = Number.parseInt(offsetHeader, 10);
					const chunkLen = (init.body as Uint8Array).byteLength;
					return makeResponse(204, { "Upload-Offset": String(startOffset + chunkLen) });
				}
				if (method === "POST") {
					return makeResponse(201, { Location: persistedTusUrl });
				}
				return makeResponse(204);
			});

			const result = await uploadMediaResumable({
				fileUri: "file:///big.mp4",
				fileSize,
				bucket: "event-photos",
				objectName: "ev/usr/big.mp4",
				contentType: "video/mp4",
				fileFingerprint: "fp-resume",
			});

			expect(result.path).toBe("ev/usr/big.mp4");
			const methods = getCalls().map((c) => (c.init.method ?? "GET").toUpperCase());
			expect(methods).toContain("HEAD");
			expect(methods).not.toContain("POST");
			const patchCount = methods.filter((m) => m === "PATCH").length;
			expect(patchCount).toBe(Math.ceil((fileSize - 12000000) / (2 * 1024 * 1024)));
		});

		it("restarts when persisted upload is gone (404 on HEAD)", async () => {
			await mockedAsyncStorage.setItem(
				"recapd_tus_v1_fp-stale",
				JSON.stringify({
					tusUrl: "https://example.supabase.co/storage/v1/upload/resumable/gone",
					totalBytes: fileSize,
					updatedAt: new Date().toISOString(),
				})
			);

			mockedReadAsStringAsync.mockImplementation(async (_uri, opts: any) => {
				const len = opts.length as number;
				return Buffer.from(new Uint8Array(len)).toString("base64");
			});

			const { getCalls, handler } = installFetchMock();
			handler.mockImplementation(async (url, init) => {
				const method = (init.method ?? "GET").toUpperCase();
				if (method === "HEAD") return makeResponse(404);
				if (method === "POST") {
					return makeResponse(201, {
						Location: "https://example.supabase.co/storage/v1/upload/resumable/fresh",
					});
				}
				if (method === "PATCH") {
					const offsetHeader = (init.headers as Record<string, string>)["Upload-Offset"];
					const startOffset = Number.parseInt(offsetHeader, 10);
					const chunkLen = (init.body as Uint8Array).byteLength;
					return makeResponse(204, { "Upload-Offset": String(startOffset + chunkLen) });
				}
				return makeResponse(204);
			});

			const result = await uploadMediaResumable({
				fileUri: "file:///big.mp4",
				fileSize,
				bucket: "event-photos",
				objectName: "ev/usr/big.mp4",
				contentType: "video/mp4",
				fileFingerprint: "fp-stale",
			});

			expect(result.path).toBe("ev/usr/big.mp4");
			const methods = getCalls().map((c) => (c.init.method ?? "GET").toUpperCase());
			expect(methods).toContain("POST");
			expect(methods).toContain("HEAD");
		});

		it("throws when post-upload verify probe returns 404", async () => {
			mockedReadAsStringAsync.mockImplementation(async (_uri, opts: any) => {
				const len = opts.length as number;
				return Buffer.from(new Uint8Array(len)).toString("base64");
			});

			const { handler } = installFetchMock();
			handler.mockImplementation(async (url, init) => {
				const method = (init.method ?? "GET").toUpperCase();
				if (method === "POST") {
					return makeResponse(201, {
						Location: "https://example.supabase.co/storage/v1/upload/resumable/missing",
					});
				}
				if (method === "PATCH") {
					const offsetHeader = (init.headers as Record<string, string>)["Upload-Offset"];
					const startOffset = Number.parseInt(offsetHeader, 10);
					const chunkLen = (init.body as Uint8Array).byteLength;
					return makeResponse(204, { "Upload-Offset": String(startOffset + chunkLen) });
				}
				if (method === "GET" && url.includes("/storage/v1/object/info/")) {
					return makeResponse(404);
				}
				return makeResponse(204);
			});

			await expect(
				uploadMediaResumable({
					fileUri: "file:///big.mp4",
					fileSize: 4 * 1024 * 1024,
					bucket: "event-photos",
					objectName: "ev/usr/missing.heic",
					contentType: "image/heic",
					fileFingerprint: "fp-missing",
				})
			).rejects.toMatchObject({
				httpStatus: 404,
				message: expect.stringContaining("storage object missing"),
			});

			expect(mockedAsyncStorage.__store.size).toBe(0);
		});
	});
});
