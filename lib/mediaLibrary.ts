import * as MediaLibrary from "expo-media-library";
import type { EventWindow, ScannedAsset } from "@/lib/upload/types";

const PAGE_SIZE = 200;

function inferMimeType(filename: string, mediaType: string): string {
	const ext = filename.split(".").pop()?.toLowerCase() ?? "";
	if (mediaType === "video") {
		if (ext === "mov") return "video/quicktime";
		if (ext === "mp4") return "video/mp4";
		if (ext === "m4v") return "video/x-m4v";
		return "video/mp4";
	}
	if (ext === "heic") return "image/heic";
	if (ext === "heif") return "image/heif";
	if (ext === "png") return "image/png";
	if (ext === "webp") return "image/webp";
	if (ext === "gif") return "image/gif";
	return "image/jpeg";
}

type AssetDetails = {
	captureTime: number;
	latitude: number | null;
	longitude: number | null;
	localUri: string;
};

async function resolveAssetDetails(asset: MediaLibrary.Asset): Promise<AssetDetails> {
	let captureTime = asset.creationTime ?? Date.now();
	let latitude: number | null = null;
	let longitude: number | null = null;
	let localUri = asset.uri;
	try {
		const info = await MediaLibrary.getAssetInfoAsync(asset.id, { shouldDownloadFromNetwork: false });
		const exif = (info as any).exif as Record<string, unknown> | undefined;
		const exifDate = (exif?.DateTimeOriginal as string | undefined) ?? (exif?.DateTime as string | undefined);
		if (exifDate) {
			const normalized = exifDate.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
			const parsed = Date.parse(normalized);
			if (!Number.isNaN(parsed)) captureTime = parsed;
		}
		const location = (info as any).location as { latitude?: number; longitude?: number } | null | undefined;
		if (location && typeof location.latitude === "number" && typeof location.longitude === "number") {
			latitude = location.latitude;
			longitude = location.longitude;
		}
		const localUriCandidate = (info as any).localUri as string | undefined;
		if (localUriCandidate) localUri = localUriCandidate;
	} catch {}
	return { captureTime, latitude, longitude, localUri };
}

export async function ensureMediaPermission(): Promise<boolean> {
	const current = await MediaLibrary.getPermissionsAsync();
	if (current.status === "granted" || current.status === "limited") return true;
	if (!current.canAskAgain) return false;
	const next = await MediaLibrary.requestPermissionsAsync();
	return next.status === "granted" || next.status === "limited";
}

export async function scanAssetsForWindow(window: EventWindow): Promise<ScannedAsset[]> {
	const granted = await ensureMediaPermission();
	if (!granted) return [];

	const out: ScannedAsset[] = [];
	let cursor: string | undefined;
	const stopBefore = window.allowOutsideWindow ? 0 : window.startsAt;

	while (true) {
		const page = await MediaLibrary.getAssetsAsync({
			mediaType: ["photo", "video"],
			first: PAGE_SIZE,
			after: cursor,
			sortBy: [MediaLibrary.SortBy.creationTime],
			createdBefore: window.allowOutsideWindow ? undefined : window.endsAt,
		});

		for (const asset of page.assets) {
			const creation = asset.creationTime ?? 0;
			if (!window.allowOutsideWindow && creation < stopBefore) {
				return out;
			}
			const details = await resolveAssetDetails(asset);
			const inWindow = details.captureTime >= window.startsAt && details.captureTime <= window.endsAt;
			if (!window.allowOutsideWindow && !inWindow) continue;

			const filename = asset.filename ?? `${asset.id}`;
			const isVideo = asset.mediaType === "video";
			out.push({
				assetId: asset.id,
				uri: details.localUri,
				filename,
				mimeType: inferMimeType(filename, asset.mediaType),
				width: asset.width ?? 0,
				height: asset.height ?? 0,
				captureTime: details.captureTime,
				durationMs: Math.round((asset.duration ?? 0) * 1000),
				isVideo,
				inWindow,
				latitude: details.latitude,
				longitude: details.longitude,
			});
		}

		if (!page.hasNextPage) break;
		cursor = page.endCursor;
	}

	out.sort((a, b) => b.captureTime - a.captureTime);
	return out;
}
