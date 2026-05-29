import { EventEmitter, requireNativeModule } from "expo-modules-core";

export type UploaderMediaType = "photo" | "video";

export interface UploaderConfig {
	supabaseUrl: string;
	anonKey: string;
	bearerToken: string;
	bucket?: string;
	maxConcurrentPhotos?: number;
	maxConcurrentVideos?: number;
	chunkBytes?: number;
}

export interface UploadItemInput {
	uploadId: string;
	assetIdentifier?: string;
	fileUri?: string;
	objectName: string;
	contentType: string;
	mediaType: UploaderMediaType;
	eventId: string;
	userId: string;
	fileFingerprint: string;
}

export interface UploadProgressEvent {
	uploadId: string;
	bytesUploaded: number;
	totalBytes: number;
}

export interface UploadCompletedEvent {
	uploadId: string;
	objectName: string;
}

export interface UploadFailedEvent {
	uploadId: string;
	error: string;
}

export interface UploadQueueItem {
	uploadId: string;
	status: "queued" | "syncing" | "completed" | "failed";
	objectName: string;
	mediaType: UploaderMediaType;
	eventId: string;
	userId: string;
	bytesUploaded: number;
	totalBytes: number;
	lastError?: string | null;
	attemptCount: number;
}

export interface QueueSnapshot {
	items: UploadQueueItem[];
}

interface RecapdUploaderNativeModule {
	configure(config: UploaderConfig): Promise<void>;
	enqueue(items: UploadItemInput[]): Promise<string[]>;
	cancel(uploadId: string): Promise<void>;
	clearFailed(): Promise<void>;
	getQueueState(): Promise<QueueSnapshot>;
	retry(uploadId: string): Promise<void>;
	kick(): Promise<void>;
}

const native = requireNativeModule<RecapdUploaderNativeModule>("RecapdUploader");

type AnyEmitter = {
	addListener(event: string, listener: (payload: any) => void): { remove: () => void };
};
const emitter: AnyEmitter = new EventEmitter(native as any) as unknown as AnyEmitter;

export const RecapdUploader = {
	configure(config: UploaderConfig) {
		return native.configure({
			bucket: "event-photos",
			maxConcurrentPhotos: 2,
			maxConcurrentVideos: 1,
			chunkBytes: 1 * 1024 * 1024,
			...config,
		});
	},
	enqueue(items: UploadItemInput[]) {
		return native.enqueue(items);
	},
	cancel(uploadId: string) {
		return native.cancel(uploadId);
	},
	clearFailed() {
		return native.clearFailed();
	},
	getQueueState() {
		return native.getQueueState();
	},
	retry(uploadId: string) {
		return native.retry(uploadId);
	},
	kick() {
		return native.kick();
	},
	addProgressListener(listener: (e: UploadProgressEvent) => void) {
		return emitter.addListener("onProgress", listener);
	},
	addCompletedListener(listener: (e: UploadCompletedEvent) => void) {
		return emitter.addListener("onItemCompleted", listener);
	},
	addFailedListener(listener: (e: UploadFailedEvent) => void) {
		return emitter.addListener("onItemFailed", listener);
	},
	addDrainedListener(listener: () => void) {
		return emitter.addListener("onQueueDrained", listener);
	},
};
