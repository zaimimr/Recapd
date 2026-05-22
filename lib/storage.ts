import AsyncStorage from "@react-native-async-storage/async-storage";
import {
	cacheDirectory,
	copyAsync,
	downloadAsync,
	FileSystemUploadType,
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
const PHOTO_NATIVE_UPLOAD_TIMEOUT_MS = 2 * 60 * 1000;
const VIDEO_NATIVE_UPLOAD_TIMEOUT_MS = 12 * 60 * 1000;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const PHOTO_THUMBNAIL_TRANSFORM = {
	width: 720,
	height: 720,
	quality: 60,
	resize: "cover" as const,
};

async function getReadableUri(uri: string): Promise<string> {
	if (uri.startsWith("ph://") || uri.startsWith("assets-library://") || !uri.includes("/")) {
		const assetId = uri.replace("ph://", "").split("/")[0];
		const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
		if (assetInfo?.localUri) {
			return assetInfo.localUri;
		}
		throw new Error(`Unable to get local URI for asset: ${uri}`);
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
export type UploadFailureReason = "timeout" | "storage" | "database" | "thumbnail" | "unknown";
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

async function stageLocalFileForAccess(
	sourceUri: string,
	extension: string,
	cacheKey: string
): Promise<string> {
	if (!sourceUri.startsWith("file://") || !cacheDirectory) {
		return sourceUri;
	}

	const candidateUris = Array.from(new Set([sourceUri, stripUriDecorations(sourceUri)]));
	const stagedUri = `${cacheDirectory}recapd-upload-${cacheKey}.${extension}`;
	let lastError: unknown;

	for (const candidateUri of candidateUris) {
		try {
			const info = await getInfoAsync(candidateUri);
			if (!info.exists || info.isDirectory) {
				continue;
			}

			if (candidateUri === stagedUri) {
				return candidateUri;
			}

			await copyAsync({
				from: candidateUri,
				to: stagedUri,
			});
			return stagedUri;
		} catch (error) {
			lastError = error;
		}
	}

	if (lastError) {
		throw lastError;
	}

	return sourceUri;
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
		throw new Error(parsedBody?.message || `Storage upload failed with status ${response.status}`);
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
		const extension = getPathExtension(readableVideoUri, "video");
		const stagedVideoUri = await stageLocalFileForAccess(
			readableVideoUri,
			extension,
			`thumb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
		);
		const { uri } = await withTimeout(
			VideoThumbnails.getThumbnailAsync(stagedVideoUri, {
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
		const readableUri = await getReadableUri(uri);
		const timestamp = Date.now();
		const uniqueSuffix = Math.random().toString(36).substring(2, 10);
		const extension = getPathExtension(readableUri, mediaType);
		const uploadSourceUri = await stageLocalFileForAccess(
			readableUri,
			extension,
			`${timestamp}_${uniqueSuffix}`
		);
		const fileName = `${eventId}/${userId}/${timestamp}_${uniqueSuffix}.${extension}`;

		const contentType = getContentType(extension, mediaType);
		const mediaBody = uploadSourceUri.startsWith("file://")
			? null
			: await readUriAsUploadBody(
					uploadSourceUri,
					contentType,
					`${timestamp}_${uniqueSuffix}.${extension}`
				);
		const mediaSize = fileSize ?? (mediaBody ? getUploadBodySize(mediaBody) : 1);
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
			return {
				success: false,
				error: uploadError instanceof Error ? uploadError.message : "Storage upload failed",
				failureReason:
					uploadError instanceof Error && uploadError.message === "timeout" ? "timeout" : "storage",
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
		const failureReason =
			error instanceof Error && error.message === "timeout" ? "timeout" : "unknown";
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
