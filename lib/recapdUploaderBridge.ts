import { RecapdUploader, type UploadItemInput } from "recapd-uploader";
import type { MediaItemInsert, MediaItemWithUser } from "@/types/database";
import { logger } from "./logger";
import { addUploadBreadcrumb } from "./sentry";
import { supabase } from "./supabase";

interface PendingMeta {
	uploadId: string;
	eventId: string;
	userId: string;
	mediaType: "photo" | "video";
	capturedAt: string;
	width: number;
	height: number;
	duration?: number;
	latitude?: number;
	longitude?: number;
	fileSize?: number;
	thumbnailPath?: string | null;
}

const pendingMeta = new Map<string, PendingMeta>();

let progressHandler: ((uploadId: string, bytes: number, total: number) => void) | null = null;
let completionHandler:
	| ((uploadId: string, mediaItem: MediaItemWithUser | null, error?: string) => void)
	| null = null;
let listenersInstalled = false;

export function setRecapdUploaderHandlers(handlers: {
	onProgress?: (uploadId: string, bytes: number, total: number) => void;
	onCompletion?: (uploadId: string, mediaItem: MediaItemWithUser | null, error?: string) => void;
}) {
	progressHandler = handlers.onProgress ?? null;
	completionHandler = handlers.onCompletion ?? null;
	installListenersOnce();
}

function installListenersOnce() {
	if (listenersInstalled) return;
	listenersInstalled = true;

	RecapdUploader.addProgressListener(({ uploadId, bytesUploaded, totalBytes }) => {
		progressHandler?.(uploadId, bytesUploaded, totalBytes);
	});

	RecapdUploader.addCompletedListener(async ({ uploadId, objectName, recorded }) => {
		logger.info("[up] DONE", { uploadId, recorded: Boolean(recorded) });
		const meta = pendingMeta.get(uploadId);
		pendingMeta.delete(uploadId);
		addUploadBreadcrumb("recapd.completed", {
			uploadId,
			storagePath: objectName,
			recorded: Boolean(recorded),
		});
		if (recorded) {
			// Native already inserted the media_items row (works while suspended).
			// Just mark the local upload complete; the row arrives via realtime/refetch.
			completionHandler?.(uploadId, null);
			return;
		}
		if (!meta) return;
		try {
			const insertData: MediaItemInsert = {
				event_id: meta.eventId,
				uploaded_by_user_id: meta.userId,
				captured_at: meta.capturedAt,
				media_type: meta.mediaType,
				width: meta.width,
				height: meta.height,
				duration_milliseconds: meta.mediaType === "video" ? Math.round(meta.duration || 0) : null,
				file_size_bytes: meta.fileSize ?? null,
				storage_path: objectName,
				thumbnail_path: meta.thumbnailPath ?? null,
				visibility: "shared",
				latitude: meta.latitude ?? null,
				longitude: meta.longitude ?? null,
			};
			const { data, error } = await supabase
				.from("media_items")
				.insert(insertData)
				.select("*, uploader:users!uploaded_by_user_id(display_name)")
				.single();
			if (error) {
				logger.error("Native upload DB insert failed", error, { uploadId, objectName });
				await supabase.storage.from("event-photos").remove([objectName]);
				completionHandler?.(uploadId, null, error.message ?? "DB insert failed");
				return;
			}
			completionHandler?.(uploadId, data as MediaItemWithUser);
		} catch (e) {
			logger.error("Native upload completion handler crashed", e);
			completionHandler?.(uploadId, null, e instanceof Error ? e.message : "unknown");
		}
	});

	RecapdUploader.addFailedListener(({ uploadId, error }) => {
		logger.error("[up] FAILED", new Error(error), { uploadId });
		pendingMeta.delete(uploadId);
		addUploadBreadcrumb(
			"recapd.failed",
			{
				uploadId,
				err: error,
			},
			"error"
		);
		completionHandler?.(uploadId, null, error);
	});
}

export async function configureRecapdUploader(args: {
	supabaseUrl: string;
	anonKey: string;
	bearerToken: string;
}) {
	await RecapdUploader.configure({
		supabaseUrl: args.supabaseUrl,
		anonKey: args.anonKey,
		bearerToken: args.bearerToken,
	});
}

