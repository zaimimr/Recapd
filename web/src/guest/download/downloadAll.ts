import { downloadZip } from "client-zip";
import { countBytes, fetchOriginal, type SaveTarget, triggerDownload } from "./saveItem";

const MB = 1024 * 1024;

export const BATCH_SIZE = 20;
export const BATCH_MAX_BYTES = 300 * MB;
export const DISK_STREAM_BYTES = 500 * MB;
const BATCH_CONCURRENCY = 3;
const OBJECT_URL_LIFETIME_MS = 60_000;

type Sized = { file_size_bytes?: number | null };

export type DownloadItem = SaveTarget & Sized;

export type Batch = { start: number; end: number };

export type Progress = { done: number; total: number; bytes: number; totalBytes: number };

export function planBatches(
	items: Sized[],
	maxItems: number = BATCH_SIZE,
	maxBytes: number = BATCH_MAX_BYTES
): Batch[] {
	const batches: Batch[] = [];
	let start = 0;
	let bytes = 0;
	items.forEach((item, index) => {
		const size = item.file_size_bytes ?? 0;
		const count = index - start;
		if (count > 0 && (count >= maxItems || bytes + size > maxBytes)) {
			batches.push({ start, end: index });
			start = index;
			bytes = 0;
		}
		bytes += size;
	});
	if (items.length > start) batches.push({ start, end: items.length });
	return batches;
}

export function batchLabel(batch: Batch, total: number): string {
	if (batch.start === 0 && batch.end === total) return `Save all ${total}`;
	if (batch.end - batch.start === 1) return `Save ${batch.end} of ${total}`;
	return `Save ${batch.start + 1}-${batch.end} of ${total}`;
}

export function knownTotalBytes(items: Sized[]): number {
	let sum = 0;
	for (const item of items) {
		if (!item.file_size_bytes) return 0;
		sum += item.file_size_bytes;
	}
	return sum;
}

export function progressPercent({ done, total, bytes, totalBytes }: Progress): number {
	const ratio = totalBytes > 0 ? bytes / totalBytes : total > 0 ? done / total : 0;
	return Math.max(0, Math.min(100, Math.floor(ratio * 100)));
}

export function zipName(code: string): string {
	return `recapd-${code}.zip`;
}

export function shouldStreamToDisk(items: Sized[]): boolean {
	return items.reduce((sum, item) => sum + (item.file_size_bytes ?? 0), 0) > DISK_STREAM_BYTES;
}

export type Tracker = {
	onBytes: (bytes: number) => void;
	onItemDone: () => void;
	onItemFailed: () => void;
};

export type TransferDeps = {
	originalUrl: (path: string) => Promise<string>;
	fetchImpl?: typeof fetch;
	signal: AbortSignal;
};

export async function prepareBatch(
	items: DownloadItem[],
	names: string[],
	deps: TransferDeps,
	tracker: Tracker
): Promise<File[]> {
	const files: (File | null)[] = Array(items.length).fill(null);
	let next = 0;
	const worker = async () => {
		while (next < items.length && !deps.signal.aborted) {
			const index = next++;
			try {
				const file = await fetchOriginal(items[index], names[index], {
					...deps,
					onBytes: tracker.onBytes,
				});
				if (navigator.canShare?.({ files: [file] })) {
					files[index] = file;
					tracker.onItemDone();
				} else {
					tracker.onItemFailed();
				}
			} catch {
				if (!deps.signal.aborted) tracker.onItemFailed();
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, items.length) }, worker));
	return files.filter((file): file is File => file !== null);
}

export function zipStream(
	items: DownloadItem[],
	names: string[],
	{ originalUrl, fetchImpl = fetch, signal }: TransferDeps,
	tracker: Tracker
): Response {
	async function* entries() {
		for (const [index, item] of items.entries()) {
			if (signal.aborted) return;
			let response: Response;
			try {
				const url = await originalUrl(item.storage_path);
				response = await fetchImpl(url, { signal });
				if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
			} catch {
				if (signal.aborted) return;
				tracker.onItemFailed();
				continue;
			}
			const modified = new Date(item.captured_at);
			yield {
				input: countBytes(response, tracker.onBytes),
				name: names[index],
				lastModified: Number.isNaN(modified.getTime()) ? undefined : modified,
			};
			tracker.onItemDone();
		}
	}
	return downloadZip(entries());
}

type SavePickerWindow = Window & {
	showSaveFilePicker?: (options: {
		suggestedName: string;
		types: { description: string; accept: Record<string, string[]> }[];
	}) => Promise<FileSystemFileHandle>;
};

export function pickZipDestination(name: string): Promise<FileSystemFileHandle> | null {
	const picker = (window as SavePickerWindow).showSaveFilePicker;
	if (typeof picker !== "function") return null;
	return picker.call(window, {
		suggestedName: name,
		types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }],
	});
}

export async function saveZip(
	response: Response,
	name: string,
	signal: AbortSignal,
	handle?: FileSystemFileHandle
) {
	if (!response.body) throw new Error("ZIP stream is empty");
	if (handle) {
		const writable = await handle.createWritable();
		await response.body.pipeTo(writable, { signal });
		return;
	}
	const blob = await response.blob();
	if (signal.aborted) return;
	const url = URL.createObjectURL(blob);
	triggerDownload(url, name);
	setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
}
