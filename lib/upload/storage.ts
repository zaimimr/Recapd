import { decode } from "base64-arraybuffer";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "@/lib/supabase";

export const ORIGINALS_BUCKET = "media-originals";
export const THUMBS_BUCKET = "media-thumbs";

const CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_ATTEMPTS = 5;

export type UploadProgress = (loaded: number, total: number) => void;

export type UploadInput = {
	bucket: string;
	objectPath: string;
	localUri: string;
	mimeType: string;
	cacheControl?: string;
	metadata?: Record<string, string>;
	onProgress?: UploadProgress;
};

export type UploadResult = {
	storagePath: string;
	sizeBytes: number;
};

async function fileSize(localUri: string): Promise<number> {
	const info = await FileSystem.getInfoAsync(localUri, { size: true });
	if (!info.exists) throw new Error(`file not found: ${localUri}`);
	return info.size ?? 0;
}

async function readChunkAsArrayBuffer(localUri: string, offset: number, length: number): Promise<ArrayBuffer> {
	const base64 = await FileSystem.readAsStringAsync(localUri, {
		encoding: FileSystem.EncodingType.Base64,
		position: offset,
		length,
	});
	return decode(base64);
}

async function readAllAsArrayBuffer(localUri: string): Promise<ArrayBuffer> {
	const base64 = await FileSystem.readAsStringAsync(localUri, {
		encoding: FileSystem.EncodingType.Base64,
	});
	return decode(base64);
}

async function backoff(attempt: number): Promise<void> {
	const base = Math.min(30_000, 1000 * 2 ** attempt);
	const jitter = Math.floor(Math.random() * 500);
	await new Promise((r) => setTimeout(r, base + jitter));
}

function isRetryable(err: unknown): boolean {
	if (!err) return false;
	const msg = (err as { message?: string }).message ?? "";
	if (/network|timeout|fetch|temporar|429|5\d\d|aborted/i.test(msg)) return true;
	const status = (err as { status?: number }).status;
	if (status && (status === 429 || status >= 500)) return true;
	return false;
}

export async function uploadFile(input: UploadInput): Promise<UploadResult> {
	const total = await fileSize(input.localUri);
	const cacheControl = input.cacheControl ?? "31536000";

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
		try {
			if (total <= CHUNK_BYTES) {
				const buf = await readAllAsArrayBuffer(input.localUri);
				const { error } = await supabase.storage
					.from(input.bucket)
					.upload(input.objectPath, buf, {
						contentType: input.mimeType,
						cacheControl,
						upsert: true,
						metadata: input.metadata,
					});
				if (error) throw error;
				input.onProgress?.(total, total);
				return { storagePath: input.objectPath, sizeBytes: total };
			}

			const chunks: ArrayBuffer[] = [];
			let loaded = 0;
			for (let offset = 0; offset < total; offset += CHUNK_BYTES) {
				const length = Math.min(CHUNK_BYTES, total - offset);
				const buf = await readChunkAsArrayBuffer(input.localUri, offset, length);
				chunks.push(buf);
				loaded += length;
				input.onProgress?.(Math.min(loaded, total - 1), total);
			}
			const merged = new Uint8Array(total);
			let cursor = 0;
			for (const c of chunks) {
				merged.set(new Uint8Array(c), cursor);
				cursor += c.byteLength;
			}
			const { error } = await supabase.storage
				.from(input.bucket)
				.upload(input.objectPath, merged.buffer, {
					contentType: input.mimeType,
					cacheControl,
					upsert: true,
					metadata: input.metadata,
				});
			if (error) throw error;
			input.onProgress?.(total, total);
			return { storagePath: input.objectPath, sizeBytes: total };
		} catch (err) {
			const last = attempt === MAX_ATTEMPTS - 1;
			if (last || !isRetryable(err)) {
				throw err;
			}
			await backoff(attempt);
		}
	}
	throw new Error("upload exhausted retries");
}

export function extensionFor(filename: string, mimeType: string): string {
	const fromName = filename.split(".").pop()?.toLowerCase();
	if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
	if (mimeType === "image/heic") return "heic";
	if (mimeType === "image/heif") return "heif";
	if (mimeType === "image/png") return "png";
	if (mimeType === "image/webp") return "webp";
	if (mimeType === "image/gif") return "gif";
	if (mimeType === "image/jpeg") return "jpg";
	if (mimeType === "video/quicktime") return "mov";
	if (mimeType === "video/x-m4v") return "m4v";
	if (mimeType === "video/mp4") return "mp4";
	return "bin";
}

export function originalObjectPath(
	eventId: string,
	ownerId: string,
	mediaId: string,
	filename: string,
	mimeType: string
): string {
	const ext = extensionFor(filename, mimeType);
	return `${eventId}/${ownerId}/${mediaId}.${ext}`;
}

export function thumbObjectPath(eventId: string, ownerId: string, mediaId: string): string {
	return `${eventId}/${ownerId}/${mediaId}_thumb.jpg`;
}
