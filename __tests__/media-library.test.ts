jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: {
		getItem: jest.fn(),
		setItem: jest.fn(),
		removeItem: jest.fn(),
	},
}));
jest.mock("expo-media-library", () => ({
	requestPermissionsAsync: jest.fn(),
	getAssetsAsync: jest.fn(),
	getAssetInfoAsync: jest.fn(),
	createAssetAsync: jest.fn(),
	SortBy: { creationTime: "creationTime" },
}));
jest.mock("expo-image-picker", () => ({
	launchImageLibraryAsync: jest.fn(),
	UIImagePickerPreferredAssetRepresentationMode: {
		Automatic: "automatic",
		Current: "current",
	},
}));

import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import {
	FREE_MAX_VIDEO_DURATION_MS,
	getMediaInTimeRange,
	getPhotosInTimeRange,
	PRO_MAX_VIDEO_DURATION_MS,
	pickMediaFromLibrary,
} from "@/lib/mediaLibrary";

const mockRequestPermissions = MediaLibrary.requestPermissionsAsync as jest.Mock;
const mockGetAssets = MediaLibrary.getAssetsAsync as jest.Mock;
const mockGetAssetInfo = MediaLibrary.getAssetInfoAsync as jest.Mock;
const mockLaunchImageLibrary = ImagePicker.launchImageLibraryAsync as jest.Mock;

const generateAssets = (count: number, startTime: number) =>
	Array.from({ length: count }, (_, i) => ({
		id: `asset-${i}`,
		uri: `ph://asset-${i}`,
		filename: `IMG_${i}.jpg`,
		creationTime: startTime + i * 1000,
		width: 1920,
		height: 1080,
		duration: 0,
		mediaType: "photo" as const,
	}));

function grantPermissions() {
	mockRequestPermissions.mockResolvedValue({ status: "granted" });
}

function setupAssetInfo() {
	mockGetAssetInfo.mockImplementation((id: string) =>
		Promise.resolve({ localUri: `file:///local/${id}` })
	);
}

beforeEach(() => {
	jest.clearAllMocks();
});

describe("constants", () => {
	it("PRO_MAX_VIDEO_DURATION_MS is 300000", () => {
		expect(PRO_MAX_VIDEO_DURATION_MS).toBe(300000);
	});

	it("FREE_MAX_VIDEO_DURATION_MS is 30000", () => {
		expect(FREE_MAX_VIDEO_DURATION_MS).toBe(30000);
	});
});

