export type UploadStatus = "queued" | "uploading" | "done" | "failed";

export type ScannedAsset = {
	assetId: string;
	uri: string;
	filename: string;
	mimeType: string;
	width: number;
	height: number;
	captureTime: number;
	durationMs: number;
	isVideo: boolean;
	inWindow: boolean;
};

export type QueueItem = {
	id: string;
	eventId: string;
	ownerId: string;
	assetId: string;
	localUri: string;
	filename: string;
	mimeType: string;
	captureTime: number;
	isVideo: boolean;
	durationMs: number;
	sizeBytes: number | null;
	width: number;
	height: number;
	status: UploadStatus;
	attempts: number;
	progress: number;
	error?: string;
	originalUploadedAt?: number;
	thumbUploadedAt?: number;
	storagePath?: string;
	thumbPath?: string;
	mediaItemId?: string;
};

export type EventWindow = {
	eventId: string;
	startsAt: number;
	endsAt: number;
	allowOutsideWindow: boolean;
};
