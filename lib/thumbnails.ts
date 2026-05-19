import { supabase } from "@/lib/supabase";
import type { GalleryMediaItem } from "@/types/media";

const ORIGINALS_BUCKET = "media-originals";
const THUMBS_BUCKET = "media-thumbs";
const ORIGINAL_TTL_SECONDS = 60 * 30;
const THUMB_TTL_SECONDS = 60 * 60 * 6;

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

function cacheKey(bucket: string, path: string) {
	return `${bucket}:${path}`;
}

async function getSignedUrl(bucket: string, path: string, ttl: number): Promise<string | null> {
	const key = cacheKey(bucket, path);
	const cached = signedUrlCache.get(key);
	const now = Date.now();
	if (cached && cached.expiresAt > now + 30_000) {
		return cached.url;
	}
	const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttl);
	if (error || !data?.signedUrl) return null;
	signedUrlCache.set(key, { url: data.signedUrl, expiresAt: now + ttl * 1000 });
	return data.signedUrl;
}

export async function getThumbUrl(
	item: Pick<GalleryMediaItem, "thumb_path" | "storage_path">
): Promise<string | null> {
	if (item.thumb_path) {
		const url = await getSignedUrl(THUMBS_BUCKET, item.thumb_path, THUMB_TTL_SECONDS);
		if (url) return url;
	}
	return getSignedUrl(ORIGINALS_BUCKET, item.storage_path, ORIGINAL_TTL_SECONDS);
}

export function getOriginalUrl(item: Pick<GalleryMediaItem, "storage_path">) {
	return getSignedUrl(ORIGINALS_BUCKET, item.storage_path, ORIGINAL_TTL_SECONDS);
}

export function invalidateSignedUrl(bucket: "media-originals" | "media-thumbs", path: string) {
	signedUrlCache.delete(cacheKey(bucket, path));
}

export const NEUTRAL_SKELETON = "#1d1d22";

export function skeletonColor(_item: { id: string }): string {
	return NEUTRAL_SKELETON;
}