describe("getMediaInTimeRange", () => {
	const start = new Date("2024-01-01T00:00:00Z");
	const end = new Date("2024-01-02T00:00:00Z");
	const startMs = start.getTime();
	const endMs = end.getTime();

	it("returns empty array when permission is denied", async () => {
		mockRequestPermissions.mockResolvedValue({ status: "denied" });

		const result = await getMediaInTimeRange(start, end);

		expect(result).toEqual([]);
		expect(mockGetAssets).not.toHaveBeenCalled();
	});

	it("returns empty array when no photos are in range", async () => {
		grantPermissions();
		setupAssetInfo();

		const outsideAssets = generateAssets(3, endMs + 100000);
		mockGetAssets.mockResolvedValue({
			assets: outsideAssets,
			hasNextPage: false,
			endCursor: undefined,
		});

		const result = await getMediaInTimeRange(start, end);

		expect(result).toEqual([]);
	});

	it("returns LocalPhoto objects for 5 photos in range", async () => {
		grantPermissions();
		setupAssetInfo();

		const assets = generateAssets(5, startMs + 1000);
		mockGetAssets.mockResolvedValue({
			assets,
			hasNextPage: false,
			endCursor: undefined,
		});

		const result = await getMediaInTimeRange(start, end);

		expect(result).toHaveLength(5);
		result.forEach((photo, i) => {
			expect(photo.id).toBe(`asset-${i}`);
			expect(photo.uri).toBe(`file:///local/asset-${i}`);
			expect(photo.filename).toBe(`IMG_${i}.jpg`);
			expect(photo.creationTime).toBe(startMs + 1000 + i * 1000);
			expect(photo.width).toBe(1920);
			expect(photo.height).toBe(1080);
			expect(photo.duration).toBe(0);
			expect(photo.mediaType).toBe("photo");
		});
	});

	it("paginates through 150 items across two pages", async () => {
		grantPermissions();
		setupAssetInfo();

		const page1Assets = generateAssets(100, startMs + 1000);
		const page2Assets = Array.from({ length: 50 }, (_, i) => ({
			id: `asset-${100 + i}`,
			uri: `ph://asset-${100 + i}`,
			filename: `IMG_${100 + i}.jpg`,
			creationTime: startMs + 1000 + (100 + i) * 1000,
			width: 1920,
			height: 1080,
			duration: 0,
			mediaType: "photo" as const,
		}));

		mockGetAssets
			.mockResolvedValueOnce({
				assets: page1Assets,
				hasNextPage: true,
				endCursor: "cursor-100",
			})
			.mockResolvedValueOnce({
				assets: page2Assets,
				hasNextPage: false,
				endCursor: undefined,
			});

		const result = await getMediaInTimeRange(start, end);

		expect(mockGetAssets).toHaveBeenCalledTimes(2);
		expect(mockGetAssets).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ after: "cursor-100" })
		);
		expect(result).toHaveLength(150);
	});

	it("stops early when oldest asset is before startTime", async () => {
		grantPermissions();
		setupAssetInfo();

		const mixedAssets = [
			...generateAssets(3, startMs + 1000),
			{
				id: "old-asset",
				uri: "ph://old",
				filename: "OLD.jpg",
				creationTime: startMs - 100000,
				width: 1920,
				height: 1080,
				duration: 0,
				mediaType: "photo" as const,
			},
		];

		mockGetAssets.mockResolvedValue({
			assets: mixedAssets,
			hasNextPage: true,
			endCursor: "cursor-next",
		});

		const result = await getMediaInTimeRange(start, end);

		expect(mockGetAssets).toHaveBeenCalledTimes(1);
		expect(result).toHaveLength(3);
	});

	it("respects the limit parameter", async () => {
		grantPermissions();
		setupAssetInfo();

		const assets = generateAssets(20, startMs + 1000);
		mockGetAssets.mockResolvedValue({
			assets,
			hasNextPage: false,
			endCursor: undefined,
		});

		const result = await getMediaInTimeRange(start, end, 5);

		expect(result).toHaveLength(5);
	});

	it("requests only photos when includeVideos is false", async () => {
		grantPermissions();
		setupAssetInfo();

		mockGetAssets.mockResolvedValue({
			assets: [],
			hasNextPage: false,
			endCursor: undefined,
		});

		await getMediaInTimeRange(start, end, 1000, false);

		expect(mockGetAssets).toHaveBeenCalledWith(expect.objectContaining({ mediaType: ["photo"] }));
	});

	it("handles 1000 items across 10 pages with batch processing", async () => {
		grantPermissions();
		setupAssetInfo();

		for (let page = 0; page < 10; page++) {
			const pageAssets = Array.from({ length: 100 }, (_, i) => {
				const idx = page * 100 + i;
				return {
					id: `asset-${idx}`,
					uri: `ph://asset-${idx}`,
					filename: `IMG_${idx}.jpg`,
					creationTime: startMs + 1000 + idx * 1000,
					width: 1920,
					height: 1080,
					duration: 0,
					mediaType: "photo" as const,
				};
			});

			mockGetAssets.mockResolvedValueOnce({
				assets: pageAssets,
				hasNextPage: page < 9,
				endCursor: page < 9 ? `cursor-${(page + 1) * 100}` : undefined,
			});
		}

		const result = await getMediaInTimeRange(start, end);

		expect(mockGetAssets).toHaveBeenCalledTimes(10);
		expect(mockGetAssetInfo).toHaveBeenCalledTimes(1000);
		expect(result).toHaveLength(1000);

		result.forEach((photo, i) => {
			expect(photo.id).toBe(`asset-${i}`);
			expect(photo.uri).toBe(`file:///local/asset-${i}`);
		});
	});

	it("returns video assets with correct mediaType and duration", async () => {
		grantPermissions();
		setupAssetInfo();

		const videoAsset = {
			id: "video-1",
			uri: "ph://video-1",
			filename: "VID_001.mp4",
			creationTime: startMs + 5000,
			width: 1920,
			height: 1080,
			duration: 15.5,
			mediaType: "video" as const,
		};

		mockGetAssets.mockResolvedValue({
			assets: [videoAsset],
			hasNextPage: false,
			endCursor: undefined,
		});

		const result = await getMediaInTimeRange(start, end);

		expect(result).toHaveLength(1);
		expect(result[0].mediaType).toBe("video");
		expect(result[0].duration).toBe(15500);
	});
});

