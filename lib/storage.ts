import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	cacheDirectory,
	downloadAsync,
	FileSystemUploadType,
	getFreeDiskStorageAsync,
	getInfoAsync,
	uploadAsync,
} from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useEffect, useState } from "react";
import type { MediaItemInsert, MediaItemWithUser } from "@/types/database";
import { safeDate } from "./dateUtils";
import { logger } from "./logger";
import { supabase } from "./supabase";

const DOWNLOADED_PHOTOS_KEY = "recapd_downloaded_photos";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const SIGNED_URL_REFRESH_BUFFER_MS = 60 * 1000;
const PHOTO_NATIVE_UPLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const VIDEO_NATIVE_UPLOAD_TIMEOUT_MS = 60 * 60 * 1000;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const PHOTO_THUMBNAIL_TRANSFORM = {
	width: 720,
	height: 720,
	quality: 60,
	resize: "cover" as const,
};

export class IcloudAssetUnavailableError extends Error {
	constructor(uri: string) {
		super(`iCloud asset not yet downloaded to this device: ${uri}`);
		this.name = "IcloudAssetUnavailableError";
	}
}

async function resolveIcloudAsset(uri: string): Promise<string> {
	const startedAt = Date.now();
	const assetId = uri.replace("ph://", "").replace("assets-library://", "").split("/")[0];
	const firstAttempt = await MediaLibrary.getAssetInfoAsync(assetId, {
		shouldDownloadFromNetwork: true,
	});
	if (firstAttempt?.localUri) {
		const elapsedMs = Date.now() - startedAt;
		if (elapsedMs > 1500) {
			logger.info("iCloud asset downloaded (first attempt)", { assetId, elapsedMs });
		}
		return firstAttempt.localUri;
	}

	await new Promise((resolve) => setTimeout(resolve, 750));
	const retry = await MediaLibrary.getAssetInfoAsync(assetId, {
		shouldDownloadFromNetwork: true,
	});
	if (retry?.localUri) {
		logger.info("iCloud asset downloaded (retry)", {
			assetId,
			elapsedMs: Date.now() - startedAt,
		});
		return retry.localUri;
	}

	logger.warn("iCloud asset unavailable after retry", {
		assetId,
		elapsedMs: Date.now() - startedAt,
	});
	throw new IcloudAssetUnavailableError(uri);
}

async function getReadableUri(uri: string): Promise<string> {
	if (uri.startsWith("ph://") || uri.startsWith("assets-library://") || !uri.includes("/")) {
		return resolveIcloudAsset(uri);
	}
	return uri;
}

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
	| "storage"
	| "database"
	| "thumbnail"
	| "unknown";

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
	if (error instanceof Error) {
		if (error.message === "timeout") return "timeout";
		if (isNetworkErrorMessage(error.message)) return "network";
	}
	return "storage";
}
type UploadBody = Blob;

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
}

