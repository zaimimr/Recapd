import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	cacheDirectory,
	copyAsync,
	deleteAsync,
	documentDirectory,
	downloadAsync,
	getInfoAsync,
	makeDirectoryAsync,
} from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useEffect, useState } from "react";
import type { MediaItemInsert, MediaItemWithUser } from "@/types/database";
import { safeDate } from "./dateUtils";
import { logger } from "./logger";
import { addUploadBreadcrumb } from "./sentry";
import { supabase } from "./supabase";
import { uploadMediaResumable } from "./tusUpload";
import {
	cleanupOrphanedUploadSources,
	type MaterializedSource,
	materializeUploadSource,
	UploadSourceUnavailableError,
} from "./uploadSource";

export { cleanupOrphanedUploadSources, UploadSourceUnavailableError };

const DOWNLOADED_PHOTOS_KEY = "recapd_downloaded_photos";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_REFRESH_BUFFER_MS = 60 * 1000;
const TUS_PHOTO_TIMEOUT_MS = 30 * 60 * 1000;
const TUS_VIDEO_TIMEOUT_MS = 60 * 60 * 1000;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const PHOTO_THUMBNAIL_TRANSFORM = {
	width: 720,
	height: 720,
	quality: 60,
	resize: "cover" as const,
};

export interface UploadResult {
	success: boolean;
	path?: string;
	error?: string;
	failureReason?: UploadFailureReason;
	thumbnailPath?: string | null;
	mediaItem?: MediaItemWithUser;
}

export interface UploadProgress {
	current: number;
	total: number;
	percentage: number;
}

export type MediaType = "photo" | "video";
export type UploadFailureReason =
	| "timeout"
	| "network"
	| "permission"
	| "storage"
	| "database"
	| "thumbnail"
	| "unknown";

export type DownloadFailureReason = "out_of_space" | "network" | "server" | "unknown";

export class DownloadError extends Error {
	readonly reason: DownloadFailureReason;

	constructor(reason: DownloadFailureReason, cause?: unknown) {
		super(`Download failed: ${reason}`);
		this.name = "DownloadError";
		this.reason = reason;
		if (cause !== undefined) {
			(this as { cause?: unknown }).cause = cause;
		}
	}
}

function isOutOfSpaceMessage(message: string): boolean {
	const lower = message.toLowerCase();
	return (
		lower.includes("no space left") ||
		lower.includes("enough space") ||
		lower.includes("nsposixerrordomain code=28") ||
		lower.includes("code=640") ||
		lower.includes("enospc") ||
		lower.includes("disk full")
	);
}

export function classifyDownloadError(error: unknown): DownloadFailureReason {
	const message = error instanceof Error ? error.message : String(error);
	if (isOutOfSpaceMessage(message)) return "out_of_space";
	if (isNetworkErrorMessage(message)) return "network";
	return "unknown";
}

export function describeDownloadFailure(reason: DownloadFailureReason): string {
	switch (reason) {
		case "out_of_space":
			return "Your device is out of storage. Free up some space, then try again.";
		case "network":
			return "Your connection dropped. Reconnect to a stronger network and try again.";
		case "server":
			return "We couldn't reach the photo right now. Please try again in a moment.";
		default:
			return "Something went wrong. Please try again.";
	}
}

function isNetworkErrorMessage(message: string): boolean {
	const lower = message.toLowerCase();
	return (
		lower.includes("network request failed") ||
		lower.includes("network error") ||
		lower.includes("econnreset") ||
		lower.includes("econnaborted") ||
		lower.includes("etimedout") ||
		lower.includes("enotfound") ||
		lower.includes("socket hang up") ||
		lower.includes("fetch failed")
	);
}

function isRetryableHttpStatus(status: number): boolean {
	return status === 408 || status === 429 || (status >= 500 && status < 600);
}

export function classifyUploadError(error: unknown): UploadFailureReason {
	if (error instanceof UploadSourceUnavailableError) {
		return error.reason === "disk" ? "storage" : "permission";
	}
	if (error instanceof Error) {
		if (error.message === "timeout") return "timeout";
		if (isNetworkErrorMessage(error.message)) return "network";
		const httpStatus = (error as Error & { httpStatus?: number }).httpStatus;
		if (typeof httpStatus === "number" && isRetryableHttpStatus(httpStatus)) {
			return "network";
		}
	}
	return "storage";
}