describe("getPhotosInTimeRange", () => {
	const start = new Date("2024-01-01T00:00:00Z");
	const end = new Date("2024-01-02T00:00:00Z");

	it("calls getMediaInTimeRange with includeVideos=false", async () => {
		grantPermissions();
		setupAssetInfo();

		mockGetAssets.mockResolvedValue({
			assets: [],
			hasNextPage: false,
			endCursor: undefined,
		});

		await getPhotosInTimeRange(start, end);

		expect(mockGetAssets).toHaveBeenCalledWith(expect.objectContaining({ mediaType: ["photo"] }));
	});
});

describe("pickMediaFromLibrary", () => {
	it("returns empty result when user cancels", async () => {
		mockLaunchImageLibrary.mockResolvedValue({ canceled: true });

		const result = await pickMediaFromLibrary();

		expect(result).toEqual({
			media: [],
			videosFiltered: false,
			videosTooLong: 0,
			filesTooLarge: 0,
			iCloudUnavailable: 0,
		});
	});

	it("returns photo media with correct fields", async () => {
		const _now = Date.now();
		mockLaunchImageLibrary.mockResolvedValue({
			canceled: false,
			assets: [
				{
					uri: "file:///photo1.jpg",
					fileName: "photo1.jpg",
					width: 3024,
					height: 4032,
					type: "image",
					duration: null,
					exif: { DateTimeOriginal: "2024:06:15 10:30:00" },
				},
			],
		});

		const result = await pickMediaFromLibrary();

		expect(result.media).toHaveLength(1);
		const photo = result.media[0];
		expect(photo.uri).toBe("file:///photo1.jpg");
		expect(photo.filename).toBe("photo1.jpg");
		expect(photo.width).toBe(3024);
		expect(photo.height).toBe(4032);
		expect(photo.mediaType).toBe("photo");
		expect(photo.duration).toBe(0);
		expect(photo.creationTime).toBe(new Date("2024-06-15T10:30:00").getTime());
	});

	it("excludes videos exceeding maxVideoDuration", async () => {
		mockLaunchImageLibrary.mockResolvedValue({
			canceled: false,
			assets: [
				{
					uri: "file:///long.mp4",
					fileName: "long.mp4",
					width: 1920,
					height: 1080,
					type: "video",
					duration: 45,
					exif: null,
				},
			],
		});

		const result = await pickMediaFromLibrary({ maxVideoDuration: 30 });

		expect(result.media).toHaveLength(0);
		expect(result.videosTooLong).toBe(1);
	});

	it("includes videos within maxVideoDuration", async () => {
		mockLaunchImageLibrary.mockResolvedValue({
			canceled: false,
			assets: [
				{
					uri: "file:///short.mp4",
					fileName: "short.mp4",
					width: 1920,
					height: 1080,
					type: "video",
					duration: 25,
					exif: null,
				},
			],
		});

		const result = await pickMediaFromLibrary({ maxVideoDuration: 30 });

		expect(result.media).toHaveLength(1);
		expect(result.media[0].mediaType).toBe("video");
		expect(result.media[0].duration).toBe(25000);
	});

	it("counts multiple long videos", async () => {
		mockLaunchImageLibrary.mockResolvedValue({
			canceled: false,
			assets: [
				{
					uri: "file:///v1.mp4",
					fileName: "v1.mp4",
					width: 1920,
					height: 1080,
					type: "video",
					duration: 60,
					exif: null,
				},
				{
					uri: "file:///v2.mp4",
					fileName: "v2.mp4",
					width: 1920,
					height: 1080,
					type: "video",
					duration: 90,
					exif: null,
				},
				{
					uri: "file:///v3.mp4",
					fileName: "v3.mp4",
					width: 1920,
					height: 1080,
					type: "video",
					duration: 120,
					exif: null,
				},
			],
		});

		const result = await pickMediaFromLibrary({ maxVideoDuration: 30 });

		expect(result.media).toHaveLength(0);
		expect(result.videosTooLong).toBe(3);
	});

	it("parses EXIF DateTimeOriginal correctly", async () => {
		mockLaunchImageLibrary.mockResolvedValue({
			canceled: false,
			assets: [
				{
					uri: "file:///exif.jpg",
					fileName: "exif.jpg",
					width: 1920,
					height: 1080,
					type: "image",
					duration: null,
					exif: { DateTimeOriginal: "2024:01:15 14:30:00" },
				},
			],
		});

		const result = await pickMediaFromLibrary();

		expect(result.media[0].creationTime).toBe(new Date("2024-01-15T14:30:00").getTime());
	});

	it("falls back to Date.now() when EXIF is missing", async () => {
		const before = Date.now();
		mockLaunchImageLibrary.mockResolvedValue({
			canceled: false,
			assets: [
				{
					uri: "file:///noexif.jpg",
					fileName: "noexif.jpg",
					width: 1920,
					height: 1080,
					type: "image",
					duration: null,
					exif: null,
				},
			],
		});

		const result = await pickMediaFromLibrary();
		const after = Date.now();

		expect(result.media[0].creationTime).toBeGreaterThanOrEqual(before);
		expect(result.media[0].creationTime).toBeLessThanOrEqual(after);
	});

	it("falls back to Date.now() when EXIF date is invalid (NaN)", async () => {
		const before = Date.now();
		mockLaunchImageLibrary.mockResolvedValue({
			canceled: false,
			assets: [
				{
					uri: "file:///bad.jpg",
					fileName: "bad.jpg",
					width: 1920,
					height: 1080,
					type: "image",
					duration: null,
					exif: { DateTimeOriginal: "not-a-date" },
				},
			],
		});

		const result = await pickMediaFromLibrary();
		const after = Date.now();

		expect(result.media[0].creationTime).toBeGreaterThanOrEqual(before);
		expect(result.media[0].creationTime).toBeLessThanOrEqual(after);
	});

	it("uses only images mediaType when includeVideos is false", async () => {
		mockLaunchImageLibrary.mockResolvedValue({
			canceled: false,
			assets: [
				{
					uri: "file:///photo.jpg",
					fileName: "photo.jpg",
					width: 1920,
					height: 1080,
					type: "image",
					duration: null,
					exif: null,
				},
			],
		});

		await pickMediaFromLibrary({ includeVideos: false });

		expect(mockLaunchImageLibrary).toHaveBeenCalledWith(
			expect.objectContaining({
				mediaTypes: ["images"],
				preferredAssetRepresentationMode: "current",
			})
		);
	});

	it("returns a user-facing error when iOS Photos rejects the selection", async () => {
		mockLaunchImageLibrary.mockRejectedValue(
			new Error("The operation couldn’t be completed. (PHPhotosErrorDomain error 3164.)")
		);

		const result = await pickMediaFromLibrary();

		expect(result).toEqual({
			media: [],
			videosFiltered: false,
			videosTooLong: 0,
			filesTooLarge: 0,
			iCloudUnavailable: 0,
			error:
				"iCloud photos could not be loaded. Open them in Photos first so they download to this device, then try again.",
		});
	});

	it("sets videosFiltered when includeVideos is false and result has videos", async () => {
		mockLaunchImageLibrary.mockResolvedValue({
			canceled: false,
			assets: [
				{
					uri: "file:///photo.jpg",
					fileName: "photo.jpg",
					width: 1920,
					height: 1080,
					type: "image",
					duration: null,
					exif: null,
				},
				{
					uri: "file:///vid.mp4",
					fileName: "vid.mp4",
					width: 1920,
					height: 1080,
					type: "video",
					duration: 10,
					exif: null,
				},
			],
		});

		const result = await pickMediaFromLibrary({ includeVideos: false });

		expect(result.videosFiltered).toBe(true);
		expect(result.media).toHaveLength(1);
		expect(result.media[0].mediaType).toBe("photo");
	});

	it("uses fallback filename when fileName is missing", async () => {
		mockLaunchImageLibrary.mockResolvedValue({
			canceled: false,
			assets: [
				{
					uri: "file:///unnamed-photo.jpg",
					fileName: null,
					width: 1920,
					height: 1080,
					type: "image",
					duration: null,
					exif: null,
				},
				{
					uri: "file:///unnamed-video.mp4",
					fileName: undefined,
					width: 1920,
					height: 1080,
					type: "video",
					duration: 5,
					exif: null,
				},
			],
		});

		const result = await pickMediaFromLibrary();

		expect(result.media[0].filename).toBe("photo-0.jpg");
		expect(result.media[1].filename).toBe("video-1.mp4");
	});
});
