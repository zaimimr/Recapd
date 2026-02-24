import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";

export interface LocalPhoto {
	id: string;
	uri: string;
	filename: string;
	creationTime: number;
	width: number;
	height: number;
	duration: number;
	mediaType: "photo" | "video";
	latitude?: number;
	longitude?: number;
}

export async function requestMediaPermissions(): Promise<boolean> {
	const { status } = await MediaLibrary.requestPermissionsAsync();
	return status === "granted";
}

export { FREE_MAX_VIDEO_DURATION_MS, PRO_MAX_VIDEO_DURATION_MS } from "@/types/subscription";

// Batch size for processing asset info (prevents too many concurrent API calls)
const ASSET_INFO_BATCH_SIZE = 10;

// iOS MediaLibrary returns duration in seconds, Android also returns seconds.
// ImagePicker on iOS returns duration in milliseconds, Android in seconds.
function durationToMs(seconds: number): number {
	if (!seconds) return 0;
	// If value is already clearly in ms (>= 1000), don't convert.
	// No phone video is realistically >= 1000 seconds (~17 min) from auto-scan.
	if (seconds >= 1000) return seconds;
	return seconds * 1000;
}

/**
 * Process items in batches to prevent memory issues and API overload
 */
async function batchProcess<T, R>(
	items: T[],
	batchSize: number,
	processor: (item: T) => Promise<R>
): Promise<R[]> {
	const results: R[] = [];

	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		const batchResults = await Promise.all(batch.map(processor));
		results.push(...batchResults);
	}

	return results;
}

export async function getMediaInTimeRange(
	startTime: Date,
	endTime: Date,
	limit: number = 1000,
	includeVideos: boolean = true
): Promise<LocalPhoto[]> {
	const hasPermission = await requestMediaPermissions();
	if (!hasPermission) return [];

	const mediaTypes: MediaLibrary.MediaTypeValue[] = includeVideos ? ["photo", "video"] : ["photo"];

	const startTimestamp = startTime.getTime();
	const endTimestamp = endTime.getTime();

	// Use pagination to fetch assets in chunks
	const PAGE_SIZE = 100;
	const allFilteredAssets: MediaLibrary.Asset[] = [];
	let cursor: string | undefined;
	let hasMore = true;

	while (hasMore && allFilteredAssets.length < limit) {
		const result = await MediaLibrary.getAssetsAsync({
			mediaType: mediaTypes,
			sortBy: [MediaLibrary.SortBy.creationTime],
			first: PAGE_SIZE,
			after: cursor,
		});

		// Filter assets by time range
		const filtered = result.assets.filter((asset) => {
			const created = asset.creationTime;
			return created >= startTimestamp && created <= endTimestamp;
		});

		allFilteredAssets.push(...filtered);

		// Check if we should continue pagination
		hasMore = result.hasNextPage;
		cursor = result.endCursor;

		// Stop if oldest asset in this batch is before our start time
		// (since assets are sorted by creation time)
		if (result.assets.length > 0) {
			const oldestInBatch = Math.min(...result.assets.map((a) => a.creationTime));
			if (oldestInBatch < startTimestamp) {
				hasMore = false;
			}
		}
	}

	// Trim to limit
	const assetsToProcess = allFilteredAssets.slice(0, limit);

	// Process asset info in batches to prevent memory issues
	const photosWithLocalUri = await batchProcess(
		assetsToProcess,
		ASSET_INFO_BATCH_SIZE,
		async (asset) => {
			const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
			return {
				id: asset.id,
				uri: assetInfo?.localUri || asset.uri,
				filename: asset.filename,
				creationTime: asset.creationTime,
				width: asset.width,
				height: asset.height,
				duration: durationToMs(assetInfo?.duration || asset.duration),
				mediaType: asset.mediaType === "photo" ? "photo" : ("video" as "photo" | "video"),
				latitude: assetInfo?.location?.latitude,
				longitude: assetInfo?.location?.longitude,
			};
		}
	);

	return photosWithLocalUri;
}