export interface UploadMediaOptions {
	uri: string;
	eventId: string;
	userId: string;
	capturedAt: Date;
	width?: number;
	height?: number;
	fileSize?: number;
	mediaType?: MediaType;
	duration?: number;
	latitude?: number;
	longitude?: number;
	assetId?: string;
	uploadId?: string;
}

export function getContentType(extension: string, mediaType: MediaType): string {
	if (mediaType === "video") {
		switch (extension) {
			case "mov":
				return "video/quicktime";
			case "webm":
				return "video/webm";
			case "avi":
				return "video/x-msvideo";
			case "m4v":
				return "video/x-m4v";
			default:
				return "video/mp4";
		}
	}
	switch (extension) {
		case "png":
			return "image/png";
		case "heic":
			return "image/heic";
		case "heif":
			return "image/heif";
		case "webp":
			return "image/webp";
		default:
			return "image/jpeg";
	}
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

export function getPathExtension(filePath: string, mediaType: MediaType): string {
	const fallbackExtension = mediaType === "video" ? "mp4" : "jpg";
	const lastSegment = filePath.split("/").pop() || "";
	const match = lastSegment.match(/\.([a-z0-9]+)$/i);
	return match?.[1]?.toLowerCase() || fallbackExtension;
}

async function getCurrentProfileId(): Promise<string | null> {
	const {
		data: { session },
		error: sessionError,
	} = await supabase.auth.getSession();

	if (sessionError) {
		throw sessionError;
	}

	if (!session) {
		return null;
	}

	const { data, error } = await supabase
		.from("users")
		.select("id")
		.eq("auth_user_id", session.user.id)
		.maybeSingle();

	if (error) {
		throw error;
	}

	return data?.id ?? null;
}

async function uploadFileViaTus(args: {
	bucket: string;
	storagePath: string;
	filePath: string;
	fileSize: number;
	contentType: string;
	mediaType: MediaType;
	fileFingerprint: string;
}): Promise<{ path: string }> {
	const { bucket, storagePath, filePath, fileSize, contentType, mediaType, fileFingerprint } =
		args;
	const timeoutMs = mediaType === "video" ? TUS_VIDEO_TIMEOUT_MS : TUS_PHOTO_TIMEOUT_MS;
	return withTimeout(
		uploadMediaResumable({
			fileUri: filePath.startsWith("file://") ? filePath : `file://${filePath}`,
			fileSize,
			bucket,
			objectName: storagePath,
			contentType,
			fileFingerprint,
		}),
		timeoutMs
	);
}

async function withTempFileCleanup<T>(uri: string, work: () => Promise<T>): Promise<T> {
	try {
		return await work();
	} finally {
		try {
			await deleteAsync(uri, { idempotent: true });
		} catch (error) {
			logger.warn("Temp file cleanup failed", error, { uri });
		}
	}
}

const GRID_THUMB_DIR = `${documentDirectory}grid-thumbs/`;
const GRID_THUMB_TARGET_WIDTH = 512;
const GRID_THUMB_MAX_CONCURRENT = 2;

let gridThumbActive = 0;
const gridThumbWaiters: Array<() => void> = [];
const gridThumbInflight = new Map<string, Promise<string | null>>();

async function acquireGridThumbSlot(): Promise<void> {
	if (gridThumbActive < GRID_THUMB_MAX_CONCURRENT) {
		gridThumbActive++;
		return;
	}
	await new Promise<void>((resolve) => gridThumbWaiters.push(resolve));
	gridThumbActive++;
}

function releaseGridThumbSlot(): void {
	gridThumbActive--;
	const next = gridThumbWaiters.shift();
	if (next) next();
}

async function ensureGridThumbDir(): Promise<void> {
	const info = await getInfoAsync(GRID_THUMB_DIR);
	if (!info.exists) {
		await makeDirectoryAsync(GRID_THUMB_DIR, { intermediates: true });
	}
}

async function generatePhotoGridThumbnail(
	photoId: string,
	sourceUri: string
): Promise<string | null> {
	try {
		await ensureGridThumbDir();
		const target = `${GRID_THUMB_DIR}${photoId}.jpg`;
		const cached = await getInfoAsync(target);
		if (cached.exists && !cached.isDirectory) {
			return target;
		}
		await acquireGridThumbSlot();
		try {
			const recheck = await getInfoAsync(target);
			if (recheck.exists && !recheck.isDirectory) {
				return target;
			}
			const sourceInfo = await getInfoAsync(sourceUri.replace(/[?#].*$/, ""));
			const usableUri =
				sourceInfo.exists && !sourceInfo.isDirectory
					? sourceUri.replace(/[?#].*$/, "")
					: sourceUri;
			const result = await ImageManipulator.manipulateAsync(
				usableUri,
				[{ resize: { width: GRID_THUMB_TARGET_WIDTH } }],
				{ compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
			);
			try {
				await copyAsync({ from: result.uri, to: target });
				await deleteAsync(result.uri, { idempotent: true });
				return target;
			} catch {
				return result.uri;
			}
		} finally {
			releaseGridThumbSlot();
		}
	} catch (error) {
		addUploadBreadcrumb(
			"grid-thumb.failed",
			{
				photoId,
				uriScheme: sourceUri.startsWith("ph://")
					? "ph"
					: sourceUri.startsWith("file://")
						? "file"
						: "other",
				err: error instanceof Error ? error.message : String(error),
			},
			"warning"
		);
		return null;
	}
}

export function getOrCreatePhotoGridThumbnail(
	photoId: string,
	sourceUri: string
): Promise<string | null> {
	const existing = gridThumbInflight.get(photoId);
	if (existing) return existing;
	const work = generatePhotoGridThumbnail(photoId, sourceUri).finally(() => {
		gridThumbInflight.delete(photoId);
	});
	gridThumbInflight.set(photoId, work);
	return work;
}

export async function deletePhotoGridThumbnail(photoId: string): Promise<void> {
	try {
		const target = `${GRID_THUMB_DIR}${photoId}.jpg`;
		await deleteAsync(target, { idempotent: true });
	} catch {}
}

export async function createVideoThumbnailUri(
	videoUri: string,
	timeMs: number = 1000
): Promise<string | null> {
	try {
		const info = await getInfoAsync(videoUri.replace(/[?#].*$/, ""));
		const usableUri = info.exists && !info.isDirectory ? videoUri.replace(/[?#].*$/, "") : videoUri;
		const { uri } = await withTimeout(
			VideoThumbnails.getThumbnailAsync(usableUri, {
				time: timeMs,
				quality: 0.7,
			}),
			15000
		);

		return uri;
	} catch (error) {
		addUploadBreadcrumb(
			"thumbnail.generation.failed",
			{
				uriScheme: videoUri.startsWith("ph://")
					? "ph"
					: videoUri.startsWith("file://")
						? "file"
						: "other",
				err: error instanceof Error ? error.message : String(error),
			},
			"warning"
		);
		return null;
	}
}

async function generateAndUploadThumbnail(args: {
	sourcePath: string;
	eventId: string;
	userId: string;
	timestamp: number;
	uniqueSuffix: string;
	mediaType: MediaType;
	uploadId: string;
}): Promise<string | null> {
	const { sourcePath, eventId, userId, timestamp, uniqueSuffix, mediaType, uploadId } = args;
	if (mediaType === "photo") {
		return null;
	}

	try {
		const thumbnailUri = await createVideoThumbnailUri(sourcePath);
		if (!thumbnailUri) {
			return null;
		}

		const thumbnailPath = `${eventId}/${userId}/${timestamp}_${uniqueSuffix}_thumb.jpg`;
		const thumbInfo = await getInfoAsync(thumbnailUri);
		const thumbSize =
			thumbInfo.exists && !thumbInfo.isDirectory && typeof thumbInfo.size === "number"
				? thumbInfo.size
				: 0;
		if (thumbSize === 0) {
			logger.warn("Generated thumbnail is empty", undefined, { thumbnailUri });
			return null;
		}

		const result = await withTempFileCleanup(thumbnailUri, () =>
			uploadFileViaTus({
				bucket: "thumbnails",
				storagePath: thumbnailPath,
				filePath: thumbnailUri,
				fileSize: thumbSize,
				contentType: "image/jpeg",
				mediaType: "photo",
				fileFingerprint: `${uploadId}:thumb:${thumbSize}`,
			})
		);

		return result.path;
	} catch (error) {
		logger.warn("Thumbnail generation error", error, { eventId, userId });
		return null;
	}
}

export async function uploadMedia(options: UploadMediaOptions): Promise<UploadResult> {
	const {
		uri,
		eventId,
		userId,
		capturedAt,
		width,
		height,
		fileSize,
		mediaType = "photo",
		duration,
		latitude,
		longitude,
		assetId,
		uploadId,
	} = options;

	const effectiveUploadId =
		uploadId ?? `upl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
	const overallStart = Date.now();
	addUploadBreadcrumb("uploadMedia.enter", {
		uploadId: effectiveUploadId,
		eventId,
		userId,
		mediaType,
		knownSize: fileSize,
		hasAssetId: Boolean(assetId),
	});

	const currentProfileId = await getCurrentProfileId();
	if (!currentProfileId) {
		addUploadBreadcrumb(
			"uploadMedia.no-session",
			{ uploadId: effectiveUploadId, eventId, userId },
			"warning"
		);
		logger.warn("Skipping upload without an active profile", undefined, { eventId, userId });
		return {
			success: false,
			error: "Your session expired. Re-open the event and try again.",
			failureReason: "permission",
		};
	}

	if (currentProfileId !== userId) {
		addUploadBreadcrumb(
			"uploadMedia.stale-profile",
			{ uploadId: effectiveUploadId, eventId, userId, currentProfileId },
			"warning"
		);
		logger.warn("Skipping upload for stale profile", undefined, {
			eventId,
			queuedUserId: userId,
			currentProfileId,
		});
		return {
			success: false,
			error: "Your session changed. Re-select the media and try again.",
			failureReason: "permission",
		};
	}

	let materialized: MaterializedSource | null = null;
	try {
		try {
			materialized = await materializeUploadSource({
				uri,
				assetId,
				uploadId: effectiveUploadId,
				mediaType,
				knownSize: fileSize,
			});
		} catch (sourceError) {
			if (sourceError instanceof UploadSourceUnavailableError) {
				addUploadBreadcrumb(
					"uploadMedia.materialize.unavailable",
					{
						uploadId: effectiveUploadId,
						reason: sourceError.reason,
						err: sourceError.message,
					},
					"warning"
				);
				logger.warn("Upload source unavailable", sourceError, {
					eventId,
					userId,
					uri,
					assetId,
					reason: sourceError.reason,
				});
				const userMessage =
					sourceError.reason === "icloud"
						? "This item is in iCloud and could not be downloaded. Open it in Photos first, then retry."
						: sourceError.reason === "disk"
							? sourceError.message
							: "We couldn't read this item. It may have been deleted from your library.";
				return {
					success: false,
					error: userMessage,
					failureReason: sourceError.reason === "disk" ? "storage" : "permission",
				};
			}
			throw sourceError;
		}

		const validCapturedAt = safeDate(capturedAt);
		const timestamp = Date.now();
		const uniqueSuffix = Math.random().toString(36).substring(2, 10);
		const extension = getPathExtension(materialized.path, mediaType);
		const fileName = `${eventId}/${userId}/${timestamp}_${uniqueSuffix}.${extension}`;
		const contentType = getContentType(extension, mediaType);
		const mediaSize = materialized.size;
		const tusFingerprint = `${effectiveUploadId}:${mediaSize}`;

		let uploadData: { path: string };
		try {
			uploadData = await uploadFileViaTus({
				bucket: "event-photos",
				storagePath: fileName,
				filePath: materialized.path,
				fileSize: mediaSize,
				contentType,
				mediaType,
				fileFingerprint: tusFingerprint,
			});
			addUploadBreadcrumb("uploadMedia.tus.ok", {
				uploadId: effectiveUploadId,
				storagePath: uploadData.path,
				sizeBytes: mediaSize,
			});
		} catch (uploadError) {
			const failureReason: UploadFailureReason = classifyUploadError(uploadError);
			addUploadBreadcrumb(
				"uploadMedia.tus.failed",
				{
					uploadId: effectiveUploadId,
					storagePath: fileName,
					sizeBytes: mediaSize,
					failureReason,
					err: uploadError instanceof Error ? uploadError.message : String(uploadError),
					httpStatus:
						uploadError && typeof uploadError === "object" && "httpStatus" in uploadError
							? (uploadError as { httpStatus?: number }).httpStatus
							: undefined,
				},
				"error"
			);
			logger.error("Storage upload error", uploadError, { eventId, userId });
			const baseMessage =
				uploadError instanceof Error ? uploadError.message : "Storage upload failed";
			let userMessage = baseMessage;
			if (failureReason === "timeout") {
				userMessage =
					"Upload took too long. Reconnect to a stable network and we'll retry automatically.";
			} else if (failureReason === "network") {
				userMessage = "Network hiccup during upload. We'll retry automatically.";
			}
			return {
				success: false,
				error: userMessage,
				failureReason,
			};
		}

		const thumbnailPath = await generateAndUploadThumbnail({
			sourcePath: materialized.path,
			eventId,
			userId,
			timestamp,
			uniqueSuffix,
			mediaType,
			uploadId: effectiveUploadId,
		});

		const insertData: MediaItemInsert = {
			event_id: eventId,
			uploaded_by_user_id: userId,
			captured_at: validCapturedAt.toISOString(),
			media_type: mediaType,
			width,
			height,
			duration_milliseconds: mediaType === "video" ? Math.round(duration || 0) : null,
			file_size_bytes: fileSize || mediaSize,
			storage_path: uploadData.path,
			thumbnail_path: thumbnailPath,
			visibility: "shared",
			latitude: latitude ?? null,
			longitude: longitude ?? null,
		};

		const { data: mediaItem, error: dbError } = await supabase
			.from("media_items")
			.insert(insertData)
			.select("*, uploader:users!uploaded_by_user_id(display_name)")
			.single();

		if (dbError) {
			addUploadBreadcrumb(
				"uploadMedia.db.failed",
				{
					uploadId: effectiveUploadId,
					storagePath: uploadData.path,
					dbCode: dbError.code,
					dbMessage: dbError.message,
				},
				"error"
			);
			logger.error("Database insert error", dbError, { eventId, userId });
			await supabase.storage.from("event-photos").remove([uploadData.path]);
			if (thumbnailPath) {
				await supabase.storage.from("thumbnails").remove([thumbnailPath]);
			}
			const isPolicyFailure =
				dbError.code === "42501" || dbError.message?.toLowerCase().includes("row-level security");
			return {
				success: false,
				error: isPolicyFailure
					? mediaType === "video"
						? "This video is too large or too long for this event's plan."
						: "This file is too large for this event's plan."
					: dbError.message,
				failureReason: "database",
			};
		}

		addUploadBreadcrumb("uploadMedia.success", {
			uploadId: effectiveUploadId,
			storagePath: uploadData.path,
			thumbnailPath,
			elapsedMs: Date.now() - overallStart,
		});
		return {
			success: true,
			path: uploadData.path,
			thumbnailPath,
			mediaItem: mediaItem as MediaItemWithUser,
		};
	} catch (error) {
		addUploadBreadcrumb(
			"uploadMedia.unhandled",
			{
				uploadId: effectiveUploadId,
				err: error instanceof Error ? error.message : String(error),
				elapsedMs: Date.now() - overallStart,
			},
			"error"
		);
		logger.error("Upload error", error, { eventId, userId });
		const failureReason: UploadFailureReason = classifyUploadError(error);
		return {
			success: false,
			error: `Failed to upload ${mediaType}`,
			failureReason,
		};
	} finally {
		if (materialized) {
			try {
				await materialized.cleanup();
			} catch (cleanupError) {
				logger.warn("Materialized source cleanup failed", cleanupError, {
					path: materialized.path,
				});
			}
		}
	}
}

function getBucketForPath(storagePath: string) {
	return storagePath.endsWith("_thumb.jpg") || storagePath.endsWith("_thumb.png")
		? "thumbnails"
		: "event-photos";
}

export interface StorageUrlTransformOptions {
	width?: number;
	height?: number;
	quality?: number;
	resize?: "cover" | "contain" | "fill";
	format?: "origin";
}

interface ResolveStorageUrlOptions {
	transform?: StorageUrlTransformOptions;
}

export function isHeicPath(storagePath?: string | null): boolean {
	if (!storagePath) {
		return false;
	}

	return /\.(heic|heif)$/i.test(storagePath);
}

function supportsPhotoThumbnailTransform(storagePath?: string | null): boolean {
	if (!storagePath) {
		return false;
	}

	return !isHeicPath(storagePath);
}

function getSignedUrlCacheKey(storagePath: string, options?: ResolveStorageUrlOptions): string {
	return JSON.stringify([storagePath, options?.transform ?? null]);
}

export async function resolveStorageUrl(
	storagePath: string,
	options?: ResolveStorageUrlOptions
): Promise<string> {
	if (storagePath.startsWith("http")) {
		return storagePath;
	}

	const cacheKey = getSignedUrlCacheKey(storagePath, options);
	const cached = signedUrlCache.get(cacheKey);
	if (cached && cached.expiresAt - Date.now() > SIGNED_URL_REFRESH_BUFFER_MS) {
		return cached.url;
	}

	const bucket = getBucketForPath(storagePath);
	const { data, error } = await supabase.storage
		.from(bucket)
		.createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, options);

	if (error || !data?.signedUrl) {
		addUploadBreadcrumb(
			"signedUrl.failed",
			{
				bucket,
				storagePath,
				transformed: Boolean(options?.transform),
				errCode:
					error && typeof error === "object" && "code" in (error as unknown as Record<string, unknown>)
						? (error as unknown as { code?: string }).code
						: undefined,
				errName: error?.name,
				errMessage: error?.message,
			},
			"warning"
		);
		throw error || new Error("Signed URL was not returned");
	}

	const signedUrl = {
		url: data.signedUrl,
		expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
	};
	signedUrlCache.set(cacheKey, signedUrl);
	return signedUrl.url;
}

export function useStorageUrl(
	storagePath?: string | null,
	options?: ResolveStorageUrlOptions
): string | null {
	const [resolvedUrl, setResolvedUrl] = useState<string | null>(
		storagePath?.startsWith("http") ? storagePath : null
	);
	const _transformKey = JSON.stringify(options?.transform ?? null);

	useEffect(() => {
		let isCancelled = false;

		if (!storagePath) {
			setResolvedUrl(null);
			return () => {
				isCancelled = true;
			};
		}

		if (storagePath.startsWith("http")) {
			setResolvedUrl(storagePath);
			return () => {
				isCancelled = true;
			};
		}

		resolveStorageUrl(storagePath, options)
			.then((url) => {
				if (!isCancelled) {
					setResolvedUrl(url);
				}
			})
			.catch((error) => {
				logger.error("Failed to resolve storage URL", error, {
					storagePath,
					transform: options?.transform ?? null,
				});
				if (!isCancelled) {
					setResolvedUrl(null);
				}
			});

		return () => {
			isCancelled = true;
		};
	}, [storagePath, options]);

	return resolvedUrl;
}

export function usePhotoThumbnailUrl(storagePath?: string | null): string | null {
	return useStorageUrl(
		storagePath,
		supportsPhotoThumbnailTransform(storagePath)
			? {
					transform: PHOTO_THUMBNAIL_TRANSFORM,
				}
			: undefined
	);
}

interface HlsSegment {
	offset: number;
	length: number;
	duration: number;
}

interface HlsByteRangeManifest {
	version: number;
	totalSize: number;
	duration: number;
	segments: HlsSegment[];
}

function base64EncodeAscii(input: string): string {
	if (typeof btoa === "function") {
		return btoa(input);
	}
	const bytes = new TextEncoder().encode(input);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return (globalThis as { btoa?: (s: string) => string }).btoa?.(binary) ?? "";
}

export function buildByteRangeM3u8(manifest: HlsByteRangeManifest, mp4SignedUrl: string): string {
	const targetDuration = Math.max(
		1,
		Math.ceil(manifest.segments.reduce((max, s) => Math.max(max, s.duration), 0))
	);
	const lines: string[] = [
		"#EXTM3U",
		"#EXT-X-VERSION:7",
		`#EXT-X-TARGETDURATION:${targetDuration}`,
		"#EXT-X-PLAYLIST-TYPE:VOD",
		"#EXT-X-INDEPENDENT-SEGMENTS",
	];
	let previousOffsetEnd = -1;
	for (const segment of manifest.segments) {
		lines.push(`#EXTINF:${segment.duration.toFixed(3)},`);
		if (segment.offset === previousOffsetEnd) {
			lines.push(`#EXT-X-BYTERANGE:${segment.length}`);
		} else {
			lines.push(`#EXT-X-BYTERANGE:${segment.length}@${segment.offset}`);
		}
		lines.push(mp4SignedUrl);
		previousOffsetEnd = segment.offset + segment.length;
	}
	lines.push("#EXT-X-ENDLIST");
	return lines.join("\n");
}

async function fetchHlsManifest(hlsPath: string): Promise<HlsByteRangeManifest | null> {
	try {
		const manifestUrl = await resolveStorageUrl(hlsPath);
		const response = await withTimeout(fetch(manifestUrl), 10000);
		if (!response.ok) return null;
		const data = (await response.json()) as HlsByteRangeManifest;
		if (!data?.segments || data.segments.length === 0) return null;
		return data;
	} catch (error) {
		logger.warn("HLS manifest fetch failed", error, { hlsPath });
		return null;
	}
}

export interface VideoPlaybackSource {
	storage_path: string;
	hls_path?: string | null;
	isPending?: boolean;
	localUri?: string;
}

export function useVideoPlaybackUri(media: VideoPlaybackSource | null | undefined): string | null {
	const storagePath = media?.storage_path ?? null;
	const hlsPath = media?.hls_path ?? null;
	const isPending = media?.isPending ?? false;
	const pendingLocalUri = isPending ? (media?.localUri ?? null) : null;

	const [uri, setUri] = useState<string | null>(pendingLocalUri);

	useEffect(() => {
		let cancelled = false;

		if (pendingLocalUri) {
			setUri(pendingLocalUri);
			return () => {
				cancelled = true;
			};
		}
		if (!storagePath) {
			setUri(null);
			return () => {
				cancelled = true;
			};
		}

		(async () => {
			try {
				const mp4SignedUrl = await resolveStorageUrl(storagePath);
				if (cancelled) return;

				if (!hlsPath) {
					setUri(mp4SignedUrl);
					return;
				}

				const manifest = await fetchHlsManifest(hlsPath);
				if (cancelled) return;
				if (!manifest) {
					setUri(mp4SignedUrl);
					return;
				}

				const m3u8 = buildByteRangeM3u8(manifest, mp4SignedUrl);
				const dataUri = `data:application/vnd.apple.mpegurl;base64,${base64EncodeAscii(m3u8)}`;
				setUri(dataUri);
			} catch (error) {
				logger.warn("Video playback URI resolution failed", error, { storagePath });
				if (!cancelled) {
					setUri(null);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [storagePath, hlsPath, pendingLocalUri]);

	return uri;
}

export async function downloadPhoto(storagePath: string, fileName: string): Promise<string> {
	let downloadResult: Awaited<ReturnType<typeof downloadAsync>>;
	try {
		const url = await resolveStorageUrl(storagePath);
		const localUri = `${cacheDirectory}${fileName}`;
		downloadResult = await downloadAsync(url, localUri);
	} catch (error) {
		const reason = classifyDownloadError(error);
		if (reason !== "out_of_space") {
			logger.error("Download error", error, { storagePath });
		}
		throw new DownloadError(reason, error);
	}

	if (downloadResult.status === 200) {
		return downloadResult.uri;
	}

	logger.error("Download error", new Error(`status ${downloadResult.status}`), { storagePath });
	throw new DownloadError("server");
}

export async function isPhotoDownloaded(mediaItemId: string): Promise<boolean> {
	const data = await AsyncStorage.getItem(DOWNLOADED_PHOTOS_KEY);
	const downloadedIds: string[] = data ? JSON.parse(data) : [];
	return downloadedIds.includes(mediaItemId);
}

export async function markPhotoDownloaded(mediaItemId: string): Promise<void> {
	const data = await AsyncStorage.getItem(DOWNLOADED_PHOTOS_KEY);
	const downloadedIds: string[] = data ? JSON.parse(data) : [];
	if (!downloadedIds.includes(mediaItemId)) {
		downloadedIds.push(mediaItemId);
		await AsyncStorage.setItem(DOWNLOADED_PHOTOS_KEY, JSON.stringify(downloadedIds));
	}
}

export async function getDownloadedPhotoIds(): Promise<Set<string>> {
	const data = await AsyncStorage.getItem(DOWNLOADED_PHOTOS_KEY);
	const downloadedIds: string[] = data ? JSON.parse(data) : [];
	return new Set(downloadedIds);
}
