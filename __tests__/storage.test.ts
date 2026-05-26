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
	FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
	getInfoAsync: jest.fn(),
	getFreeDiskStorageAsync: jest.fn(),
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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { renderHook, waitFor } from "@testing-library/react-native";
import {
	downloadAsync,
	getFreeDiskStorageAsync,
	getInfoAsync,
	uploadAsync,
} from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as VideoThumbnails from "expo-video-thumbnails";
import {
	createVideoThumbnailUri,
	downloadPhoto,
	getDownloadedPhotoIds,
	isPhotoDownloaded,
	markPhotoDownloaded,
	resolveStorageUrl,
	uploadMedia,
	usePhotoThumbnailUrl,
} from "@/lib/storage";
import { supabase } from "@/lib/supabase";

const mockedSupabase = supabase as any;
const mockedDownloadAsync = downloadAsync as jest.MockedFunction<typeof downloadAsync>;
const mockedGetInfoAsync = getInfoAsync as jest.MockedFunction<typeof getInfoAsync>;
const mockedGetFreeDiskStorageAsync = getFreeDiskStorageAsync as jest.MockedFunction<
	typeof getFreeDiskStorageAsync
>;
const mockedUploadAsync = uploadAsync as jest.MockedFunction<typeof uploadAsync>;
const mockedGetAssetInfoAsync = MediaLibrary.getAssetInfoAsync as jest.MockedFunction<
	typeof MediaLibrary.getAssetInfoAsync
>;
const mockedGetThumbnailAsync = VideoThumbnails.getThumbnailAsync as jest.MockedFunction<
	typeof VideoThumbnails.getThumbnailAsync
