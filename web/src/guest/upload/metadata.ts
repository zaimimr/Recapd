import type { MediaKind } from "./paths";

export type MediaMetadata = {
	width: number | null;
	height: number | null;
	durationMs: number | null;
	capturedAt: Date;
};

type Dimensions = { width: number; height: number };

type ExifFields = {
	DateTimeOriginal?: unknown;
	ExifImageWidth?: number;
	ExifImageHeight?: number;
	Orientation?: number | string;
};

const MIN_VALID_TIME = Date.parse("1990-01-01T00:00:00Z");
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

function isUsable(time: number, now: Date): boolean {
	return Number.isFinite(time) && time >= MIN_VALID_TIME && time <= now.getTime() + FUTURE_SLACK_MS;
}

export function resolveCapturedAt(exifDate: unknown, lastModified: number, now = new Date()): Date {
	if (exifDate instanceof Date && isUsable(exifDate.getTime(), now)) return exifDate;
	if (isUsable(lastModified, now)) return new Date(lastModified);
	return now;
}

async function readExif(file: File): Promise<ExifFields | null> {
	try {
		const { default: exifr } = await import("exifr");
		const parsed = await exifr.parse(file, [
			"DateTimeOriginal",
			"ExifImageWidth",
			"ExifImageHeight",
			"Orientation",
		]);
		return (parsed as ExifFields | undefined) ?? null;
	} catch {
		return null;
	}
}

async function decodedImageSize(file: File): Promise<Dimensions | null> {
	try {
		const bitmap = await createImageBitmap(file);
		const size = { width: bitmap.width, height: bitmap.height };
		bitmap.close();
		return size;
	} catch {
		return elementImageSize(file);
	}
}

function elementImageSize(file: File): Promise<Dimensions | null> {
	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const image = new Image();
		const done = (size: Dimensions | null) => {
			URL.revokeObjectURL(url);
			resolve(size);
		};
		image.onload = () => done({ width: image.naturalWidth, height: image.naturalHeight });
		image.onerror = () => done(null);
		image.src = url;
	});
}

function exifSize(exif: ExifFields | null): Dimensions | null {
	if (!exif?.ExifImageWidth || !exif.ExifImageHeight) return null;
	const rotated =
		[5, 6, 7, 8].includes(Number(exif.Orientation)) || /90/.test(String(exif.Orientation));
	return rotated
		? { width: exif.ExifImageHeight, height: exif.ExifImageWidth }
		: { width: exif.ExifImageWidth, height: exif.ExifImageHeight };
}

const MAX_BOXES = 4096;
const MVHD_READ_BYTES = 32;

async function readView(blob: Blob, start: number, end: number): Promise<DataView> {
	return new DataView(await blob.slice(start, Math.min(end, blob.size)).arrayBuffer());
}

type BoxHeader = { type: string; start: number; end: number; bodyStart: number };

async function readBoxHeader(blob: Blob, offset: number, limit: number): Promise<BoxHeader | null> {
	if (offset + 8 > limit) return null;
	const view = await readView(blob, offset, offset + 16);
	if (view.byteLength < 8) return null;
	const type = String.fromCharCode(
		view.getUint8(4),
		view.getUint8(5),
		view.getUint8(6),
		view.getUint8(7)
	);
	let size = view.getUint32(0);
	let headerSize = 8;
	if (size === 1) {
		if (view.byteLength < 16) return null;
		size = Number(view.getBigUint64(8));
		headerSize = 16;
	} else if (size === 0) {
		size = limit - offset;
	}
	if (size < headerSize) return null;
	return {
		type,
		start: offset,
		end: Math.min(offset + size, limit),
		bodyStart: offset + headerSize,
	};
}

async function findBox(blob: Blob, type: string, start: number, end: number) {
	let offset = start;
	for (let count = 0; count < MAX_BOXES; count += 1) {
		const header = await readBoxHeader(blob, offset, end);
		if (!header) return null;
		if (header.type === type) return header;
		offset = header.end;
	}
	return null;
}

export async function readContainerDurationMs(blob: Blob): Promise<number | null> {
	try {
		const moov = await findBox(blob, "moov", 0, blob.size);
		if (!moov) return null;
		const mvhd = await findBox(blob, "mvhd", moov.bodyStart, moov.end);
		if (!mvhd) return null;
		const view = await readView(blob, mvhd.bodyStart, mvhd.bodyStart + MVHD_READ_BYTES);
		const version = view.getUint8(0);
		const timescale = version === 1 ? view.getUint32(20) : view.getUint32(12);
		const duration = version === 1 ? Number(view.getBigUint64(24)) : view.getUint32(16);
		const unknown = version === 1 ? duration >= Number.MAX_SAFE_INTEGER : duration === 0xffffffff;
		if (!timescale || !duration || unknown) return null;
		return Math.round((duration / timescale) * 1000);
	} catch {
		return null;
	}
}

type VideoInfo = { width: number | null; height: number | null; durationMs: number | null };

export function readVideoInfo(file: File, timeoutMs = 15000): Promise<VideoInfo> {
	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const video = document.createElement("video");
		const done = (info: VideoInfo) => {
			clearTimeout(timer);
			video.removeAttribute("src");
			video.load();
			URL.revokeObjectURL(url);
			resolve(info);
		};
		video.preload = "metadata";
		video.muted = true;
		video.playsInline = true;
		video.onloadedmetadata = () =>
			done({
				width: video.videoWidth || null,
				height: video.videoHeight || null,
				durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null,
			});
		video.onerror = () => done({ width: null, height: null, durationMs: null });
		const timer = setTimeout(
			() => done({ width: null, height: null, durationMs: null }),
			timeoutMs
		);
		video.src = url;
	});
}

export function pickDurationMs(container: number | null, element: number | null): number | null {
	if (container === null) return element;
	if (element === null) return container;
	return Math.max(container, element);
}

export async function readMetadata(file: File, mediaType: MediaKind): Promise<MediaMetadata> {
	if (mediaType === "video") {
		const [info, containerDurationMs] = await Promise.all([
			readVideoInfo(file),
			readContainerDurationMs(file),
		]);
		return {
			...info,
			durationMs: pickDurationMs(containerDurationMs, info.durationMs),
			capturedAt: resolveCapturedAt(undefined, file.lastModified),
		};
	}
	const exif = await readExif(file);
	const size = (await decodedImageSize(file)) ?? exifSize(exif);
	return {
		width: size?.width ?? null,
		height: size?.height ?? null,
		durationMs: null,
		capturedAt: resolveCapturedAt(exif?.DateTimeOriginal, file.lastModified),
	};
}
