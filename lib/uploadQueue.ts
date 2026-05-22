import { type UploadFailureReason, uploadMedia } from "./storage";

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

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const PHOTO_CONCURRENT_UPLOADS = 3;
const VIDEO_CONCURRENT_UPLOADS = 1;
const UPLOAD_TIMEOUT_MS = 20 * 60 * 1000;

let isProcessing = false;
let onUploadComplete:
	| ((
			upload: PendingUpload,
			result: Awaited<ReturnType<typeof uploadMedia>>
	  ) => void | Promise<void>)
	| null = null;
let onUploadFailed:
	| ((
			upload: PendingUpload,
			error: string,
			failureReason?: UploadFailureReason
	  ) => void | Promise<void>)
	| null = null;
let onStatusChange: ((id: string, updates: Partial<PendingUpload>) => void | Promise<void>) | null =
	null;

function isRetryableFailureReason(failureReason?: UploadFailureReason): boolean {
	return failureReason === "timeout" || failureReason === "unknown";
}

export function setUploadCallbacks(callbacks: {
	onComplete: (upload: PendingUpload, result: Awaited<ReturnType<typeof uploadMedia>>) => void;
	onFailed: (upload: PendingUpload, error: string, failureReason?: UploadFailureReason) => void;
	onStatusChange: (id: string, updates: Partial<PendingUpload>) => void;
}) {
	onUploadComplete = callbacks.onComplete;
	onUploadFailed = callbacks.onFailed;
	onStatusChange = callbacks.onStatusChange;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<T>((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error("timeout")), timeoutMs);
	});

	return Promise.race([promise, timeoutPromise]).finally(() => {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
	});
}

export async function processUpload(
	upload: PendingUpload
): Promise<{ success: boolean; retryable: boolean }> {
	const startedAt = new Date().toISOString();
	await onStatusChange?.(upload.id, {
		status: "syncing",
		startedAt: upload.startedAt ?? startedAt,
		lastAttemptAt: startedAt,
		error: undefined,
		failureReason: undefined,
	});

	let result;
	try {
		result = await withTimeout(
			uploadMedia({
				uri: upload.localUri,
				eventId: upload.eventId,
				userId: upload.userId,
				capturedAt: upload.capturedAt,
				width: upload.width,
				height: upload.height,
				fileSize: upload.fileSize,
				mediaType: upload.mediaType,
				duration: upload.duration,
				latitude: upload.latitude,
				longitude: upload.longitude,
			}),
			UPLOAD_TIMEOUT_MS
		);
	} catch (error) {
		const failureReason: UploadFailureReason =
			error instanceof Error && error.message === "timeout" ? "timeout" : "unknown";
		if (upload.retryCount >= MAX_RETRIES) {
			await onUploadFailed?.(
				upload,
				error instanceof Error ? error.message : "Upload failed",
				failureReason
			);
		}
		await onStatusChange?.(upload.id, {
			status: "failed",
			error: error instanceof Error ? error.message : "Upload failed",
			failureReason,
			finishedAt: new Date().toISOString(),
		});
		return {
			success: false,
			retryable: isRetryableFailureReason(failureReason),
		};
	}

	if (result.success && result.path) {
		await onUploadComplete?.(upload, result);
		await onStatusChange?.(upload.id, {
			finishedAt: new Date().toISOString(),
			error: undefined,
			failureReason: undefined,
		});
		return { success: true, retryable: false };
	} else {
		const failureReason = result.failureReason || "unknown";
		if (upload.retryCount >= MAX_RETRIES) {
			await onUploadFailed?.(upload, result.error || "Upload failed", failureReason);
			await onStatusChange?.(upload.id, {
				status: "failed",
				error: result.error || "Upload failed",
				failureReason,
				finishedAt: new Date().toISOString(),
			});
			return {
				success: false,
				retryable: isRetryableFailureReason(failureReason),
			};
		}
		await onStatusChange?.(upload.id, {
			status: "failed",
			error: result.error || "Upload failed",
			failureReason,
			finishedAt: new Date().toISOString(),
		});
		return {
			success: false,
			retryable: isRetryableFailureReason(failureReason),
		};
	}
}

/**
 * Process a single upload with retry handling
 */
async function processUploadWithRetry(
	upload: PendingUpload,
	getLatestUploads: () => PendingUpload[],
	updateUpload: (id: string, updates: Partial<PendingUpload>) => void
): Promise<void> {
	const latestUploads = getLatestUploads();
	const currentUpload = latestUploads.find((u) => u.id === upload.id);

	if (!currentUpload || currentUpload.status === "skipped" || currentUpload.status === "failed") {
		return;
	}

	let attempt = currentUpload.retryCount;
	let activeUpload = currentUpload;

	while (attempt <= MAX_RETRIES) {
		const startedAt = new Date().toISOString();
		updateUpload(upload.id, {
			status: "syncing",
			startedAt: activeUpload.startedAt ?? startedAt,
			lastAttemptAt: startedAt,
			error: undefined,
			failureReason: undefined,
		});

		const result = await processUpload({
			...activeUpload,
			retryCount: attempt,
		});

		if (result.success) {
			return;
		}

		if (!result.retryable) {
			return;
		}

		if (attempt >= MAX_RETRIES) {
			return;
		}

		attempt += 1;
		updateUpload(upload.id, {
			status: "failed",
			retryCount: attempt,
			finishedAt: new Date().toISOString(),
		});

		await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
		const latestAfterDelay = getLatestUploads().find((u) => u.id === upload.id);
		if (!latestAfterDelay || latestAfterDelay.status === "skipped") {
			return;
		}
		activeUpload = latestAfterDelay;
	}
}

async function runPool(
	uploads: PendingUpload[],
	concurrency: number,
	getLatestUploads: () => PendingUpload[],
	updateUpload: (id: string, updates: Partial<PendingUpload>) => void
): Promise<void> {
	if (uploads.length === 0) return;
	for (let i = 0; i < uploads.length; i += concurrency) {
		const batch = uploads.slice(i, i + concurrency);
		await Promise.all(
			batch.map((upload) => processUploadWithRetry(upload, getLatestUploads, updateUpload))
		);
	}
}

export async function processUploadQueue(
	_uploads: PendingUpload[],
	getLatestUploads: () => PendingUpload[],
	updateUpload: (id: string, updates: Partial<PendingUpload>) => void
): Promise<void> {
	if (isProcessing) return;
	isProcessing = true;

	try {
		const latestUploads = getLatestUploads();
		const pendingUploads = latestUploads.filter(
			(u) => u.status === "pending" || u.status === "syncing"
		);

		if (pendingUploads.length === 0) {
			return;
		}

		const photoUploads = pendingUploads.filter((upload) => upload.mediaType === "photo");
		const videoUploads = pendingUploads.filter((upload) => upload.mediaType === "video");

		await Promise.all([
			runPool(photoUploads, PHOTO_CONCURRENT_UPLOADS, getLatestUploads, updateUpload),
			runPool(videoUploads, VIDEO_CONCURRENT_UPLOADS, getLatestUploads, updateUpload),
		]);
	} finally {
		isProcessing = false;
	}
}

export function generateUploadId(): string {
	return `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