>;
const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockedFetch = jest.fn();

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
		mockedFetch.mockResolvedValue(mockBlobResponse());
		(global as typeof globalThis & { fetch: typeof fetch }).fetch = mockedFetch as typeof fetch;
		mockedUploadAsync.mockResolvedValue(mockNativeUploadResponse() as any);
		mockedGetInfoAsync.mockResolvedValue({
			exists: true,
			isDirectory: false,
			uri: "file:///photos/photo.jpg",
			size: 8,
			modificationTime: Date.now(),
		} as any);
		mockedGetFreeDiskStorageAsync.mockResolvedValue(100 * 1024 * 1024 * 1024);
		mockedSupabase.auth.getSession.mockResolvedValue({
			data: { session: { access_token: "user-token", user: { id: "auth-user-1" } } },
		});
	});

	describe("uploadMedia", () => {
		it("uploads a photo successfully without generating a local thumbnail", async () => {
			const { mockInsert } = setupDbMock();

			const result = await uploadMedia({ ...baseUploadOptions, mediaType: "photo" });

			expect(result.success).toBe(true);
			expect(result.path).toMatch(/^event1\/user1\/\d+_[a-z0-9]+\.jpg$/);
			expect(mockedUploadAsync).toHaveBeenCalledTimes(1);

			const uploadCallArgs = mockedUploadAsync.mock.calls[0];
			expect(uploadCallArgs[0]).toMatch(
				/\/storage\/v1\/object\/event-photos\/event1\/user1\/\d+_[a-z0-9]+\.jpg$/
			);
			expect(uploadCallArgs[1]).toBe("file:///photos/photo.jpg");
			expect(uploadCallArgs[2]).toEqual(
				expect.objectContaining({
					httpMethod: "POST",
					uploadType: 0,
					headers: expect.objectContaining({
						Authorization: "Bearer user-token",
						apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
						"content-type": "image/jpeg",
						"x-upsert": "false",
					}),
				})
			);

			expect(mockInsert).toHaveBeenCalledWith(
				expect.objectContaining({
					event_id: "event1",
					uploaded_by_user_id: "user1",
					media_type: "photo",
					duration_milliseconds: null,
					thumbnail_path: null,
				})
			);
		});

		it("uploads a video with thumbnail", async () => {
			mockedUploadAsync
				.mockResolvedValueOnce(mockNativeUploadResponse({ Key: "event1/user1/123.mp4" }) as any)
				.mockResolvedValueOnce(
					mockNativeUploadResponse({ Key: "event1/user1/123_thumb.jpg" }) as any
				);
			const { mockInsert } = setupDbMock();

			mockedGetThumbnailAsync.mockResolvedValue({
				uri: "file:///thumb.jpg",
				width: 320,
				height: 240,
			});
			const result = await uploadMedia({
				...baseUploadOptions,
				uri: "file:///video.mp4",
				mediaType: "video",
				duration: 5500.7,
			});

			expect(result.success).toBe(true);
			expect(mockedGetThumbnailAsync).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({ time: 1000 })
			);
			expect(mockedUploadAsync).toHaveBeenCalledTimes(2);

			const thumbUploadArgs = mockedUploadAsync.mock.calls[1];
			expect(thumbUploadArgs[0]).toMatch(
				/\/storage\/v1\/object\/thumbnails\/event1\/user1\/\d+_[a-z0-9]+_thumb\.jpg$/
			);
			expect(thumbUploadArgs[1]).toBe("file:///thumb.jpg");

			const insertCall = mockInsert.mock.calls[0][0];
			expect(insertCall.media_type).toBe("video");
			expect(insertCall.duration_milliseconds).toBe(Math.round(5500.7));
			expect(insertCall.thumbnail_path).toMatch(/^event1\/user1\/\d+_[a-z0-9]+_thumb\.jpg$/);
		});

		it("sanitizes decorated picker URIs before deriving the upload extension", async () => {
			const { mockInsert } = setupDbMock();
			mockedGetInfoAsync.mockImplementation(async (uri: string) => {
				if (uri.includes("#")) {
					return { exists: false, isDirectory: false } as any;
				}
				return {
					exists: true,
					isDirectory: false,
					uri,
					size: 8,
					modificationTime: Date.now(),
				} as any;
			});
			mockedGetThumbnailAsync.mockResolvedValue({
				uri: "file:///thumb.jpg",
				width: 320,
				height: 240,
			});

			const result = await uploadMedia({
				...baseUploadOptions,
				uri: "file:///tmp/clip.mov#security-scoped-token",
				mediaType: "video",
				duration: 3000,
			});

			expect(result.success).toBe(true);
			expect(mockedUploadAsync.mock.calls[0][1]).toBe("file:///tmp/clip.mov");
			const insertCall = mockInsert.mock.calls[0][0];
			expect(insertCall.storage_path).toMatch(/^event1\/user1\/\d+_[a-z0-9]+\.mov$/);
		});

		it("allows video uploads to stay in flight longer than the photo timeout", async () => {
			jest.useFakeTimers();
			setupDbMock();
			mockedGetThumbnailAsync.mockResolvedValue({
				uri: "file:///thumb.jpg",
				width: 320,
				height: 240,
			});

			mockedUploadAsync
				.mockImplementationOnce(
					() =>
						new Promise((resolve) => {
							setTimeout(
								() => resolve(mockNativeUploadResponse({ Key: "event1/user1/123.mp4" }) as any),
								3 * 60 * 1000
							);
						})
				)
				.mockResolvedValueOnce(
					mockNativeUploadResponse({ Key: "event1/user1/123_thumb.jpg" }) as any
				);

			const uploadPromise = uploadMedia({
				...baseUploadOptions,
				uri: "file:///video.mp4",
				mediaType: "video",
				duration: 5500,
			});

			await jest.advanceTimersByTimeAsync(3 * 60 * 1000);
			const result = await uploadPromise;

			expect(result.success).toBe(true);
		});

		it("returns error when storage upload fails", async () => {
			const { mockInsert } = setupDbMock();
			mockedUploadAsync.mockResolvedValueOnce({
				status: 400,
				headers: {},
				mimeType: "application/json",
				body: JSON.stringify({ message: "Storage full" }),
			} as any);

			const result = await uploadMedia({ ...baseUploadOptions, mediaType: "photo" });

			expect(result).toEqual(
				expect.objectContaining({ success: false, error: "Storage full", failureReason: "storage" })
			);
			expect(mockInsert).not.toHaveBeenCalled();
		});

		it("surfaces native upload timeouts as timeout failures", async () => {
			jest.useFakeTimers();
			const { mockInsert } = setupDbMock();
			mockedUploadAsync.mockImplementation(() => new Promise(() => {}));

			const uploadPromise = uploadMedia({ ...baseUploadOptions, mediaType: "photo" });
			await jest.advanceTimersByTimeAsync(2 * 60 * 1000);
			const result = await uploadPromise;

			expect(result).toEqual(
				expect.objectContaining({ success: false, error: "timeout", failureReason: "timeout" })
			);
			expect(mockInsert).not.toHaveBeenCalled();
		});

		it("cleans up storage files when DB insert fails for photo", async () => {
			const mockRemove = jest.fn().mockResolvedValue({ error: null });
			mockedSupabase.storage.from.mockReturnValue({
				remove: mockRemove,
			});
			setupDbMock({ insertError: { message: "DB error" } });

			const result = await uploadMedia({ ...baseUploadOptions, mediaType: "photo" });

			expect(result).toEqual(
				expect.objectContaining({ success: false, error: "DB error", failureReason: "database" })
			);
			expect(mockRemove).toHaveBeenCalledWith([
				expect.stringMatching(/^event1\/user1\/\d+_[a-z0-9]+\.jpg$/),
			]);
			expect(mockedSupabase.storage.from).not.toHaveBeenCalledWith("thumbnails");
		});

		it("cleans up both video and thumbnail when DB insert fails for video", async () => {
			const mockRemove = jest.fn().mockResolvedValue({ error: null });

			mockedSupabase.storage.from.mockReturnValue({
				remove: mockRemove,
			});

			setupDbMock({ insertError: { message: "DB error" } });

			mockedGetThumbnailAsync.mockResolvedValue({
				uri: "file:///thumb.jpg",
				width: 320,
				height: 240,
			});

			const result = await uploadMedia({
				...baseUploadOptions,
				uri: "file:///video.mp4",
				mediaType: "video",
				duration: 3000,
			});

			expect(result).toEqual(
				expect.objectContaining({ success: false, error: "DB error", failureReason: "database" })
			);
			expect(mockRemove).toHaveBeenCalledWith([
				expect.stringMatching(/^event1\/user1\/\d+_[a-z0-9]+\.mp4$/),
			]);
			expect(mockRemove).toHaveBeenCalledWith([
				expect.stringMatching(/^event1\/user1\/\d+_[a-z0-9]+_thumb\.jpg$/),
			]);
			expect(mockedSupabase.storage.from).toHaveBeenCalledWith("thumbnails");
		});

		it("continues with null thumbnail when getThumbnailAsync throws", async () => {
			const mockUpload = jest
				.fn()
				.mockResolvedValueOnce({ data: { path: "event1/user1/123.mp4" }, error: null });

			mockedSupabase.storage.from.mockReturnValue({
				upload: mockUpload,
				remove: jest.fn(),
			});

			const { mockInsert } = setupDbMock();

			mockedGetThumbnailAsync.mockRejectedValue(new Error("Thumbnail generation failed"));

			const result = await uploadMedia({
				...baseUploadOptions,
				uri: "file:///video.mp4",
				mediaType: "video",
				duration: 3000,
			});

			expect(result.success).toBe(true);
			const insertData = mockInsert.mock.calls[0][0];
			expect(insertData.thumbnail_path).toBeNull();
		});

		it("resolves ph:// URIs via getAssetInfoAsync", async () => {
			setupStorageMock();
			setupDbMock();

			mockedGetAssetInfoAsync.mockResolvedValue({
				localUri: "file:///resolved/photo.jpg",
			} as any);

			const result = await uploadMedia({
				...baseUploadOptions,
				uri: "ph://ABC-DEF-123/L0/001",
			});

			expect(result.success).toBe(true);
			expect(mockedGetAssetInfoAsync).toHaveBeenCalled();
		});

		it("uploads HEIC photos with the correct content type", async () => {
			setupDbMock();

			const result = await uploadMedia({
				...baseUploadOptions,
				uri: "file:///photos/photo.heic",
				mediaType: "photo",
			});

			expect(result.success).toBe(true);
			expect(mockedUploadAsync).toHaveBeenCalledWith(
				expect.stringMatching(
					/\/storage\/v1\/object\/event-photos\/event1\/user1\/\d+_[a-z0-9]+\.heic$/
				),
				"file:///photos/photo.heic",
				expect.objectContaining({
					headers: expect.objectContaining({ "content-type": "image/heic" }),
				})
			);
		});

		it("rejects empty local files instead of creating broken uploads", async () => {
			const { mockInsert } = setupDbMock();

			const result = await uploadMedia({
				...baseUploadOptions,
				mediaType: "photo",
				fileSize: 0,
			});

			expect(result).toEqual(
				expect.objectContaining({
					success: false,
					error: "Selected file is empty",
					failureReason: "storage",
				})
			);
			expect(mockedUploadAsync).not.toHaveBeenCalled();
			expect(mockInsert).not.toHaveBeenCalled();
		});

		it("stores photos without a thumbnail path", async () => {
			const { mockInsert } = setupDbMock();

			const result = await uploadMedia({
				...baseUploadOptions,
				mediaType: "photo",
			});

			expect(result.success).toBe(true);
			const insertData = mockInsert.mock.calls[0][0];
			expect(insertData.thumbnail_path).toBeNull();
		});
	});

	describe("createVideoThumbnailUri", () => {
		it("resolves iOS asset URIs before generating thumbnails", async () => {
			mockedGetAssetInfoAsync.mockResolvedValue({
				localUri: "file:///resolved-video.mov",
			} as any);
			mockedGetThumbnailAsync.mockResolvedValue({
				uri: "file:///thumb.jpg",
				width: 320,
				height: 240,
			});

			const result = await createVideoThumbnailUri("ph://ABC123/L0/001", 0);

			expect(result).toBe("file:///thumb.jpg");
			expect(mockedGetAssetInfoAsync).toHaveBeenCalledWith("ABC123", {
				shouldDownloadFromNetwork: true,
			});
			expect(mockedGetThumbnailAsync).toHaveBeenCalledWith(
				"file:///resolved-video.mov",
				expect.objectContaining({ time: 0 })
			);
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

		it("returns null on non-200 status", async () => {
			mockedDownloadAsync.mockResolvedValue({
				status: 404,
				uri: "/cache/photo.jpg",
				headers: {},
				mimeType: null,
				md5: undefined,
			});

			const result = await downloadPhoto("some/path.jpg", "photo.jpg");
			expect(result).toBeNull();
		});

		it("returns null when downloadAsync throws", async () => {
			mockedDownloadAsync.mockRejectedValue(new Error("Network error"));

			const result = await downloadPhoto("some/path.jpg", "photo.jpg");
			expect(result).toBeNull();
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
});
