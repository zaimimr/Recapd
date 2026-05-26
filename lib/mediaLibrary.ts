import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";

import { logger } from "@/lib/logger";

export interface LocalPhoto {
	id: string;
	uri: string;
	filename: string;
	creationTime: number;
	width: number;
	height: number;
	duration: number;
	fileSize?: number;
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
const DEFAULT_SCAN_TIMEOUT_MS = 20000;
const DEFAULT_SCAN_PADDING_MS = 0;
const DEFAULT_PAGE_SIZE = 100;

// iOS MediaLibrary returns duration in seconds, Android also returns seconds.
// ImagePicker on iOS returns duration in milliseconds, Android in seconds.
function durationToMs(seconds: number): number {
	if (!seconds) return 0;
	// If value is already clearly in ms (>= 1000), don't convert.
	// No phone video is realistically >= 1000 seconds (~17 min) from auto-scan.
	if (seconds >= 1000) return seconds;
	return seconds * 1000;
}

function normalizeMaxVideoDurationMs(maxVideoDuration: number): number {
	if (maxVideoDuration <= 0) return 0;
	return maxVideoDuration < 1000 ? maxVideoDuration * 1000 : maxVideoDuration;
}

function getPreferredAssetRepresentationMode() {
	return (
		ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.Current ??
		ImagePicker.UIImagePickerPreferredAssetRepresentationMode?.Automatic
	);
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

export interface MediaScanProgress {
	scannedPages: number;
	scannedAssets: number;
	matchedAssets: number;
	timedOut: boolean;
}

export interface MediaScanOptions {
	limit?: number;
	includeVideos?: boolean;
	timeoutMs?: number;
	paddingMs?: number;
	pageSize?: number;
	onProgress?: (progress: MediaScanProgress) => void;
}

export interface MediaScanResult {
	media: LocalPhoto[];
	timedOut: boolean;
	scannedPages: number;
	scannedAssets: number;
	iCloudUnavailable: number;
}

export async function scanMediaInTimeRange(
	startTime: Date,
	endTime: Date,
	options: MediaScanOptions = {}
): Promise<MediaScanResult> {
	const hasPermission = await requestMediaPermissions();
	if (!hasPermission) {
		return {
			media: [],
			timedOut: false,
			scannedPages: 0,
			scannedAssets: 0,
			iCloudUnavailable: 0,
		};
	}

	const {
		limit = 1000,
		includeVideos = true,
		timeoutMs = DEFAULT_SCAN_TIMEOUT_MS,
		paddingMs = DEFAULT_SCAN_PADDING_MS,
		pageSize = DEFAULT_PAGE_SIZE,
		onProgress,
	} = options;

	const mediaTypes: MediaLibrary.MediaTypeValue[] = includeVideos ? ["photo", "video"] : ["photo"];

	const startTimestamp = startTime.getTime() - paddingMs;
	const endTimestamp = endTime.getTime() + paddingMs;
	const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : Number.POSITIVE_INFINITY;

	// Use pagination to fetch assets in chunks
	const allFilteredAssets: MediaLibrary.Asset[] = [];
	let cursor: string | undefined;
	let hasMore = true;
	let scannedPages = 0;
	let scannedAssets = 0;

	while (hasMore && allFilteredAssets.length < limit) {
		if (Date.now() > deadline) {
			onProgress?.({
				scannedPages,
				scannedAssets,
				matchedAssets: allFilteredAssets.length,
				timedOut: true,
			});
			break;
		}

		const result = await MediaLibrary.getAssetsAsync({
			mediaType: mediaTypes,
			sortBy: [MediaLibrary.SortBy.creationTime],
			first: pageSize,
			after: cursor,
		});
		scannedPages += 1;
		scannedAssets += result.assets.length;

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

		onProgress?.({
			scannedPages,
			scannedAssets,
			matchedAssets: allFilteredAssets.length,
			timedOut: false,
		});
	}

	// Trim to limit
	const assetsToProcess = allFilteredAssets.slice(0, limit);

	let iCloudUnavailable = 0;

	const resolvedAssets = await batchProcess(
		assetsToProcess,
		ASSET_INFO_BATCH_SIZE,
		async (asset): Promise<LocalPhoto | null> => {
			const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id, {
				shouldDownloadFromNetwork: true,
			});
			const localUri = assetInfo?.localUri;
			if (!localUri) {
				iCloudUnavailable += 1;
				return null;
			}
			const assetFileSize =
				(assetInfo as { fileSize?: number } | null | undefined)?.fileSize ?? undefined;
			return {
				id: asset.id,
				uri: localUri,
				filename: asset.filename,
				creationTime: asset.creationTime,
				width: asset.width,
				height: asset.height,
				duration: durationToMs(assetInfo?.duration || asset.duration),
				fileSize: assetFileSize,
				mediaType: asset.mediaType === "photo" ? "photo" : ("video" as "photo" | "video"),
				latitude: assetInfo?.location?.latitude,
				longitude: assetInfo?.location?.longitude,
			};
		}
	);

	const photosWithLocalUri = resolvedAssets.filter((item): item is LocalPhoto => item !== null);

	return {
		media: photosWithLocalUri,
		timedOut: Date.now() > deadline,
		scannedPages,
		scannedAssets,
		iCloudUnavailable,
	};
}

export async function getMediaInTimeRange(
	startTime: Date,
	endTime: Date,
	limit: number = 1000,
	includeVideos: boolean = true
): Promise<LocalPhoto[]> {
	const result = await scanMediaInTimeRange(startTime, endTime, {
		limit,
		includeVideos,
	});
	return result.media;
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
		logger.error("Save to library error", error, { uri });
		return null;
	}
}

