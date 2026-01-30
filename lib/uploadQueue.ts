import { uploadMedia } from "./storage";

export type MediaType = "photo" | "video";

export interface PendingUpload {
	id: string;
	localUri: string;
	eventId: string;
	userId: string;
	capturedAt: Date;
	width: number;
	height: number;
	status: "pending" | "syncing" | "failed";
	retryCount: number;
	error?: string;
	assetId?: string;
	mediaType: MediaType;
	duration?: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const CONCURRENT_UPLOADS = 3; // Process 3 uploads at a time

let isProcessing = false;
let onUploadComplete: ((id: string, storagePath: string) => void) | null = null;
let onUploadFailed: ((id: string, error: string) => void) | null = null;
let onStatusChange: ((id: string, status: PendingUpload["status"]) => void) | null = null;

export function setUploadCallbacks(callbacks: {
	onComplete: (id: string, storagePath: string) => void;
	onFailed: (id: string, error: string) => void;
	onStatusChange: (id: string, status: PendingUpload["status"]) => void;
}) {
	onUploadComplete = callbacks.onComplete;
	onUploadFailed = callbacks.onFailed;
	onStatusChange = callbacks.onStatusChange;
}

export async function processUpload(upload: PendingUpload): Promise<boolean> {
	onStatusChange?.(upload.id, "syncing");

	const result = await uploadMedia({
		uri: upload.localUri,
		eventId: upload.eventId,
		userId: upload.userId,
		capturedAt: upload.capturedAt,
		width: upload.width,
		height: upload.height,
		mediaType: upload.mediaType,
		duration: upload.duration,
	});

	if (result.success && result.path) {
		onUploadComplete?.(upload.id, result.path);
		return true;
	} else {
		if (upload.retryCount >= MAX_RETRIES) {
			onUploadFailed?.(upload.id, result.error || "Upload failed");
			return false;
		}
		onStatusChange?.(upload.id, "failed");
		return false;
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

	if (!currentUpload || currentUpload.status === "failed") {
		return;
	}

	updateUpload(upload.id, { status: "syncing" });

	const success = await processUpload(currentUpload);

	if (!success && currentUpload.retryCount < MAX_RETRIES) {
		updateUpload(upload.id, {
			status: "failed",
			retryCount: currentUpload.retryCount + 1,
		});
		await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
	}
}

export async function processUploadQueue(
	uploads: PendingUpload[],
	getLatestUploads: () => PendingUpload[],
	updateUpload: (id: string, updates: Partial<PendingUpload>) => void
): Promise<void> {
	if (isProcessing) return;
	isProcessing = true;

	try {
		const pendingUploads = uploads.filter((u) => u.status === "pending" || u.status === "syncing");

		// Process uploads in concurrent batches
		for (let i = 0; i < pendingUploads.length; i += CONCURRENT_UPLOADS) {
			const batch = pendingUploads.slice(i, i + CONCURRENT_UPLOADS);

			// Process batch concurrently
			await Promise.all(
				batch.map((upload) => processUploadWithRetry(upload, getLatestUploads, updateUpload))
			);
		}
	} finally {
		isProcessing = false;
	}
}

export function generateUploadId(): string {
	return `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
