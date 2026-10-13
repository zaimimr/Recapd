import type { MediaKind } from "./paths";

const MAX_SIDE = 512;
const QUALITY = 0.6;
const VIDEO_FRAME_SECONDS = 0.1;

export function fitWithin(width: number, height: number, max = MAX_SIDE) {
	const scale = Math.min(1, max / Math.max(width, height));
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

function drawToJpeg(
	source: CanvasImageSource,
	width: number,
	height: number
): Promise<Blob | null> {
	if (!width || !height) return Promise.resolve(null);
	const size = fitWithin(width, height);
	const canvas = document.createElement("canvas");
	canvas.width = size.width;
	canvas.height = size.height;
	const context = canvas.getContext("2d");
	if (!context) return Promise.resolve(null);
	context.drawImage(source, 0, 0, size.width, size.height);
	return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", QUALITY));
}

function loadImageElement(file: File): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const image = new Image();
		image.onload = () => {
			URL.revokeObjectURL(url);
			resolve(image);
		};
		image.onerror = () => {
			URL.revokeObjectURL(url);
			resolve(null);
		};
		image.src = url;
	});
}

async function imageThumbnail(file: File): Promise<Blob | null> {
	try {
		const bitmap = await createImageBitmap(file);
		try {
			return await drawToJpeg(bitmap, bitmap.width, bitmap.height);
		} finally {
			bitmap.close();
		}
	} catch {
		const image = await loadImageElement(file);
		if (!image) return null;
		return drawToJpeg(image, image.naturalWidth, image.naturalHeight);
	}
}

function videoThumbnail(file: File, timeoutMs = 15000): Promise<Blob | null> {
	return new Promise((resolve) => {
		const url = URL.createObjectURL(file);
		const video = document.createElement("video");
		let settled = false;
		const done = (blob: Blob | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			video.removeAttribute("src");
			video.load();
			URL.revokeObjectURL(url);
			resolve(blob);
		};
		video.preload = "auto";
		video.muted = true;
		video.playsInline = true;
		video.onloadedmetadata = () => {
			video.currentTime = Math.min(VIDEO_FRAME_SECONDS, video.duration || VIDEO_FRAME_SECONDS);
		};
		video.onseeked = () => {
			drawToJpeg(video, video.videoWidth, video.videoHeight)
				.then(done)
				.catch(() => done(null));
		};
		video.onerror = () => done(null);
		const timer = setTimeout(() => done(null), timeoutMs);
		video.src = url;
	});
}

export async function makeThumbnail(file: File, mediaType: MediaKind): Promise<Blob | null> {
	try {
		return mediaType === "video" ? await videoThumbnail(file) : await imageThumbnail(file);
	} catch {
		return null;
	}
}
