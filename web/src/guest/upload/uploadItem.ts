import { DetailedError, Upload } from "tus-js-client";
import { guestSupabase } from "../supabase";
import { checkFile, UNSUPPORTED_MESSAGE, type UploadLimits } from "./limits";
import { type MediaMetadata, readMetadata } from "./metadata";
import { buildStoragePath, type ResolvedMedia, resolveMedia, thumbPath } from "./paths";
import { makeThumbnail } from "./thumbnail";

export type UploadErrorCode = "too_large" | "too_long" | "network" | "verify_failed" | "rejected";

export class UploadError extends Error {
	code: UploadErrorCode;
	retryable: boolean;

	constructor(code: UploadErrorCode, message: string) {
		super(message);
		this.name = "UploadError";
		this.code = code;
		this.retryable = code === "network" || code === "verify_failed";
	}
}

export type UploadStage = "idle" | "prepare" | "thumbnail" | "transfer" | "verify" | "record";

export type UploadTask = {
	run(onProgress: (fraction: number) => void): Promise<void>;
	abort(): void;
	discard(): Promise<void>;
	stage(): UploadStage;
};

export type UploadInput = {
	file: File;
	eventId: string;
	profileId: string;
	getLimits: () => Promise<UploadLimits>;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const TUS_ENDPOINT = `${SUPABASE_URL}/storage/v1/upload/resumable`;
const CHUNK_SIZE = 6 * 1024 * 1024;
const TOKEN_MARGIN_MS = 60 * 1000;
const TUS_SHARE = 0.95;

const NETWORK_MESSAGE = "Connection lost. Check your network and tap Retry.";
const PAUSED_MESSAGE = "Paused";

type Prepared = {
	media: ResolvedMedia;
	meta: MediaMetadata;
	storagePath: string;
	thumbnailPath: string;
};

async function freshAccessToken(): Promise<string> {
	const { data } = await guestSupabase.auth.getSession();
	let session = data.session;
	if (session?.expires_at && session.expires_at * 1000 - Date.now() < TOKEN_MARGIN_MS) {
		const refreshed = await guestSupabase.auth.refreshSession();
		session = refreshed.data.session ?? session;
	}
	if (!session) throw new UploadError("rejected", "Your guest session ended. Reload the page.");
	return session.access_token;
}

function tusError(error: Error | DetailedError): UploadError {
	const response = error instanceof DetailedError ? error.originalResponse : null;
	const status = response?.getStatus() ?? 0;
	if (status === 413) return new UploadError("too_large", "This file is too large for this event");
	if (status === 0 || status === 408 || status === 429 || status >= 500) {
		return new UploadError("network", NETWORK_MESSAGE);
	}
	const body = response?.getBody()?.trim();
	return new UploadError("rejected", body ? `Upload was refused: ${body}` : "Upload was refused");
}

function isClientError(error: unknown): boolean {
	const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
	const code = Number(status ?? statusCode);
	return code >= 400 && code < 500;
}

export function createUploadTask(input: UploadInput): UploadTask {
	const { file, eventId, profileId, getLimits } = input;
	let prepared: Prepared | null = null;
	let thumbnailPath: string | null = null;
	let thumbnailSettled = false;
	let tus: Upload | null = null;
	let tusDone = false;
	let verified = false;
	let insertAttempted = false;
	let recorded = false;
	let generation = 0;
	let stage: UploadStage = "idle";
	let current: Promise<void> | null = null;
	let cancelRun: ((error: UploadError) => void) | null = null;
	let cancelTransfer: ((error: UploadError) => void) | null = null;

	async function prepare(): Promise<Prepared> {
		if (prepared) return prepared;
		const media = resolveMedia(file.name, file.type);
		if (!media) throw new UploadError("rejected", UNSUPPORTED_MESSAGE);
		let limits: UploadLimits;
		try {
			limits = await getLimits();
		} catch {
			throw new UploadError("network", NETWORK_MESSAGE);
		}
		const meta = await readMetadata(file, media.mediaType);
		const check = checkFile(
			file,
			{ mediaType: media.mediaType, durationMs: meta.durationMs },
			limits
		);
		if (!check.ok) {
			throw new UploadError(
				check.reason === "unsupported" ? "rejected" : check.reason,
				check.message
			);
		}
		const storagePath = buildStoragePath(eventId, profileId, media.ext);
		prepared = { media, meta, storagePath, thumbnailPath: thumbPath(storagePath) };
		return prepared;
	}

	async function uploadThumbnail(job: Prepared): Promise<void> {
		if (thumbnailSettled) return;
		const blob = await makeThumbnail(file, job.media.mediaType);
		if (!blob) {
			thumbnailSettled = true;
			return;
		}
		const { error } = await guestSupabase.storage
			.from("thumbnails")
			.upload(job.thumbnailPath, blob, {
				contentType: "image/jpeg",
				cacheControl: "3600",
				upsert: false,
			});
		const exists = error && /exists|duplicate/i.test(error.message);
		if (!error || exists) {
			thumbnailPath = job.thumbnailPath;
			thumbnailSettled = true;
		}
	}

	function uploadOriginal(job: Prepared, onProgress: (fraction: number) => void): Promise<void> {
		return new Promise((resolve, reject) => {
			cancelTransfer = reject;
			if (!tus) {
				tus = new Upload(file, {
					endpoint: TUS_ENDPOINT,
					chunkSize: CHUNK_SIZE,
					retryDelays: null,
					uploadDataDuringCreation: true,
					storeFingerprintForResuming: false,
					removeFingerprintOnSuccess: true,
					headers: { "x-upsert": "false", apikey: SUPABASE_ANON_KEY },
					metadata: {
						bucketName: "event-photos",
						objectName: job.storagePath,
						contentType: job.media.contentType,
						cacheControl: "3600",
					},
					onBeforeRequest: async (request) => {
						request.setHeader("authorization", `Bearer ${await freshAccessToken()}`);
					},
				});
			}
			tus.options.onProgress = (sent, total) => onProgress(total ? (sent / total) * TUS_SHARE : 0);
			tus.options.onSuccess = () => resolve();
			tus.options.onError = (error) => reject(tusError(error));
			tus.start();
		});
	}

	async function replaceBadOriginal(job: Prepared): Promise<void> {
		await guestSupabase.storage
			.from("event-photos")
			.remove([job.storagePath])
			.catch(() => undefined);
		if (thumbnailPath) {
			await guestSupabase.storage
				.from("thumbnails")
				.remove([thumbnailPath])
				.catch(() => undefined);
		}
		const storagePath = buildStoragePath(eventId, profileId, job.media.ext);
		prepared = { ...job, storagePath, thumbnailPath: thumbPath(storagePath) };
		tus = null;
		tusDone = false;
		thumbnailPath = null;
		thumbnailSettled = false;
	}

	async function verifyOriginal(job: Prepared): Promise<void> {
		const { data, error } = await guestSupabase.storage.from("event-photos").info(job.storagePath);
		if (error && !isClientError(error)) throw new UploadError("network", NETWORK_MESSAGE);
		if (error || Number(data?.size) !== file.size) {
			await replaceBadOriginal(job);
			throw new UploadError("verify_failed", "Upload could not be confirmed. Tap Retry.");
		}
	}

	async function alreadyRecorded(job: Prepared): Promise<boolean> {
		const { data, error } = await guestSupabase
			.from("media_items")
			.select("id")
			.eq("storage_path", job.storagePath)
			.maybeSingle();
		if (error) throw new UploadError("network", NETWORK_MESSAGE);
		return Boolean(data);
	}

	async function discardObjects(job: Prepared): Promise<void> {
		await guestSupabase.storage.from("event-photos").remove([job.storagePath]);
		if (thumbnailPath) await guestSupabase.storage.from("thumbnails").remove([thumbnailPath]);
		tus = null;
		tusDone = false;
		verified = false;
		thumbnailPath = null;
		thumbnailSettled = false;
	}

	async function record(job: Prepared): Promise<void> {
		if (recorded) return;
		if (insertAttempted && (await alreadyRecorded(job))) {
			recorded = true;
			return;
		}
		insertAttempted = true;
		const isVideo = job.media.mediaType === "video";
		const { error } = await guestSupabase.from("media_items").insert({
			event_id: eventId,
			uploaded_by_user_id: profileId,
			captured_at: job.meta.capturedAt.toISOString(),
			media_type: job.media.mediaType,
			width: job.meta.width,
			height: job.meta.height,
			duration_milliseconds: isVideo ? job.meta.durationMs : null,
			file_size_bytes: file.size,
			storage_path: job.storagePath,
			thumbnail_path: thumbnailPath,
			visibility: "shared",
		});
		if (!error) {
			recorded = true;
			return;
		}
		if (!error.code) throw new UploadError("network", NETWORK_MESSAGE);
		await discardObjects(job).catch(() => undefined);
		insertAttempted = false;
		const policy = error.code === "42501" || /row-level security/i.test(error.message);
		throw new UploadError(
			"rejected",
			policy
				? isVideo
					? "This video is too large or too long for this event"
					: "This file is too large for this event"
				: "The upload was refused. Please try again later."
		);
	}

	async function pipeline(runId: number, onProgress: (fraction: number) => void): Promise<void> {
		const live = (next: UploadStage) => {
			if (runId !== generation) throw new UploadError("network", PAUSED_MESSAGE);
			stage = next;
		};
		live("prepare");
		const job = await prepare();
		await freshAccessToken();
		live("thumbnail");
		await uploadThumbnail(job).catch(() => undefined);
		live("transfer");
		if (!tusDone) {
			await uploadOriginal(job, onProgress);
			tusDone = true;
		}
		live("verify");
		if (!verified) {
			await verifyOriginal(job);
			verified = true;
		}
		live("record");
		await record(job);
		onProgress(1);
	}

	function stop() {
		generation += 1;
		const upload = tus;
		if (upload) void upload.abort().catch(() => undefined);
		const paused = new UploadError("network", PAUSED_MESSAGE);
		cancelTransfer?.(paused);
		cancelTransfer = null;
		cancelRun?.(paused);
		cancelRun = null;
	}

	return {
		run(onProgress) {
			generation += 1;
			const runId = generation;
			const previous = current ?? Promise.resolve();
			const next = previous.then(() => pipeline(runId, onProgress));
			current = next.then(
				() => {
					stage = "idle";
				},
				() => {
					stage = "idle";
				}
			);
			return new Promise<void>((resolve, reject) => {
				cancelRun = reject;
				next.then(resolve, (error: unknown) =>
					reject(error instanceof UploadError ? error : new UploadError("network", NETWORK_MESSAGE))
				);
			});
		},
		abort: stop,
		async discard() {
			stop();
			await current;
			if (recorded || !prepared) return;
			const job = prepared;
			const uploadedOriginal = tusDone;
			const upload = tus;
			tus = null;
			if (uploadedOriginal) {
				await guestSupabase.storage
					.from("event-photos")
					.remove([job.storagePath])
					.catch(() => undefined);
			} else if (upload?.url) {
				await Upload.terminate(upload.url, upload.options).catch(() => undefined);
			}
			if (thumbnailPath) {
				await guestSupabase.storage
					.from("thumbnails")
					.remove([thumbnailPath])
					.catch(() => undefined);
			}
		},
		stage: () => stage,
	};
}
