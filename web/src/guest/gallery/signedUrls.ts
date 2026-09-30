import type { GalleryItem } from "./mediaList";

export const SIGNED_URL_TTL_SECONDS = 60 * 60;
export const REFRESH_BUFFER_MS = 10 * 60 * 1000;
const TRANSFORM_CONCURRENCY = 6;

export const THUMBNAIL_TRANSFORM = {
	width: 720,
	height: 720,
	resize: "cover" as const,
	quality: 60,
};

type SignOptions = { transform: typeof THUMBNAIL_TRANSFORM };

type SignResult<T> = Promise<{ data: T | null; error: unknown }>;

export type StorageSigner = {
	from(bucket: string): {
		createSignedUrls(
			paths: string[],
			expiresIn: number
		): SignResult<{ path: string | null; signedUrl: string | null }[]>;
		createSignedUrl(
			path: string,
			expiresIn: number,
			options?: SignOptions
		): SignResult<{ signedUrl: string }>;
	};
};

export type ThumbSource =
	| { kind: "thumbnail"; path: string }
	| { kind: "transform"; path: string }
	| { kind: "placeholder" };

type ThumbInput = Pick<GalleryItem, "id" | "media_type" | "storage_path" | "thumbnail_path">;

export function isHeicPath(path: string | null | undefined): boolean {
	return Boolean(path && /\.(heic|heif)$/i.test(path));
}

export function pickThumbSource(item: Omit<ThumbInput, "id">): ThumbSource {
	if (item.thumbnail_path) return { kind: "thumbnail", path: item.thumbnail_path };
	if (item.media_type === "photo" && item.storage_path && !isHeicPath(item.storage_path)) {
		return { kind: "transform", path: item.storage_path };
	}
	return { kind: "placeholder" };
}

export function createSignedUrlResolver(storage: StorageSigner, now: () => number = Date.now) {
	const cache = new Map<string, { url: string; expiresAt: number }>();

	function cached(key: string): string | null {
		const entry = cache.get(key);
		return entry && entry.expiresAt - now() > REFRESH_BUFFER_MS ? entry.url : null;
	}

	function remember(key: string, url: string) {
		cache.set(key, { url, expiresAt: now() + SIGNED_URL_TTL_SECONDS * 1000 });
	}

	async function signOne(bucket: string, path: string, options?: SignOptions) {
		const key = JSON.stringify([bucket, path, options ? "t" : null]);
		const hit = cached(key);
		if (hit) return hit;
		const { data, error } = await storage
			.from(bucket)
			.createSignedUrl(path, SIGNED_URL_TTL_SECONDS, options);
		if (error || !data?.signedUrl) throw error ?? new Error("Signed URL was not returned");
		remember(key, data.signedUrl);
		return data.signedUrl;
	}

	async function thumbnails(items: ThumbInput[]): Promise<Record<string, string>> {
		const urls: Record<string, string> = {};
		const pending = new Map<string, string[]>();
		const transforms: ThumbInput[] = [];
		for (const item of items) {
			const source = pickThumbSource(item);
			if (source.kind === "thumbnail") {
				const hit = cached(JSON.stringify(["thumbnails", source.path, null]));
				if (hit) urls[item.id] = hit;
				else pending.set(source.path, [...(pending.get(source.path) ?? []), item.id]);
			} else if (source.kind === "transform") {
				transforms.push(item);
			}
		}
		if (pending.size > 0) {
			const { data } = await storage
				.from("thumbnails")
				.createSignedUrls([...pending.keys()], SIGNED_URL_TTL_SECONDS);
			for (const entry of data ?? []) {
				if (!entry.path || !entry.signedUrl) continue;
				remember(JSON.stringify(["thumbnails", entry.path, null]), entry.signedUrl);
				for (const id of pending.get(entry.path) ?? []) urls[id] = entry.signedUrl;
			}
		}
		let next = 0;
		const worker = async () => {
			while (next < transforms.length) {
				const item = transforms[next++];
				const url = await signOne("event-photos", item.storage_path, {
					transform: THUMBNAIL_TRANSFORM,
				}).catch(() => null);
				if (url) urls[item.id] = url;
			}
		};
		await Promise.all(
			Array.from({ length: Math.min(TRANSFORM_CONCURRENCY, transforms.length) }, worker)
		);
		return urls;
	}

	function original(path: string): Promise<string> {
		return signOne("event-photos", path);
	}

	return { thumbnails, original };
}

export type SignedUrlResolver = ReturnType<typeof createSignedUrlResolver>;
