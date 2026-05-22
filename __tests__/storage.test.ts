jest.mock("@/lib/supabase", () => ({
	supabase: {
		storage: { from: jest.fn() },
		from: jest.fn(),
		rpc: jest.fn().mockResolvedValue({ data: true, error: null }),
	},
}));
jest.mock("expo-file-system/legacy", () => ({
	readAsStringAsync: jest.fn(),
	downloadAsync: jest.fn(),
	getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 12345, uri: "" }),
	cacheDirectory: "/cache/",
	EncodingType: { Base64: "base64" },
}));
jest.mock("expo-media-library", () => ({
	getAssetInfoAsync: jest.fn(),
}));
jest.mock("expo-video-thumbnails", () => ({
	getThumbnailAsync: jest.fn(),
}));
jest.mock("base64-arraybuffer", () => ({
	decode: jest.fn().mockReturnValue(new ArrayBuffer(8)),
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
import { downloadAsync, readAsStringAsync } from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as VideoThumbnails from "expo-video-thumbnails";
import {
	downloadPhoto,
	getDownloadedPhotoIds,
	getPhotoUrl,
	isPhotoDownloaded,
	markPhotoDownloaded,
	uploadMedia,
} from "@/lib/storage";
import { supabase } from "@/lib/supabase";

const mockedSupabase = supabase as any;
const mockedReadAsStringAsync = readAsStringAsync as jest.MockedFunction<typeof readAsStringAsync>;
const mockedDownloadAsync = downloadAsync as jest.MockedFunction<typeof downloadAsync>;
const mockedGetAssetInfoAsync = MediaLibrary.getAssetInfoAsync as jest.MockedFunction<
	typeof MediaLibrary.getAssetInfoAsync
>;
const mockedGetThumbnailAsync = VideoThumbnails.getThumbnailAsync as jest.MockedFunction<
	typeof VideoThumbnails.getThumbnailAsync
>;
const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

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

	mockedSupabase.storage.from.mockReturnValue({
		upload: mockUpload,
		getPublicUrl: mockGetPublicUrl,
		remove: mockRemove,
	});

	return { mockUpload, mockGetPublicUrl, mockRemove };
}

function setupDbMock(overrides: { insertError?: any } = {}) {
	const mockInsert = jest.fn().mockReturnValue({
		error: overrides.insertError || null,
	});

	mockedSupabase.from.mockReturnValue({ insert: mockInsert });

	return { mockInsert };
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
		mockedReadAsStringAsync.mockResolvedValue("base64data");
	});

	describe("uploadMedia", () => {
		it("uploads a photo successfully", async () => {
			const { mockUpload } = setupStorageMock({ uploadPath: "event1/user1/123.jpg" });
			const { mockInsert } = setupDbMock();

			const result = await uploadMedia({ ...baseUploadOptions, mediaType: "photo" });

			expect(result.success).toBe(true);
			expect(result.path).toBe("event1/user1/123.jpg");
			expect(mockedReadAsStringAsync).toHaveBeenCalled();
			expect(mockUpload).toHaveBeenCalledTimes(1);

			const uploadCallArgs = mockUpload.mock.calls[0];
			expect(uploadCallArgs[0]).toMatch(/^event1\/user1\/\d+\.jpg$/);

			expect(mockInsert).toHaveBeenCalledWith(
				expect.objectContaining({
					event_id: "event1",
					uploaded_by_user_id: "user1",
					media_type: "photo",
					duration_milliseconds: null,
				})
			);
		});

		it("uploads a video with thumbnail", async () => {
			const mockUpload = jest
				.fn()
				.mockResolvedValueOnce({ data: { path: "event1/user1/123.mp4" }, error: null })
				.mockResolvedValueOnce({ data: { path: "event1/user1/123_thumb.jpg" }, error: null });

			mockedSupabase.storage.from.mockReturnValue({
				upload: mockUpload,
				remove: jest.fn(),
			});
			setupDbMock();

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
			expect(mockUpload).toHaveBeenCalledTimes(2);

			const thumbUploadArgs = mockUpload.mock.calls[1];
			expect(thumbUploadArgs[0]).toMatch(/_thumb\.jpg$/);

			const insertCall = mockedSupabase.from.mock.results[0].value.insert.mock.calls[0][0];
			expect(insertCall.media_type).toBe("video");
			expect(insertCall.duration_milliseconds).toBe(Math.round(5500.7));
			expect(insertCall.thumbnail_path).toBe("event1/user1/123_thumb.jpg");
		});

		it("returns error when storage upload fails", async () => {
			setupStorageMock({ uploadError: { message: "Storage full" } });
			const { mockInsert } = setupDbMock();

			const result = await uploadMedia({ ...baseUploadOptions, mediaType: "photo" });

			expect(result).toEqual({ success: false, error: "Storage full" });
			expect(mockInsert).not.toHaveBeenCalled();
		});

		it("cleans up storage files when DB insert fails for photo", async () => {
			const { mockRemove } = setupStorageMock({ uploadPath: "event1/user1/123.jpg" });
			setupDbMock({ insertError: { message: "DB error" } });

			const result = await uploadMedia({ ...baseUploadOptions, mediaType: "photo" });

			expect(result).toEqual({ success: false, error: "DB error" });
			expect(mockRemove).toHaveBeenCalledWith(["event1/user1/123.jpg"]);
		});

		it("cleans up both video and thumbnail when DB insert fails for video", async () => {
			const mockRemove = jest.fn().mockResolvedValue({ error: null });
			const mockUpload = jest
				.fn()
				.mockResolvedValueOnce({ data: { path: "event1/user1/123.mp4" }, error: null })
				.mockResolvedValueOnce({ data: { path: "event1/user1/123_thumb.jpg" }, error: null });

			mockedSupabase.storage.from.mockReturnValue({
				upload: mockUpload,
				remove: mockRemove,
			});

			const mockInsert = jest.fn().mockReturnValue({ error: { message: "DB error" } });
			mockedSupabase.from.mockReturnValue({ insert: mockInsert });

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

			expect(result).toEqual({ success: false, error: "DB error" });
			const removeCall = mockRemove.mock.calls[0][0];
			expect(removeCall).toHaveLength(2);
			expect(removeCall[0]).toMatch(/\.mp4$/);
			expect(removeCall[1]).toMatch(/_thumb\.jpg$/);
		});

		it("continues with null thumbnail when getThumbnailAsync throws", async () => {
			const mockUpload = jest
				.fn()
				.mockResolvedValueOnce({ data: { path: "event1/user1/123.mp4" }, error: null });

			mockedSupabase.storage.from.mockReturnValue({
				upload: mockUpload,
				remove: jest.fn(),
			});

			const mockInsert = jest.fn().mockReturnValue({ error: null });
			mockedSupabase.from.mockReturnValue({ insert: mockInsert });

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
			expect(mockedReadAsStringAsync).toHaveBeenCalledWith(
				"file:///resolved/photo.jpg",
				expect.any(Object)
			);
		});

		it("writes file_size_bytes from getInfoAsync, not base64 length", async () => {
			setupStorageMock({ uploadPath: "event1/user1/123.jpg" });
			const { mockInsert } = setupDbMock();

			await uploadMedia({ ...baseUploadOptions, mediaType: "photo" });

			expect(mockInsert).toHaveBeenCalledWith(
				expect.objectContaining({ file_size_bytes: 12345 })
			);
		});

		it("rejects video upload when can_upload_video RPC returns false", async () => {
			(mockedSupabase.rpc as jest.Mock).mockResolvedValueOnce({ data: false, error: null });
			const { mockInsert } = setupDbMock();
			const mockUpload = jest.fn();
			mockedSupabase.storage.from.mockReturnValue({ upload: mockUpload, remove: jest.fn() });

			const result = await uploadMedia({
				...baseUploadOptions,
				uri: "file:///video.mp4",
				mediaType: "video",
				duration: 60000,
			});

			expect(result.success).toBe(false);
			expect(result.error).toMatch(/duration/i);
			expect(mockedSupabase.rpc).toHaveBeenCalledWith("can_upload_video", {
				p_event_id: "event1",
				p_duration_seconds: 60,
			});
			expect(mockUpload).not.toHaveBeenCalled();
			expect(mockInsert).not.toHaveBeenCalled();
		});
	});

	describe("getPhotoUrl", () => {
		it("returns public URL from supabase", () => {
			const mockGetPublicUrl = jest.fn().mockReturnValue({
				data: { publicUrl: "https://cdn.example.com/photos/test.jpg" },
			});
			mockedSupabase.storage.from.mockReturnValue({ getPublicUrl: mockGetPublicUrl });

			const url = getPhotoUrl("photos/test.jpg");

			expect(url).toBe("https://cdn.example.com/photos/test.jpg");
			expect(mockedSupabase.storage.from).toHaveBeenCalledWith("event-photos");
			expect(mockGetPublicUrl).toHaveBeenCalledWith("photos/test.jpg");
		});
	});

	describe("downloadPhoto", () => {
		beforeEach(() => {
			const mockGetPublicUrl = jest.fn().mockReturnValue({
				data: { publicUrl: "https://cdn.example.com/photo.jpg" },
			});
			mockedSupabase.storage.from.mockReturnValue({ getPublicUrl: mockGetPublicUrl });
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
				"/cache/photo.jpg"
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
