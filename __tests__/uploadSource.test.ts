jest.mock("expo-file-system/legacy", () => ({
	copyAsync: jest.fn(),
	deleteAsync: jest.fn(),
	documentDirectory: "file:///documents/",
	getFreeDiskStorageAsync: jest.fn(),
	getInfoAsync: jest.fn(),
	makeDirectoryAsync: jest.fn(),
}));
jest.mock("expo-media-library", () => ({
	getAssetInfoAsync: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

import {
	copyAsync,
	deleteAsync,
	getFreeDiskStorageAsync,
	getInfoAsync,
	makeDirectoryAsync,
} from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import {
	cleanupOrphanedUploadSources,
	materializeUploadSource,
	UploadSourceUnavailableError,
} from "@/lib/uploadSource";

const mockedCopyAsync = copyAsync as jest.MockedFunction<typeof copyAsync>;
const mockedDeleteAsync = deleteAsync as jest.MockedFunction<typeof deleteAsync>;
const mockedGetFreeDiskStorageAsync = getFreeDiskStorageAsync as jest.MockedFunction<
	typeof getFreeDiskStorageAsync
>;
const mockedGetInfoAsync = getInfoAsync as jest.MockedFunction<typeof getInfoAsync>;
const mockedMakeDirectoryAsync = makeDirectoryAsync as jest.MockedFunction<
	typeof makeDirectoryAsync
>;
const mockedGetAssetInfoAsync = MediaLibrary.getAssetInfoAsync as jest.MockedFunction<
	typeof MediaLibrary.getAssetInfoAsync
>;

describe("materializeUploadSource", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockedCopyAsync.mockResolvedValue(undefined as any);
		mockedDeleteAsync.mockResolvedValue(undefined as any);
		mockedMakeDirectoryAsync.mockResolvedValue(undefined as any);
		mockedGetFreeDiskStorageAsync.mockResolvedValue(50 * 1024 * 1024 * 1024);
	});

	it("uses doc-dir files in place without copy", async () => {
		mockedGetInfoAsync.mockResolvedValue({
			exists: true,
			isDirectory: false,
			size: 12345,
		} as any);

		const result = await materializeUploadSource({
			uri: "file:///documents/upload-sources/upl_x.jpg",
			uploadId: "upl_x",
			mediaType: "photo",
		});

		expect(result.path).toBe("file:///documents/upload-sources/upl_x.jpg");
		expect(result.size).toBe(12345);
		expect(mockedCopyAsync).not.toHaveBeenCalled();

		await result.cleanup();
		expect(mockedDeleteAsync).not.toHaveBeenCalled();
	});

	it("copies Library/Caches sources into upload-sources dir", async () => {
		const sourceUri =
			"file:///var/mobile/Containers/Data/Application/X/Library/Caches/ImagePicker/abc.heic";
		mockedGetInfoAsync.mockImplementation(async (uri: any) => ({
			exists: true,
			isDirectory: false,
			size: 200_000,
			uri,
		} as any));

		const result = await materializeUploadSource({
			uri: sourceUri,
			uploadId: "upl_1",
			mediaType: "photo",
		});

		expect(result.path).toBe("file:///documents/upload-sources/upl_1.heic");
		expect(result.size).toBe(200_000);
		expect(mockedMakeDirectoryAsync).toHaveBeenCalledWith(
			"file:///documents/upload-sources/",
			{ intermediates: true }
		);
		expect(mockedCopyAsync).toHaveBeenCalledWith({
			from: sourceUri,
			to: "file:///documents/upload-sources/upl_1.heic",
		});

		await result.cleanup();
		expect(mockedDeleteAsync).toHaveBeenCalledWith(
			"file:///documents/upload-sources/upl_1.heic",
			{ idempotent: true }
		);
	});

	it("recovers via PHAsset when source file is gone", async () => {
		const missingUri = "file:///cache/Library/Caches/ImagePicker/missing.jpg";
		const recoveredUri = "file:///cache/recovered.jpg";

		mockedGetInfoAsync.mockImplementation(async (uri: any) => {
			if (uri === recoveredUri) {
				return { exists: true, isDirectory: false, size: 7777, uri } as any;
			}
			if (typeof uri === "string" && uri.startsWith("file:///documents/upload-sources/")) {
				return { exists: true, isDirectory: false, size: 7777, uri } as any;
			}
			return { exists: false, isDirectory: false, uri } as any;
		});
		mockedGetAssetInfoAsync.mockResolvedValue({ localUri: recoveredUri } as any);

		const result = await materializeUploadSource({
			uri: missingUri,
			assetId: "ph_123",
			uploadId: "upl_2",
			mediaType: "photo",
		});

		expect(mockedGetAssetInfoAsync).toHaveBeenCalledWith("ph_123", {
			shouldDownloadFromNetwork: true,
		});
		expect(result.path).toBe("file:///documents/upload-sources/upl_2.jpg");
		expect(result.size).toBe(7777);
	});

	it("resolves ph:// URIs through PHAsset directly", async () => {
		mockedGetAssetInfoAsync.mockResolvedValue({
			localUri: "file:///resolved/photo.heic",
		} as any);
		mockedGetInfoAsync.mockResolvedValue({
			exists: true,
			isDirectory: false,
			size: 50_000,
		} as any);

		const result = await materializeUploadSource({
			uri: "ph://ABC123/L0/001",
			uploadId: "upl_ph",
			mediaType: "photo",
		});

		expect(mockedGetAssetInfoAsync).toHaveBeenCalledWith("ABC123", {
			shouldDownloadFromNetwork: true,
		});
		expect(result.path).toBe("file:///documents/upload-sources/upl_ph.heic");
	});

	it("throws icloud error when PHAsset has no localUri", async () => {
		mockedGetAssetInfoAsync.mockResolvedValue({ localUri: null } as any);

		await expect(
			materializeUploadSource({
				uri: "ph://XYZ/L0/001",
				uploadId: "upl_q",
				mediaType: "photo",
			})
		).rejects.toMatchObject({
			name: "UploadSourceUnavailableError",
			reason: "icloud",
		});
	});

	it("throws disk error when free disk is below required headroom", async () => {
		mockedGetFreeDiskStorageAsync.mockResolvedValue(10 * 1024 * 1024);
		mockedGetInfoAsync.mockImplementation(async (uri: any) => ({
			exists: true,
			isDirectory: false,
			size: 100 * 1024 * 1024,
			uri,
		} as any));

		await expect(
			materializeUploadSource({
				uri: "file:///cache/Library/Caches/ImagePicker/huge.mp4",
				uploadId: "upl_big",
				mediaType: "video",
			})
		).rejects.toMatchObject({
			name: "UploadSourceUnavailableError",
			reason: "disk",
		});
	});

	it("handles content:// (Android) URIs via copy", async () => {
		mockedGetInfoAsync.mockResolvedValue({
			exists: true,
			isDirectory: false,
			size: 10_000,
		} as any);

		const result = await materializeUploadSource({
			uri: "content://media/external/images/media/42",
			uploadId: "upl_droid",
			mediaType: "photo",
		});

		expect(mockedCopyAsync).toHaveBeenCalledWith({
			from: "content://media/external/images/media/42",
			to: "file:///documents/upload-sources/upl_droid.jpg",
		});
		expect(result.path).toBe("file:///documents/upload-sources/upl_droid.jpg");
	});

	it("rejects empty source files instead of returning a broken handle", async () => {
		mockedGetInfoAsync.mockResolvedValue({
			exists: true,
			isDirectory: false,
			size: 0,
		} as any);

		await expect(
			materializeUploadSource({
				uri: "file:///cache/Library/Caches/empty.jpg",
				uploadId: "upl_zero",
				mediaType: "photo",
			})
		).rejects.toMatchObject({
			name: "UploadSourceUnavailableError",
			reason: "missing",
		});
	});

	it("strips #YnBsaXN0 security-scoped suffix before stating", async () => {
		const decorated =
			"file:///tmp/picker/asset.heic#YnBsaXN0MDDcAQIDBAUGBwgJCgsMDQ4P";
		mockedGetInfoAsync.mockResolvedValue({
			exists: true,
			isDirectory: false,
			size: 9999,
			uri: "file:///tmp/picker/asset.heic",
		} as any);

		const result = await materializeUploadSource({
			uri: decorated,
			uploadId: "upl_s",
			mediaType: "photo",
		});

		expect(mockedCopyAsync).toHaveBeenCalledWith({
			from: "file:///tmp/picker/asset.heic",
			to: "file:///documents/upload-sources/upl_s.heic",
		});
		expect(result.path).toBe("file:///documents/upload-sources/upl_s.heic");
	});

	it("classifies UploadSourceUnavailableError instances correctly", () => {
		const err = new UploadSourceUnavailableError("permission", "denied");
		expect(err.reason).toBe("permission");
		expect(err.name).toBe("UploadSourceUnavailableError");
		expect(err.message).toBe("denied");
	});
});

describe("cleanupOrphanedUploadSources", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockedDeleteAsync.mockResolvedValue(undefined as any);
		mockedMakeDirectoryAsync.mockResolvedValue(undefined as any);
	});

	it("removes the upload-sources dir when it exists", async () => {
		mockedGetInfoAsync.mockResolvedValue({ exists: true, isDirectory: true } as any);

		await cleanupOrphanedUploadSources();

		expect(mockedDeleteAsync).toHaveBeenCalledWith(
			"file:///documents/upload-sources/",
			{ idempotent: true }
		);
		expect(mockedMakeDirectoryAsync).toHaveBeenCalledWith(
			"file:///documents/upload-sources/",
			{ intermediates: true }
		);
	});

	it("is a no-op when the dir doesn't exist", async () => {
		mockedGetInfoAsync.mockResolvedValue({ exists: false } as any);

		await cleanupOrphanedUploadSources();

		expect(mockedDeleteAsync).not.toHaveBeenCalled();
	});
});
