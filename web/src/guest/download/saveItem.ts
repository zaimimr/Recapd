import type { GalleryItem } from "../gallery/mediaList";

export type SaveTarget = Pick<GalleryItem, "storage_path" | "captured_at" | "media_type">;

const MIME_TYPES: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	webp: "image/webp",
	heic: "image/heic",
	heif: "image/heif",
	avif: "image/avif",
	mp4: "video/mp4",
	m4v: "video/x-m4v",
	mov: "video/quicktime",
	webm: "video/webm",
	"3gp": "video/3gpp",
};

export function extensionOf(path: string, mediaType: GalleryItem["media_type"] = "photo"): string {
	const match = /\.([a-z0-9]{1,5})$/i.exec(path);
	if (match) return match[1].toLowerCase();
	return mediaType === "video" ? "mp4" : "jpg";
}

export function mimeFor(extension: string): string {
	return MIME_TYPES[extension] ?? "application/octet-stream";
}

export function fileNameFor(item: SaveTarget, timeZone: string): string {
	const extension = extensionOf(item.storage_path, item.media_type);
	const date = new Date(item.captured_at);
	if (Number.isNaN(date.getTime())) return `recapd.${extension}`;
	const parts = Object.fromEntries(
		new Intl.DateTimeFormat("en-GB", {
			timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			hourCycle: "h23",
		})
			.formatToParts(date)
			.map((part) => [part.type, part.value])
	);
	return `recapd-${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}.${extension}`;
}

export function uniqueNames(names: string[]): string[] {
	const taken = new Set(names);
	const seen = new Set<string>();
	return names.map((name) => {
		if (!seen.has(name)) {
			seen.add(name);
			return name;
		}
		const dot = name.lastIndexOf(".");
		const base = dot > 0 ? name.slice(0, dot) : name;
		const extension = dot > 0 ? name.slice(dot) : "";
		let counter = 2;
		while (taken.has(`${base}-${counter}${extension}`)) counter++;
		const unique = `${base}-${counter}${extension}`;
		taken.add(unique);
		seen.add(unique);
		return unique;
	});
}

export function withDownloadParam(url: string, name: string): string {
	const parsed = new URL(url);
	parsed.searchParams.set("download", name);
	return parsed.toString();
}

export function canShareFiles(): boolean {
	try {
		if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
		const probe = new File([new Uint8Array(1)], "recapd.jpg", { type: "image/jpeg" });
		return Boolean(navigator.canShare?.({ files: [probe] }));
	} catch {
		return false;
	}
}

export function countBytes(response: Response, onBytes: (bytes: number) => void): Response {
	if (!response.body) return response;
	const counter = new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			onBytes(chunk.byteLength);
			controller.enqueue(chunk);
		},
	});
	return new Response(response.body.pipeThrough(counter), { headers: response.headers });
}

export type FetchOriginal = {
	originalUrl: (path: string) => Promise<string>;
	fetchImpl?: typeof fetch;
	signal?: AbortSignal;
	onBytes?: (bytes: number) => void;
};

export async function fetchOriginal(
	item: SaveTarget,
	name: string,
	{ originalUrl, fetchImpl = fetch, signal, onBytes }: FetchOriginal
): Promise<File> {
	const url = await originalUrl(item.storage_path);
	const response = await fetchImpl(url, { signal });
	if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
	const body = onBytes ? countBytes(response, onBytes) : response;
	const blob = await body.blob();
	return new File([blob], name, {
		type: mimeFor(extensionOf(item.storage_path, item.media_type)),
		lastModified: new Date(item.captured_at).getTime() || Date.now(),
	});
}

export function triggerDownload(href: string, name: string) {
	const link = document.createElement("a");
	link.href = href;
	link.download = name;
	link.rel = "noopener";
	link.style.display = "none";
	document.body.append(link);
	link.click();
	link.remove();
}

export type ShareOutcome = "shared" | "cancelled" | "needs_tap" | "failed";

export async function shareFiles(files: File[]): Promise<ShareOutcome> {
	try {
		await navigator.share({ files });
		return "shared";
	} catch (error) {
		const name = error instanceof DOMException ? error.name : "";
		if (name === "AbortError") return "cancelled";
		if (name === "NotAllowedError") return "needs_tap";
		return "failed";
	}
}

export async function downloadOriginal(
	item: SaveTarget,
	name: string,
	originalUrl: (path: string) => Promise<string>
) {
	const url = await originalUrl(item.storage_path);
	triggerDownload(withDownloadParam(url, name), name);
}

export type SaveResult = { outcome: ShareOutcome | "downloaded"; file?: File };

export async function saveItem(
	item: SaveTarget,
	name: string,
	deps: FetchOriginal & { share: boolean }
): Promise<SaveResult> {
	if (!deps.share) {
		await downloadOriginal(item, name, deps.originalUrl);
		return { outcome: "downloaded" };
	}
	const file = await fetchOriginal(item, name, deps);
	if (!navigator.canShare?.({ files: [file] })) {
		await downloadOriginal(item, name, deps.originalUrl);
		return { outcome: "downloaded" };
	}
	return { outcome: await shareFiles([file]), file };
}

export function prefersShare(): boolean {
	try {
		return window.matchMedia("(pointer: coarse)").matches && canShareFiles();
	} catch {
		return false;
	}
}