function getContentType(extension: string, mediaType: MediaType): string {
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

function getUploadBodySize(body: UploadBody): number {
	return body.size;
}

function stripUriDecorations(uri: string): string {
	return uri.replace(/[?#].*$/, "");
}

function getPathExtension(uri: string, mediaType: MediaType): string {
	const sanitizedUri = stripUriDecorations(uri);
	const fallbackExtension = mediaType === "video" ? "mp4" : "jpg";

	try {
		const pathname = new URL(sanitizedUri).pathname;
		const lastSegment = pathname.split("/").pop() || "";
		const match = lastSegment.match(/\.([a-z0-9]+)$/i);
		return match?.[1]?.toLowerCase() || fallbackExtension;
	} catch {
		const lastSegment = sanitizedUri.split("/").pop() || "";
		const match = lastSegment.match(/\.([a-z0-9]+)$/i);
		return match?.[1]?.toLowerCase() || fallbackExtension;
	}
}

interface ResolvedLocalFile {
	uri: string;
	size?: number;
}

async function resolveLocalFile(sourceUri: string): Promise<ResolvedLocalFile> {
	if (!sourceUri.startsWith("file://")) {
		return { uri: sourceUri };
	}

	const stripped = stripUriDecorations(sourceUri);
	const candidateUris = stripped === sourceUri ? [sourceUri] : [stripped, sourceUri];
	let lastError: unknown;

	for (const candidateUri of candidateUris) {
		try {
			const info = await getInfoAsync(candidateUri);
			if (!info.exists || info.isDirectory) {
				continue;
			}
			return {
				uri: candidateUri,
				size: typeof info.size === "number" ? info.size : undefined,
			};
		} catch (error) {
			lastError = error;
		}
	}

	if (lastError) {
		throw lastError;
	}

	return { uri: sourceUri };
}

const MIN_FREE_DISK_SAFETY_BYTES = 50 * 1024 * 1024;

async function ensureFreeDiskFor(fileSize: number | undefined): Promise<void> {
	try {
		const free = await getFreeDiskStorageAsync();
		const required = (fileSize ?? 0) + MIN_FREE_DISK_SAFETY_BYTES;
		if (free < required) {
			throw new Error(
				`Not enough free space on device. Need ${Math.ceil(required / (1024 * 1024))}MB, have ${Math.floor(
					free / (1024 * 1024)
				)}MB free.`
			);
		}
	} catch (error) {
		if (error instanceof Error && error.message.startsWith("Not enough free space")) {
			throw error;
		}
		logger.warn("Free disk storage probe failed", error);
	}
}

function encodeStoragePath(storagePath: string): string {
	return storagePath
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
}

function getStorageUploadUrl(bucket: string, storagePath: string): string {
	const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
	return `${supabaseUrl}/storage/v1/object/${bucket}/${encodeStoragePath(storagePath)}`;
}

async function getStorageUploadHeaders(contentType: string): Promise<Record<string, string>> {
	const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
	const {
		data: { session },
	} = await supabase.auth.getSession();
	const accessToken = session?.access_token ?? anonKey;

	return {
		Authorization: `Bearer ${accessToken}`,
		apikey: anonKey,
		"cache-control": "max-age=3600",
		"content-type": contentType,
		"x-upsert": "false",
	};
}

function parseStorageUploadResponseBody(body: string): { message?: string } | null {
	if (!body) {
		return null;
	}

	try {
		return JSON.parse(body) as { message?: string };
	} catch {
		return { message: body };
	}
}

async function uploadLocalFileToStorage(
	bucket: string,
	storagePath: string,
	fileUri: string,
	contentType: string,
	mediaType: MediaType
): Promise<{ path: string }> {
	const uploadUrl = getStorageUploadUrl(bucket, storagePath);
	const headers = await getStorageUploadHeaders(contentType);
	const timeoutMs =
		mediaType === "video" ? VIDEO_NATIVE_UPLOAD_TIMEOUT_MS : PHOTO_NATIVE_UPLOAD_TIMEOUT_MS;
	const response = await withTimeout(
		uploadAsync(uploadUrl, fileUri, {
			headers,
			httpMethod: "POST",
			uploadType: FileSystemUploadType.BINARY_CONTENT,
		}),
		timeoutMs
	);

	if (response.status < 200 || response.status >= 300) {
		const parsedBody = parseStorageUploadResponseBody(response.body);
		const message =
			parsedBody?.message || `Storage upload failed with status ${response.status}`;
		const err = new Error(message) as Error & { httpStatus?: number };
		err.httpStatus = response.status;
		throw err;
	}

	return { path: storagePath };
}

async function readUriAsUploadBody(
	uri: string,
	_contentType: string,
	_fallbackName: string
): Promise<UploadBody> {
	const response = await withTimeout(fetch(uri), 30000);
	return withTimeout(response.blob(), 30000);
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

async function uploadToStorage(
	bucket: string,
	storagePath: string,
	sourceUri: string,
	contentType: string,
	mediaType: MediaType
): Promise<{ path: string }> {
	if (sourceUri.startsWith("file://")) {
		return uploadLocalFileToStorage(bucket, storagePath, sourceUri, contentType, mediaType);
	}

	const body = await readUriAsUploadBody(sourceUri, contentType, storagePath);
	const { data, error } = await supabase.storage.from(bucket).upload(storagePath, body, {
		contentType,
		upsert: false,
	});

	if (error || !data) {
		throw new Error(error?.message || "Storage upload failed");
	}

	return { path: data.path };
}

export async function createVideoThumbnailUri(
	videoUri: string,
	timeMs: number = 1000
): Promise<string | null> {
	try {
		const readableVideoUri = await getReadableUri(videoUri);
		const resolved = await resolveLocalFile(readableVideoUri);
		const { uri } = await withTimeout(
			VideoThumbnails.getThumbnailAsync(resolved.uri, {
				time: timeMs,
				quality: 0.7,
			}),
			15000
		);

		return uri;
	} catch (error) {
		logger.warn("Video thumbnail generation failed", error);
		return null;
	}
}

async function generateAndUploadThumbnail(
	sourceUri: string,
	eventId: string,
	userId: string,
	timestamp: number,
	uniqueSuffix: string,
	mediaType: MediaType
): Promise<string | null> {
	if (mediaType === "photo") {
		return null;
	}

	try {
		const thumbnailUri = await createVideoThumbnailUri(sourceUri);
		if (!thumbnailUri) {
			return null;
		}

		const thumbnailPath = `${eventId}/${userId}/${timestamp}_${uniqueSuffix}_thumb.jpg`;
		const thumbUploadData = await uploadToStorage(
			"thumbnails",
			thumbnailPath,
			thumbnailUri,
			"image/jpeg",
			"photo"
		);

		return thumbUploadData.path;
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
	} = options;

	try {
		const currentProfileId = await getCurrentProfileId();
		if (!currentProfileId) {
			logger.warn("Skipping upload without an active profile", undefined, { eventId, userId });
			return {
				success: false,
				error: "Your session expired. Re-open the event and try again.",
				failureReason: "storage",
			};
		}

		if (currentProfileId !== userId) {
			logger.warn("Skipping upload for stale profile", undefined, {
				eventId,
				queuedUserId: userId,
				currentProfileId,
			});
			return {
				success: false,
				error: "Your session changed. Re-select the media and try again.",
				failureReason: "storage",
			};
		}

		const validCapturedAt = safeDate(capturedAt);
		let readableUri: string;
		try {
			readableUri = await getReadableUri(uri);
		} catch (resolveError) {
			if (resolveError instanceof IcloudAssetUnavailableError) {
				return {
					success: false,
					error:
						"This item is in iCloud and could not be downloaded. Open it in Photos first, then retry.",
					failureReason: "storage",
				};
			}
			throw resolveError;
		}
		const timestamp = Date.now();
		const uniqueSuffix = Math.random().toString(36).substring(2, 10);
		const extension = getPathExtension(readableUri, mediaType);
		const resolvedSource = await resolveLocalFile(readableUri);
		const uploadSourceUri = resolvedSource.uri;
		const detectedFileSize = fileSize ?? resolvedSource.size;
		if (uploadSourceUri.startsWith("file://")) {
			try {
				await ensureFreeDiskFor(detectedFileSize);
			} catch (diskError) {
				logger.warn("Insufficient disk space for upload", diskError, {
					eventId,
					userId,
					fileSize: detectedFileSize,
				});
				return {
					success: false,
					error: diskError instanceof Error ? diskError.message : "Not enough free space",
					failureReason: "storage",
				};
			}
		}
		const fileName = `${eventId}/${userId}/${timestamp}_${uniqueSuffix}.${extension}`;

		const contentType = getContentType(extension, mediaType);
		const mediaBody = uploadSourceUri.startsWith("file://")
			? null
			: await readUriAsUploadBody(
					uploadSourceUri,
					contentType,
					`${timestamp}_${uniqueSuffix}.${extension}`
				);
		const mediaSize = detectedFileSize ?? (mediaBody ? getUploadBodySize(mediaBody) : 1);
		if (mediaSize === 0) {
			logger.error("Resolved media file is empty", undefined, { eventId, userId, readableUri });
			return {
				success: false,
				error: "Selected file is empty",
				failureReason: "storage",
			};
		}

		let uploadData: { path: string };
		try {
			uploadData = await uploadToStorage(
				"event-photos",
				fileName,
				uploadSourceUri,
				contentType,
				mediaType
			);
		} catch (uploadError) {
			logger.error("Storage upload error", uploadError, { eventId, userId });
			const httpStatus =
				uploadError && typeof uploadError === "object" && "httpStatus" in uploadError
					? (uploadError as { httpStatus?: number }).httpStatus
					: undefined;
			let failureReason: UploadFailureReason = classifyUploadError(uploadError);
			if (failureReason === "storage" && httpStatus && isRetryableHttpStatus(httpStatus)) {
				failureReason = "network";
			}
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

		// Generate and upload thumbnail for videos
		let thumbnailPath: string | null = null;
		thumbnailPath = await generateAndUploadThumbnail(
			uploadSourceUri,
			eventId,
			userId,
			timestamp,
			uniqueSuffix,
			mediaType
		);

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
			logger.error("Database insert error", dbError, { eventId, userId });
			// Clean up both video and thumbnail on failure
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

		return {
			success: true,
			path: uploadData.path,
			thumbnailPath,
			mediaItem: mediaItem as MediaItemWithUser,
		};
	} catch (error) {
		logger.error("Upload error", error, { eventId, userId });
		let failureReason: UploadFailureReason = "unknown";
		if (error instanceof Error) {
			if (error.message === "timeout") {
				failureReason = "timeout";
			} else if (isNetworkErrorMessage(error.message)) {
				failureReason = "network";
			}
		}
		return {
			success: false,
			error: `Failed to upload ${mediaType}`,
			failureReason,
		};
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

function supportsPhotoThumbnailTransform(storagePath?: string | null): boolean {
	if (!storagePath) {
		return false;
	}

	return !/\.(heic|heif)$/i.test(storagePath);
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

export async function downloadPhoto(storagePath: string, fileName: string): Promise<string | null> {
	try {
		const url = await resolveStorageUrl(storagePath);
		const localUri = `${cacheDirectory}${fileName}`;

		const downloadResult = await downloadAsync(url, localUri);

		if (downloadResult.status === 200) {
			return downloadResult.uri;
		}

		return null;
	} catch (error) {
		logger.error("Download error", error, { storagePath });
		return null;
	}
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