export interface RecapdUploaderItemArgs {
	uploadId: string;
	assetIdentifier?: string;
	fileUri?: string;
	eventId: string;
	userId: string;
	mediaType: "photo" | "video";
	capturedAt: Date;
	width: number;
	height: number;
	duration?: number;
	latitude?: number;
	longitude?: number;
	fileSize?: number;
	contentType: string;
	objectName: string;
	thumbnailPath?: string | null;
}

async function refreshUploaderConfig(): Promise<void> {
	try {
		const { data } = await supabase.auth.getSession();
		let session = data.session;
		const expiresAt = session?.expires_at ? session.expires_at * 1000 : 0;
		const secondsLeft = expiresAt ? Math.round((expiresAt - Date.now()) / 1000) : -1;
		if (!session || secondsLeft < 120) {
			const refreshed = await supabase.auth.refreshSession();
			if (refreshed.data.session) {
				session = refreshed.data.session;
			} else if (refreshed.error) {
				logger.warn("[uploader] token refreshSession failed", refreshed.error);
			}
		}
		const bearer = session?.access_token;
		const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
		const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
		if (bearer && supabaseUrl && anonKey) {
			await configureRecapdUploader({ supabaseUrl, anonKey, bearerToken: bearer });
			logger.info("[up] configured", { secondsLeft });
		} else {
			logger.warn("[up] config skipped (missing token/config)", {
				hasBearer: Boolean(bearer),
				hasUrl: Boolean(supabaseUrl),
				hasAnon: Boolean(anonKey),
			});
		}
	} catch (error) {
		logger.warn("[uploader] refresh config failed", error);
	}
}

export async function enqueueRecapdUploads(items: RecapdUploaderItemArgs[]): Promise<void> {
	if (items.length === 0) return;
	installListenersOnce();
	await refreshUploaderConfig();
	const inputs: UploadItemInput[] = items.map((item) => {
		pendingMeta.set(item.uploadId, {
			uploadId: item.uploadId,
			eventId: item.eventId,
			userId: item.userId,
			mediaType: item.mediaType,
			capturedAt: item.capturedAt.toISOString(),
			width: item.width,
			height: item.height,
			duration: item.duration,
			latitude: item.latitude,
			longitude: item.longitude,
			fileSize: item.fileSize,
			thumbnailPath: item.thumbnailPath ?? null,
		});
		return {
			uploadId: item.uploadId,
			assetIdentifier: item.assetIdentifier,
			fileUri: item.fileUri,
			objectName: item.objectName,
			contentType: item.contentType,
			mediaType: item.mediaType,
			eventId: item.eventId,
			userId: item.userId,
			fileFingerprint: `${item.uploadId}:${item.fileSize ?? 0}`,
			capturedAt: item.capturedAt.toISOString(),
			width: item.width,
			height: item.height,
			durationMs: Math.round(item.duration ?? 0),
			latitude: item.latitude,
			longitude: item.longitude,
			fileSizeBytes: item.fileSize,
			thumbnailPath: item.thumbnailPath ?? undefined,
		};
	});
	addUploadBreadcrumb("recapd.enqueue", {
		count: inputs.length,
		photoCount: inputs.filter((i) => i.mediaType === "photo").length,
		videoCount: inputs.filter((i) => i.mediaType === "video").length,
	});
	logger.info("[up] enqueue", {
		count: inputs.length,
		sample: inputs[0] ? { assetId: inputs[0].assetIdentifier, obj: inputs[0].objectName } : null,
	});
	try {
		await RecapdUploader.enqueue(inputs);
		logger.info("[up] enqueue ok");
	} catch (e) {
		logger.error("[up] enqueue threw", e);
		throw e;
	}
	const logQueue = async (tag: string) => {
		try {
			const state = await RecapdUploader.getQueueState();
			const phases: Record<string, number> = {};
			for (const it of state.items) {
				phases[it.status] = (phases[it.status] ?? 0) + 1;
			}
			logger.info(`[up] queue ${tag}`, { total: state.items.length, phases });
		} catch (e) {
			logger.error(`[up] queue ${tag} err`, e);
		}
	};
	await logQueue("t0");
	setTimeout(() => void logQueue("t6"), 6000);
}

export async function retryRecapdUpload(uploadId: string): Promise<void> {
	await refreshUploaderConfig();
	await RecapdUploader.retry(uploadId);
}

export async function cancelRecapdUpload(uploadId: string): Promise<void> {
	pendingMeta.delete(uploadId);
	await RecapdUploader.cancel(uploadId);
}

export async function clearRecapdFailed(): Promise<void> {
	await RecapdUploader.clearFailed();
}
