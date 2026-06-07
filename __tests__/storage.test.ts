jest.mock("@/lib/supabase", () => ({
	supabase: {
		storage: { from: jest.fn() },
		from: jest.fn(),
		auth: { getSession: jest.fn() },
	},
}));
jest.mock("expo-file-system/legacy", () => ({
	downloadAsync: jest.fn(),
	uploadAsync: jest.fn(),
	cacheDirectory: "file:///cache/",
	documentDirectory: "file:///documents/",
	FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
	getInfoAsync: jest.fn(),
	getFreeDiskStorageAsync: jest.fn(),
	copyAsync: jest.fn(),
	deleteAsync: jest.fn(),
	makeDirectoryAsync: jest.fn(),
	readDirectoryAsync: jest.fn(),
}));
jest.mock("expo-media-library", () => ({
	getAssetInfoAsync: jest.fn(),
}));
jest.mock("expo-video-thumbnails", () => ({
	getThumbnailAsync: jest.fn(),
}));
jest.mock("@/lib/dateUtils", () => ({
	safeDate: jest.fn((v: any) => (v instanceof Date ? v : new Date(v || Date.now()))),
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: {
		getItem: jest.fn(),
		setItem: jest.fn(),
		removeItem: jest.fn(),
	},
}));
jest.mock("@/lib/uploadSource", () => ({
	__esModule: true,
	UploadSourceUnavailableError: class UploadSourceUnavailableError extends Error {
		readonly reason: "missing" | "icloud" | "permission" | "disk";
		constructor(reason: any, message: string) {
			super(message);
			this.name = "UploadSourceUnavailableError";
			this.reason = reason;
		}
	},
	materializeUploadSource: jest.fn(),
	cleanupOrphanedUploadSources: jest.fn(),
}));
jest.mock("@/lib/tusUpload", () => ({
	__esModule: true,
	uploadMediaResumable: jest.fn(),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { renderHook, waitFor } from "@testing-library/react-native";
import { deleteAsync, downloadAsync, getInfoAsync } from "expo-file-system/legacy";
import * as VideoThumbnails from "expo-video-thumbnails";
import {
	buildByteRangeM3u8,
	createVideoThumbnailUri,
	deleteCachedDownload,
	downloadPhoto,
	getDownloadedPhotoIds,
	isPhotoDownloaded,
	markPhotoDownloaded,
	resolveStorageUrl,
	uploadMedia,
	usePhotoThumbnailUrl,
	useVideoPlaybackUri,
} from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { uploadMediaResumable } from "@/lib/tusUpload";
import { materializeUploadSource, UploadSourceUnavailableError } from "@/lib/uploadSource";

const mockedSupabase = supabase as any;
const mockedDownloadAsync = downloadAsync as jest.MockedFunction<typeof downloadAsync>;
const mockedGetInfoAsync = getInfoAsync as jest.MockedFunction<typeof getInfoAsync>;
const mockedDeleteAsync = deleteAsync as jest.MockedFunction<typeof deleteAsync>;
const mockedGetThumbnailAsync = VideoThumbnails.getThumbnailAsync as jest.MockedFunction<
	typeof VideoThumbnails.getThumbnailAsync
>;
const mockedMaterialize = materializeUploadSource as jest.MockedFunction<
	typeof materializeUploadSource
>;
const mockedUploadMediaResumable = uploadMediaResumable as jest.MockedFunction<
	typeof uploadMediaResumable
>;
const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

function mockBlobResponse(size: number = 8) {
	return {
		ok: true,
		blob: jest.fn().mockResolvedValue({ size } as Blob),
	};
}

function mockNativeUploadResponse(body: Record<string, unknown> = { Key: "uploaded/path" }) {
	return {
		status: 200,
		headers: {},
		mimeType: "application/json",
		body: JSON.stringify(body),
	};
}

function setupStorageMock(
	overrides: { uploadError?: any; uploadPath?: string; removeError?: any } = {}
) {
	const mockRemove = jest.fn().mockResolvedValue({ error: overrides.removeError || null });
	const mockUpload = jest
		.fn()
		.mockResolvedValue(
			overrides.uploadError
				? { data: null, error: overrides.uploadError }
				: { data: { path: overrides.uploadPath || "uploaded/path" }, error: null }
		);
	const mockGetPublicUrl = jest.fn().mockReturnValue({
		data: { publicUrl: "https://cdn.example.com/photo.jpg" },
	});
	const mockCreateSignedUrl = jest.fn().mockResolvedValue({
		data: { signedUrl: "https://cdn.example.com/signed/photo.jpg" },
		error: null,
	});

	mockedSupabase.storage.from.mockReturnValue({
		upload: mockUpload,
		getPublicUrl: mockGetPublicUrl,
		createSignedUrl: mockCreateSignedUrl,
		remove: mockRemove,
	});

	return { mockUpload, mockGetPublicUrl, mockCreateSignedUrl, mockRemove };
}

function setupDbMock(overrides: { insertError?: any } = {}) {
	const mockSingle = jest
		.fn()
		.mockResolvedValue(
			overrides.insertError
				? { data: null, error: overrides.insertError }
				: { data: { id: "media-item-1" }, error: null }
		);
	const mockSelect = jest.fn().mockReturnValue({ single: mockSingle });
	const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
	const mockMaybeSingle = jest.fn().mockResolvedValue({ data: { id: "user1" }, error: null });
	const mockEq = jest.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
	const mockUserSelect = jest.fn().mockReturnValue({ eq: mockEq });

	mockedSupabase.from.mockImplementation((table: string) => {
		if (table === "users") {
			return { select: mockUserSelect };
		}

		return { insert: mockInsert };
	});

	return { mockInsert, mockSelect, mockSingle, mockUserSelect, mockEq, mockMaybeSingle };
}

const baseUploadOptions = {
	uri: "file:///photos/photo.jpg",
	eventId: "event1",
	userId: "user1",
	capturedAt: new Date("2025-01-01"),
	width: 1920,
	height: 1080,
};

describe("storage", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.useRealTimers();
		mockedGetInfoAsync.mockResolvedValue({
			exists: true,
			isDirectory: false,
			uri: "file:///photos/photo.jpg",
			size: 8,
			modificationTime: Date.now(),
		} as any);
		mockedMaterialize.mockResolvedValue({
			path: "file:///documents/upload-sources/upl_default.jpg",
			size: 8,
			cleanup: jest.fn().mockResolvedValue(undefined),
		});
		mockedUploadMediaResumable.mockResolvedValue({ path: "stored/path" });
		mockedDeleteAsync.mockResolvedValue(undefined as any);
		mockedSupabase.auth.getSession.mockResolvedValue({
			data: { session: { access_token: "user-token", user: { id: "auth-user-1" } } },
		});
	});

	describe("uploadMedia", () => {
		beforeEach(() => {
			setupDbMock();
		});

		it("materializes source then uploads photo via TUS", async () => {
			const cleanup = jest.fn().mockResolvedValue(undefined);
			mockedMaterialize.mockResolvedValue({
				path: "file:///documents/upload-sources/upl_42.jpg",
				size: 12345,
				cleanup,
			});

			const result = await uploadMedia({
				...baseUploadOptions,
				mediaType: "photo",
				uploadId: "upl_42",
			});

			expect(result.success).toBe(true);
			expect(mockedMaterialize).toHaveBeenCalledWith(
				expect.objectContaining({
					uri: "file:///photos/photo.jpg",
					uploadId: "upl_42",
					mediaType: "photo",
				})
			);
			expect(mockedUploadMediaResumable).toHaveBeenCalledWith(
				expect.objectContaining({
					fileUri: "file:///documents/upload-sources/upl_42.jpg",
					fileSize: 12345,
					bucket: "event-photos",
					contentType: "image/jpeg",
				})
			);
			expect(cleanup).toHaveBeenCalled();
		});

		it("uploads video and generates TUS thumbnail upload", async () => {
			mockedMaterialize.mockResolvedValue({
				path: "file:///documents/upload-sources/upl_v.mp4",
				size: 100_000,
				cleanup: jest.fn().mockResolvedValue(undefined),
			});
			mockedGetThumbnailAsync.mockResolvedValue({
				uri: "file:///thumb.jpg",
				width: 320,
				height: 240,
			});
			mockedGetInfoAsync.mockImplementation(
				async (uri: any) =>
					({
						exists: true,
						isDirectory: false,
						uri,
						size: 4096,
						modificationTime: Date.now(),
					}) as any
			);

			const result = await uploadMedia({
				...baseUploadOptions,
				uri: "file:///photos/clip.mp4",
				mediaType: "video",
				duration: 5000,
				uploadId: "upl_v",
			});

			expect(result.success).toBe(true);
			expect(mockedUploadMediaResumable).toHaveBeenCalledTimes(2);
			const mediaCall = mockedUploadMediaResumable.mock.calls[0][0];
			const thumbCall = mockedUploadMediaResumable.mock.calls[1][0];
			expect(mediaCall.bucket).toBe("event-photos");
			expect(mediaCall.contentType).toBe("video/mp4");
			expect(thumbCall.bucket).toBe("thumbnails");
			expect(thumbCall.contentType).toBe("image/jpeg");
			expect(thumbCall.fileFingerprint).toContain(":thumb:");
		});

		it("classifies UploadSourceUnavailableError(icloud) as permission failure", async () => {
			mockedMaterialize.mockRejectedValue(
				new UploadSourceUnavailableError("icloud", "asset not downloaded")
			);

			const result = await uploadMedia({ ...baseUploadOptions, mediaType: "photo" });

			expect(result.success).toBe(false);
			expect(result.failureReason).toBe("permission");
			expect(mockedUploadMediaResumable).not.toHaveBeenCalled();
		});

		it("classifies UploadSourceUnavailableError(disk) as storage failure", async () => {
			mockedMaterialize.mockRejectedValue(
				new UploadSourceUnavailableError("disk", "not enough space")
			);

			const result = await uploadMedia({ ...baseUploadOptions, mediaType: "photo" });

			expect(result.success).toBe(false);
			expect(result.failureReason).toBe("storage");
		});

		it("classifies HTTP 503 from TUS as network failure", async () => {
			const err = new Error("TUS patch failed (503)") as Error & { httpStatus?: number };
			err.httpStatus = 503;
			mockedUploadMediaResumable.mockRejectedValueOnce(err);

			const result = await uploadMedia({ ...baseUploadOptions, mediaType: "photo" });

			expect(result.success).toBe(false);
			expect(result.failureReason).toBe("network");
		});

		it("classifies timeout from TUS as timeout failure", async () => {
			mockedUploadMediaResumable.mockRejectedValueOnce(new Error("timeout"));

			const result = await uploadMedia({ ...baseUploadOptions, mediaType: "photo" });

			expect(result.success).toBe(false);
			expect(result.failureReason).toBe("timeout");
		});

		it("returns permission failure when session is missing", async () => {
			mockedSupabase.auth.getSession.mockResolvedValueOnce({ data: { session: null } });

			const result = await uploadMedia({ ...baseUploadOptions, mediaType: "photo" });

			expect(result.success).toBe(false);
			expect(result.failureReason).toBe("permission");
			expect(mockedMaterialize).not.toHaveBeenCalled();
		});

		it("cleans up storage when DB insert fails", async () => {
			const { mockRemove } = setupStorageMock();
			setupDbMock({ insertError: { code: "23505", message: "duplicate" } });

			const result = await uploadMedia({ ...baseUploadOptions, mediaType: "photo" });

			expect(result.success).toBe(false);
			expect(result.failureReason).toBe("database");
			expect(mockRemove).toHaveBeenCalled();
		});

		it("runs materialized cleanup even when upload throws", async () => {
			const cleanup = jest.fn().mockResolvedValue(undefined);
			mockedMaterialize.mockResolvedValue({
				path: "file:///documents/upload-sources/upl_x.jpg",
				size: 8,
				cleanup,
			});
			mockedUploadMediaResumable.mockRejectedValueOnce(new Error("boom"));

			await uploadMedia({ ...baseUploadOptions, mediaType: "photo" });

			expect(cleanup).toHaveBeenCalled();
		});
	});

	describe("resolveStorageUrl", () => {
		it("returns a signed URL for event photos", async () => {
			const { mockCreateSignedUrl, mockGetPublicUrl } = setupStorageMock();

			const url = await resolveStorageUrl("photos/test.jpg");

			expect(url).toBe("https://cdn.example.com/signed/photo.jpg");
			expect(mockedSupabase.storage.from).toHaveBeenCalledWith("event-photos");
			expect(mockCreateSignedUrl).toHaveBeenCalledWith("photos/test.jpg", 60 * 60, undefined);
			expect(mockGetPublicUrl).not.toHaveBeenCalled();
		});

		it("returns a signed URL for thumbnails", async () => {
			const { mockCreateSignedUrl } = setupStorageMock();

			const url = await resolveStorageUrl("photos/test_thumb.jpg");

			expect(url).toBe("https://cdn.example.com/signed/photo.jpg");
			expect(mockedSupabase.storage.from).toHaveBeenCalledWith("thumbnails");
			expect(mockCreateSignedUrl).toHaveBeenCalledWith("photos/test_thumb.jpg", 60 * 60, undefined);
		});

		it("passes transform options through to signed URLs", async () => {
			const { mockCreateSignedUrl } = setupStorageMock();

			const url = await resolveStorageUrl("photos/test.jpg", {
				transform: {
					width: 720,
					height: 720,
					quality: 60,
					resize: "cover",
				},
			});

			expect(url).toBe("https://cdn.example.com/signed/photo.jpg");
			expect(mockCreateSignedUrl).toHaveBeenCalledWith("photos/test.jpg", 60 * 60, {
				transform: {
					width: 720,
					height: 720,
					quality: 60,
					resize: "cover",
				},
			});
		});

		it("skips transform options for HEIC thumbnails", async () => {
			setupStorageMock();
			const { result } = renderHook(() => usePhotoThumbnailUrl("photos/test.HEIC"));

			await waitFor(() => {
				expect(result.current).toBe("https://cdn.example.com/signed/photo.jpg");
			});

			const mockCreateSignedUrl = mockedSupabase.storage.from.mock.results[0].value.createSignedUrl;
			expect(mockCreateSignedUrl).toHaveBeenCalledWith("photos/test.HEIC", 60 * 60, undefined);
		});

		it("returns http URLs unchanged", async () => {
			setupStorageMock();

			const url = await resolveStorageUrl("https://cdn.example.com/existing.jpg");

			expect(url).toBe("https://cdn.example.com/existing.jpg");
			expect(mockedSupabase.storage.from).not.toHaveBeenCalled();
		});

		it("throws when signed URL creation fails instead of falling back to a public URL", async () => {
			const failingPath = "photos/failing-test.jpg";
			const mockGetPublicUrl = jest.fn().mockReturnValue({
				data: { publicUrl: "https://cdn.example.com/public-photo.jpg" },
			});
			const mockCreateSignedUrl = jest.fn().mockResolvedValue({
				data: null,
				error: { message: "Object not found" },
			});
			mockedSupabase.storage.from.mockReturnValue({
				createSignedUrl: mockCreateSignedUrl,
				getPublicUrl: mockGetPublicUrl,
			});

			await expect(resolveStorageUrl(failingPath)).rejects.toEqual({
				message: "Object not found",
			});
			expect(mockCreateSignedUrl).toHaveBeenCalledWith(failingPath, 60 * 60, undefined);
			expect(mockGetPublicUrl).not.toHaveBeenCalled();
		});
	});

	describe("downloadPhoto", () => {
		beforeEach(() => {
			const mockCreateSignedUrl = jest.fn().mockResolvedValue({
				data: { signedUrl: "https://cdn.example.com/photo.jpg" },
				error: null,
			});
			mockedSupabase.storage.from.mockReturnValue({ createSignedUrl: mockCreateSignedUrl });
		});

		it("returns downloaded URI on success", async () => {
			mockedDownloadAsync.mockResolvedValue({
				status: 200,
				uri: "/cache/photo.jpg",
				headers: {},
				mimeType: "image/jpeg",
				md5: undefined,
			});

			const result = await downloadPhoto("some/path.jpg", "photo.jpg");

			expect(result).toBe("/cache/photo.jpg");
			expect(mockedDownloadAsync).toHaveBeenCalledWith(
				"https://cdn.example.com/photo.jpg",
				"file:///cache/photo.jpg"
			);
		});

		it("throws DownloadError(server) on non-200 status", async () => {
			mockedDownloadAsync.mockResolvedValue({
				status: 404,
				uri: "/cache/photo.jpg",
				headers: {},
				mimeType: null,
				md5: undefined,
			});

			await expect(downloadPhoto("some/path.jpg", "photo.jpg")).rejects.toMatchObject({
				name: "DownloadError",
				reason: "server",
			});
		});

		it("throws DownloadError(network) when downloadAsync throws a network error", async () => {
			mockedDownloadAsync.mockRejectedValue(new Error("Network request failed"));

			await expect(downloadPhoto("some/path.jpg", "photo.jpg")).rejects.toMatchObject({
				name: "DownloadError",
				reason: "network",
			});
		});

		it("throws DownloadError(out_of_space) when the disk is full", async () => {
			mockedDownloadAsync.mockRejectedValue(
				new Error('NSCocoaErrorDomain Code=640 "there isn\'t enough space"')
			);

			await expect(downloadPhoto("some/path.jpg", "photo.jpg")).rejects.toMatchObject({
				name: "DownloadError",
				reason: "out_of_space",
			});
		});
	});

	describe("deleteCachedDownload", () => {
		it("deletes the cached file idempotently", async () => {
			mockedDeleteAsync.mockResolvedValue(undefined as any);

			await deleteCachedDownload("file:///cache/recapd_1.jpg");

			expect(mockedDeleteAsync).toHaveBeenCalledWith("file:///cache/recapd_1.jpg", {
				idempotent: true,
			});
		});

		it("ignores empty uris and swallows delete errors", async () => {
			mockedDeleteAsync.mockReset();
			await deleteCachedDownload("");
			expect(mockedDeleteAsync).not.toHaveBeenCalled();

			mockedDeleteAsync.mockRejectedValue(new Error("gone"));
			await expect(deleteCachedDownload("file:///cache/x.jpg")).resolves.toBeUndefined();
		});
	});

	describe("isPhotoDownloaded", () => {
		it("returns true when ID is in stored list", async () => {
			mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify(["id1", "id2"]));

			const result = await isPhotoDownloaded("id1");
			expect(result).toBe(true);
		});

		it("returns false when ID is not in stored list", async () => {
			mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify(["id1"]));

			const result = await isPhotoDownloaded("id99");
			expect(result).toBe(false);
		});

		it("returns false when no data stored", async () => {
			mockedAsyncStorage.getItem.mockResolvedValue(null);

			const result = await isPhotoDownloaded("id1");
			expect(result).toBe(false);
		});
	});

	describe("markPhotoDownloaded", () => {
		it("adds ID to stored list", async () => {
			mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify(["id1"]));

			await markPhotoDownloaded("id2");

			expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
				"recapd_downloaded_photos",
				JSON.stringify(["id1", "id2"])
			);
		});

		it("does not add duplicate IDs", async () => {
			mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify(["id1"]));

			await markPhotoDownloaded("id1");

			expect(mockedAsyncStorage.setItem).not.toHaveBeenCalled();
		});
	});

	describe("getDownloadedPhotoIds", () => {
		it("returns a Set of downloaded IDs", async () => {
			mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify(["a", "b", "c"]));

			const result = await getDownloadedPhotoIds();

			expect(result).toBeInstanceOf(Set);
			expect(result.size).toBe(3);
			expect(result.has("a")).toBe(true);
			expect(result.has("b")).toBe(true);
			expect(result.has("c")).toBe(true);
		});

		it("returns empty Set when no data stored", async () => {
			mockedAsyncStorage.getItem.mockResolvedValue(null);

			const result = await getDownloadedPhotoIds();

			expect(result).toBeInstanceOf(Set);
			expect(result.size).toBe(0);
		});
	});

	describe("buildByteRangeM3u8", () => {
		it("emits a VOD playlist with EXT-X-BYTERANGE per segment", () => {
			const manifest = {
				version: 1,
				totalSize: 12000,
				duration: 12.5,
				segments: [
					{ offset: 0, length: 4000, duration: 6.0 },
					{ offset: 4000, length: 4500, duration: 6.0 },
					{ offset: 8500, length: 3500, duration: 0.5 },
				],
			};
			const m3u8 = buildByteRangeM3u8(manifest, "https://signed.example/video.mp4?token=abc");

			expect(m3u8).toContain("#EXTM3U");
			expect(m3u8).toContain("#EXT-X-VERSION:7");
			expect(m3u8).toContain("#EXT-X-TARGETDURATION:6");
			expect(m3u8).toContain("#EXT-X-PLAYLIST-TYPE:VOD");
			expect(m3u8).toContain("#EXT-X-INDEPENDENT-SEGMENTS");
			expect(m3u8).toContain("#EXT-X-BYTERANGE:4000@0");
			expect(m3u8).toContain("#EXT-X-BYTERANGE:4500");
			expect(m3u8).toContain("#EXT-X-BYTERANGE:3500");
			expect(m3u8).toContain("https://signed.example/video.mp4?token=abc");
			expect(m3u8).toContain("#EXT-X-ENDLIST");
		});

		it("uses explicit offset when segments are not contiguous", () => {
			const manifest = {
				version: 1,
				totalSize: 12000,
				duration: 12,
				segments: [
					{ offset: 0, length: 2000, duration: 6 },
					{ offset: 6000, length: 3000, duration: 6 },
				],
			};
			const m3u8 = buildByteRangeM3u8(manifest, "https://signed.example/v.mp4");

			expect(m3u8).toContain("#EXT-X-BYTERANGE:2000@0");
			expect(m3u8).toContain("#EXT-X-BYTERANGE:3000@6000");
		});
	});

	describe("useVideoPlaybackUri", () => {
		beforeEach(() => {
			(global as any).fetch = jest.fn();
		});

		it("returns the local URI for pending uploads", async () => {
			const { result } = renderHook(() =>
				useVideoPlaybackUri({
					storage_path: "event1/user1/video.mp4",
					isPending: true,
					localUri: "file:///tmp/video.mp4",
				})
			);

			await waitFor(() => {
				expect(result.current).toBe("file:///tmp/video.mp4");
			});
		});

		it("falls back to mp4 signed URL when hls_path is null", async () => {
			const mockCreateSignedUrl = jest.fn().mockResolvedValue({
				data: { signedUrl: "https://cdn.example.com/signed/video.mp4" },
				error: null,
			});
			mockedSupabase.storage.from.mockReturnValue({
				createSignedUrl: mockCreateSignedUrl,
			});

			const { result } = renderHook(() =>
				useVideoPlaybackUri({
					storage_path: "event1/user1/video.mp4",
					hls_path: null,
				})
			);

			await waitFor(() => {
				expect(result.current).toBe("https://cdn.example.com/signed/video.mp4");
			});
		});

		it("returns a data: HLS manifest URL when hls_path is set", async () => {
			const mockCreateSignedUrl = jest.fn().mockImplementation((path: string) =>
				Promise.resolve({
					data: { signedUrl: `https://cdn.example.com/signed/${path}?token=t` },
					error: null,
				})
			);
			mockedSupabase.storage.from.mockReturnValue({
				createSignedUrl: mockCreateSignedUrl,
			});
			(global.fetch as jest.Mock).mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve({
						version: 1,
						totalSize: 1000,
						duration: 6,
						segments: [{ offset: 0, length: 1000, duration: 6 }],
					}),
			});

			const { result } = renderHook(() =>
				useVideoPlaybackUri({
					storage_path: "event-fresh/user-fresh/clip-hls.mp4",
					hls_path: "event-fresh/user-fresh/clip-hls.mp4.hls.json",
				})
			);

			await waitFor(() => {
				expect(result.current).toMatch(/^data:application\/vnd\.apple\.mpegurl;base64,/);
			});
			const base64 = result.current!.split(",")[1];
			const decoded = Buffer.from(base64, "base64").toString("utf-8");
			expect(decoded).toContain("#EXTM3U");
			expect(decoded).toContain("#EXT-X-BYTERANGE:1000@0");
			expect(decoded).toContain(
				"https://cdn.example.com/signed/event-fresh/user-fresh/clip-hls.mp4"
			);
		});
	});
});
