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

async function resolveCaptureTime(asset: MediaLibrary.Asset): Promise<number> {
	try {
		const info = await MediaLibrary.getAssetInfoAsync(asset.id, { shouldDownloadFromNetwork: false });
		const exif = (info as any).exif as Record<string, unknown> | undefined;
		const exifDate = (exif?.DateTimeOriginal as string | undefined) ?? (exif?.DateTime as string | undefined);
		if (exifDate) {
			const normalized = exifDate.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
			const parsed = Date.parse(normalized);
			if (!Number.isNaN(parsed)) return parsed;
		}
	} catch {}
	return asset.creationTime ?? Date.now();
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
			const captureTime = await resolveCaptureTime(asset);
			const inWindow = captureTime >= window.startsAt && captureTime <= window.endsAt;
			if (!window.allowOutsideWindow && !inWindow) continue;

			const filename = asset.filename ?? `${asset.id}`;
			const isVideo = asset.mediaType === "video";
			out.push({
				assetId: asset.id,
				uri: asset.uri,
				filename,
				mimeType: inferMimeType(filename, asset.mediaType),
				width: asset.width ?? 0,
				height: asset.height ?? 0,
				captureTime,
				durationMs: Math.round((asset.duration ?? 0) * 1000),
				isVideo,
				inWindow,
			});
		}

		if (!page.hasNextPage) break;
		cursor = page.endCursor;
	}

	out.sort((a, b) => b.captureTime - a.captureTime);
	return out;
}