export async function getPhotosInTimeRange(
	startTime: Date,
	endTime: Date,
	limit: number = 1000
): Promise<LocalPhoto[]> {
	return getMediaInTimeRange(startTime, endTime, limit, false);
}

export async function saveToLibrary(uri: string): Promise<MediaLibrary.Asset | null> {
	try {
		const hasPermission = await requestMediaPermissions();
		if (!hasPermission) return null;

		const asset = await MediaLibrary.createAssetAsync(uri);
		return asset;
	} catch (error) {
		console.error("Save to library error:", error);
		return null;
	}
}

export interface PickMediaOptions {
	includeVideos?: boolean;
	maxVideoDuration?: number;
}

export interface PickMediaResult {
	media: LocalPhoto[];
	videosFiltered: boolean;
	videosTooLong: number;
}

export async function pickMediaFromLibrary(
	options: PickMediaOptions = {}
): Promise<PickMediaResult> {
	const { includeVideos = true, maxVideoDuration = 0 } = options;

	const mediaTypes: ImagePicker.MediaType[] = includeVideos ? ["images", "videos"] : ["images"];

	const result = await ImagePicker.launchImageLibraryAsync({
		mediaTypes,
		allowsMultipleSelection: true,
		quality: 1,
		exif: true,
		videoMaxDuration: maxVideoDuration > 0 ? maxVideoDuration : undefined,
	});

	if (result.canceled || !result.assets) {
		return { media: [], videosFiltered: false, videosTooLong: 0 };
	}

	let videosTooLong = 0;
	const validAssets = result.assets.filter((asset) => {
		if (asset.type === "video" && !includeVideos) {
			return false;
		}
		if (asset.type === "video" && maxVideoDuration > 0) {
			const durationMs = durationToMs(asset.duration || 0);
			if (durationMs > maxVideoDuration) {
				videosTooLong++;
				return false;
			}
		}
		return true;
	});

	const videosFiltered = !includeVideos && result.assets.some((a) => a.type === "video");

	const media = validAssets.map((asset, index) => {
		let creationTime = Date.now();
		let latitude: number | undefined;
		let longitude: number | undefined;

		if (asset.exif) {
			const exifDate =
				asset.exif.DateTimeOriginal || asset.exif.DateTimeDigitized || asset.exif.DateTime;

			if (exifDate && typeof exifDate === "string") {
				const isoDate = exifDate.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3").replace(" ", "T");
				const parsed = new Date(isoDate).getTime();
				if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 8640000000000000) {
					creationTime = parsed;
				}
			}

			const rawLat = asset.exif.GPSLatitude;
			const rawLng = asset.exif.GPSLongitude;
			if (typeof rawLat === "number" && typeof rawLng === "number") {
				latitude = asset.exif.GPSLatitudeRef === "S" ? -rawLat : rawLat;
				longitude = asset.exif.GPSLongitudeRef === "W" ? -rawLng : rawLng;
			}
		}

		const isVideo = asset.type === "video";
		const defaultExt = isVideo ? "mp4" : "jpg";

		return {
			id: `manual-${Date.now()}-${index}`,
			uri: asset.uri,
			filename: asset.fileName || `${isVideo ? "video" : "photo"}-${index}.${defaultExt}`,
			creationTime,
			width: asset.width,
			height: asset.height,
			duration: durationToMs(asset.duration || 0),
			mediaType: (isVideo ? "video" : "photo") as "photo" | "video",
			latitude,
			longitude,
		};
	});

	return { media, videosFiltered, videosTooLong };
}

export async function pickPhotosFromLibrary(): Promise<{
	photos: LocalPhoto[];
	videosFiltered: boolean;
}> {
	const result = await pickMediaFromLibrary({ includeVideos: false });
	return { photos: result.media, videosFiltered: result.videosFiltered };
}
