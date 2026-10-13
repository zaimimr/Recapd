import { guestSupabase } from "../supabase";
import type { MediaKind } from "./paths";

export type UploadLimits = { maxFileSizeBytes: number; maxVideoDurationMs: number };

export type FileCheck =
	| { ok: true }
	| { ok: false; reason: "too_large" | "too_long" | "unsupported"; message: string };

export async function fetchUploadLimits(eventId: string): Promise<UploadLimits> {
	const { data, error } = await guestSupabase.rpc("get_event_upload_limits", {
		p_event_id: eventId,
	});
	if (error) throw error;
	const row = (
		data as
			| { max_file_size_bytes: number | string; max_video_duration_ms: number | string }[]
			| null
	)?.[0];
	if (!row) throw new Error("Upload limits are not available for this event");
	return {
		maxFileSizeBytes: Number(row.max_file_size_bytes),
		maxVideoDurationMs: Number(row.max_video_duration_ms),
	};
}

export const UNSUPPORTED_MESSAGE =
	"This file type is not supported. Use JPEG, PNG, HEIC, WebP, MP4 or MOV.";

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < UNITS.length - 1) {
		value /= 1024;
		unit += 1;
	}
	const rounded = Math.ceil(value * 10 - 1e-9) / 10;
	return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} ${UNITS[unit]}`;
}

export function formatDuration(ms: number): string {
	const total = Math.ceil(ms / 1000);
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	if (minutes === 0) return `${seconds} s`;
	return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}

export function checkFile(
	file: { size: number },
	meta: { mediaType: MediaKind | null; durationMs: number | null },
	limits: UploadLimits
): FileCheck {
	if (!meta.mediaType) {
		return {
			ok: false,
			reason: "unsupported",
			message: UNSUPPORTED_MESSAGE,
		};
	}
	const label = meta.mediaType === "video" ? "Video" : "Photo";
	if (file.size > limits.maxFileSizeBytes) {
		return {
			ok: false,
			reason: "too_large",
			message: `${label} is ${formatBytes(file.size)}, max is ${formatBytes(limits.maxFileSizeBytes)}`,
		};
	}
	if (meta.mediaType !== "video") return { ok: true };
	if (meta.durationMs === null) {
		return {
			ok: false,
			reason: "unsupported",
			message: "Could not read this video's length. Try a different file.",
		};
	}
	if (meta.durationMs > limits.maxVideoDurationMs) {
		return {
			ok: false,
			reason: "too_long",
			message: `Video is ${formatDuration(meta.durationMs)}, max is ${formatDuration(limits.maxVideoDurationMs)}`,
		};
	}
	return { ok: true };
}