export interface PickMediaOptions {
	includeVideos?: boolean;
	maxVideoDuration?: number;
	maxFileSizeBytes?: number;
}

export interface PickMediaResult {
	media: LocalPhoto[];
	videosFiltered: boolean;
	videosTooLong: number;
	filesTooLarge: number;
	iCloudUnavailable: number;
	error?: string;
}

export async function pickMediaFromLibrary(
	options: PickMediaOptions = {}
): Promise<PickMediaResult> {
	const { includeVideos = true, maxVideoDuration = 0, maxFileSizeBytes = 0 } = options;
	const normalizedMaxVideoDurationMs = normalizeMaxVideoDurationMs(maxVideoDuration);

	const mediaTypes: ImagePicker.MediaType[] = includeVideos ? ["images", "videos"] : ["images"];
	try {
		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes,
			allowsMultipleSelection: true,
			quality: 1,
			exif: true,
			// Prefer the current/original asset representation on iOS to use Expo's fast path.
			// This avoids unnecessary transcoding and is more reliable for cloud-backed assets.
			preferredAssetRepresentationMode: getPreferredAssetRepresentationMode(),
			videoMaxDuration:
				normalizedMaxVideoDurationMs > 0
					? Math.ceil(normalizedMaxVideoDurationMs / 1000)
					: undefined,
		});

		if (result.canceled || !result.assets) {
			return {
				media: [],
				videosFiltered: false,
				videosTooLong: 0,
				filesTooLarge: 0,
				iCloudUnavailable: 0,
			};
		}

		let videosTooLong = 0;
		let filesTooLarge = 0;
		const validAssets = result.assets.filter((asset) => {
			if (asset.type === "video" && !includeVideos) {
				return false;
			}
			if (asset.type === "video" && normalizedMaxVideoDurationMs > 0) {
				const durationMs = durationToMs(asset.duration || 0);
				if (durationMs > normalizedMaxVideoDurationMs) {
					videosTooLong++;
					return false;
				}
			}
			if (
				maxFileSizeBytes > 0 &&
				typeof asset.fileSize === "number" &&
				asset.fileSize > maxFileSizeBytes
			) {
				filesTooLarge++;
				return false;
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
					const isoDate = exifDate
						.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3")
						.replace(" ", "T");
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
				fileSize: asset.fileSize,
				mediaType: (isVideo ? "video" : "photo") as "photo" | "video",
				latitude,
				longitude,
			};
		});

		return { media, videosFiltered, videosTooLong, filesTooLarge, iCloudUnavailable: 0 };
	} catch (error) {
		logger.error("Manual media picking failed", error, {
			includeVideos,
			maxVideoDuration: normalizedMaxVideoDurationMs,
		});
		const message =
			error instanceof Error && error.message.includes("PHPhotosErrorDomain")
				? "iCloud photos could not be loaded. Open them in Photos first so they download to this device, then try again."
				: "We couldn't access the selected media. Please try again.";
		return {
			media: [],
			videosFiltered: false,
			videosTooLong: 0,
			filesTooLarge: 0,
			iCloudUnavailable: 0,
			error: message,
		};
	}
}

export async function pickPhotosFromLibrary(): Promise<{
	photos: LocalPhoto[];
	videosFiltered: boolean;
}> {
	const result = await pickMediaFromLibrary({ includeVideos: false });
	return { photos: result.media, videosFiltered: result.videosFiltered };
}
