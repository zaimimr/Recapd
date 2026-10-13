export type MediaKind = "photo" | "video";

export type ResolvedMedia = { mediaType: MediaKind; contentType: string; ext: string };

const MIME_EXTENSIONS: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/heic": "heic",
	"image/heif": "heif",
	"image/webp": "webp",
	"video/mp4": "mp4",
	"video/quicktime": "mov",
};

const EXTENSION_TYPES: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	heic: "image/heic",
	heif: "image/heif",
	webp: "image/webp",
	mp4: "video/mp4",
	m4v: "video/mp4",
	mov: "video/quicktime",
};

function nameExtension(name: string): string {
	const match = name.match(/\.([a-z0-9]+)$/i);
	return match ? match[1].toLowerCase() : "";
}

export function fileExtension(name: string, contentType: string): string {
	const ext = nameExtension(name);
	if (ext && EXTENSION_TYPES[ext] === contentType) return ext;
	return MIME_EXTENSIONS[contentType] ?? (ext || "bin");
}

export function resolveMedia(name: string, type: string): ResolvedMedia | null {
	const contentType = MIME_EXTENSIONS[type] ? type : EXTENSION_TYPES[nameExtension(name)];
	if (!contentType) return null;
	return {
		mediaType: contentType.startsWith("video/") ? "video" : "photo",
		contentType,
		ext: fileExtension(name, contentType),
	};
}

export function randomSuffix(): string {
	let suffix = "";
	while (suffix.length < 8) suffix += Math.random().toString(36).substring(2);
	return suffix.substring(0, 8);
}

export function buildStoragePath(
	eventId: string,
	profileId: string,
	ext: string,
	now: number = Date.now(),
	suffix: string = randomSuffix()
): string {
	return `${eventId}/${profileId}/${now}_${suffix}.${ext}`;
}

export function thumbPath(storagePath: string): string {
	return `${storagePath.replace(/\.[^./]+$/, "")}_thumb.jpg`;
}
