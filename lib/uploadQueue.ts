import {
	enqueueRecapdUploads,
	type RecapdUploaderItemArgs,
	setRecapdUploaderHandlers,
} from "./recapdUploaderBridge";
import { addUploadBreadcrumb } from "./sentry";
import { getContentType, getPathExtension, type UploadFailureReason } from "./storage";

export type MediaType = "photo" | "video";

export interface PendingUpload {
	id: string;
	localUri: string;
	eventId: string;
	userId: string;
	capturedAt: Date;
	width: number;
	height: number;
	status: "pending" | "syncing" | "failed" | "skipped";
	retryCount: number;
	error?: string;
	failureReason?: UploadFailureReason;
	startedAt?: string;
	lastAttemptAt?: string;
	finishedAt?: string;
	assetId?: string;
	fileSize?: number;
	mediaType: MediaType;
	duration?: number;
	latitude?: number;
	longitude?: number;
	thumbnailUri?: string | null;
	thumbnailPath?: string | null;
}

interface UploadCompletionResult {
	success: boolean;
	path?: string;
	mediaItem?: unknown;
	error?: string;
	failureReason?: UploadFailureReason;
}

let onUploadComplete:
	| ((upload: PendingUpload, result: UploadCompletionResult) => void | Promise<void>)
	| null = null;
let onUploadFailed:
	| ((upload: PendingUpload, error: string, failureReason?: UploadFailureReason) => void | Promise<void>)
	| null = null;
let onStatusChange: ((id: string, updates: Partial<PendingUpload>) => void | Promise<void>) | null =
	null;

let getUploadsForBridge: (() => PendingUpload[]) | null = null;

export function setUploadCallbacks(callbacks: {
	onComplete: (upload: PendingUpload, result: UploadCompletionResult) => void;
	onFailed: (upload: PendingUpload, error: string, failureReason?: UploadFailureReason) => void;
	onStatusChange: (id: string, updates: Partial<PendingUpload>) => void;
	getUploads?: () => PendingUpload[];
}) {
	onUploadComplete = callbacks.onComplete;
	onUploadFailed = callbacks.onFailed;
	onStatusChange = callbacks.onStatusChange;
	if (callbacks.getUploads) {
		getUploadsForBridge = callbacks.getUploads;
	}

	setRecapdUploaderHandlers({
		onProgress: (uploadId, bytes, total) => {
			void onStatusChange?.(uploadId, {
				status: "syncing",
				lastAttemptAt: new Date().toISOString(),
				fileSize: total > 0 ? total : undefined,
			});
		},
		onCompletion: (uploadId, mediaItem, error) => {
			const uploads = getUploadsForBridge?.() ?? [];
			const upload = uploads.find((u) => u.id === uploadId);
			if (!upload) {
				return;
			}
			if (error) {
				const failureReason = classifyError(error);
				void onUploadFailed?.(upload, error, failureReason);
				void onStatusChange?.(uploadId, {
					status: "failed",
					error,
					failureReason,
					finishedAt: new Date().toISOString(),
				});
				return;
			}
			void onUploadComplete?.(upload, {
				success: true,
				path: undefined,
				mediaItem: mediaItem ?? undefined,
			});
		},
	});
}

function classifyError(message: string): UploadFailureReason {
	const lower = message.toLowerCase();
	if (lower.includes("timeout")) return "timeout";
	if (
		lower.includes("network") ||
		lower.includes("econnreset") ||
		lower.includes("etimedout") ||
		lower.includes("fetch failed")
	) {
		return "network";
	}
	if (lower.includes("asset") || lower.includes("permission") || lower.includes("icloud")) {
		return "permission";
	}
	if (lower.includes("disk") || lower.includes("storage")) return "storage";
	return "unknown";
}

function buildItem(upload: PendingUpload): RecapdUploaderItemArgs {
	const timestamp = Date.now();
	const uniqueSuffix = Math.random().toString(36).substring(2, 10);
	const extension = getPathExtension(upload.localUri, upload.mediaType);
	const objectName = `${upload.eventId}/${upload.userId}/${timestamp}_${uniqueSuffix}.${extension}`;
	const contentType = getContentType(extension, upload.mediaType);
	const isAsset = Boolean(upload.assetId);
	return {
		uploadId: upload.id,
		assetIdentifier: isAsset ? upload.assetId : undefined,
		fileUri: isAsset ? undefined : upload.localUri,
		eventId: upload.eventId,
		userId: upload.userId,
		mediaType: upload.mediaType,
		capturedAt: upload.capturedAt,
		width: upload.width,
		height: upload.height,
		duration: upload.duration,
		latitude: upload.latitude,
		longitude: upload.longitude,
		fileSize: upload.fileSize,
		contentType,
		objectName,
		thumbnailPath: upload.thumbnailPath ?? null,
	};
}

export async function processUploadQueue(
	_uploads: PendingUpload[],
	getLatestUploads: () => PendingUpload[],
	updateUpload: (id: string, updates: Partial<PendingUpload>) => void
): Promise<void> {
	getUploadsForBridge = getLatestUploads;
	const latest = getLatestUploads();
	const pending = latest.filter((u) => u.status === "pending");
	if (pending.length === 0) return;
	for (const u of pending) {
		updateUpload(u.id, {
			status: "syncing",
			startedAt: u.startedAt ?? new Date().toISOString(),
			lastAttemptAt: new Date().toISOString(),
			error: undefined,
			failureReason: undefined,
		});
	}
	const items = pending.map(buildItem);
	addUploadBreadcrumb("uploadQueue.enqueueNative", {
		count: items.length,
		photos: items.filter((i) => i.mediaType === "photo").length,
		videos: items.filter((i) => i.mediaType === "video").length,
	});
	await enqueueRecapdUploads(items);
}

export { generateUploadId } from "./uploadId";
