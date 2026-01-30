import AsyncStorage from "@react-native-async-storage/async-storage";
import { decode } from "base64-arraybuffer";
import {
	cacheDirectory,
	downloadAsync,
	EncodingType,
	readAsStringAsync,
} from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as VideoThumbnails from "expo-video-thumbnails";
import type { MediaItemInsert } from "@/types/database";
import { safeDate } from "./dateUtils";
import { supabase } from "./supabase";

const DOWNLOADED_PHOTOS_KEY = "recapd_downloaded_photos";

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
}

export interface UploadProgress {
	current: number;
	total: number;
	percentage: number;
}

export type MediaType = "photo" | "video";

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
	return extension === "png" ? "image/png" : "image/jpeg";
}

async function generateAndUploadThumbnail(
	videoUri: string,
	eventId: string,
	userId: string,
	timestamp: number
): Promise<string | null> {
	try {
		// Generate thumbnail at 1 second mark (or start for short videos)
		const { uri: thumbnailUri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
			time: 1000,
			quality: 0.7,
		});

		// Read and upload thumbnail
		const thumbnailBase64 = await readAsStringAsync(thumbnailUri, {
			encoding: EncodingType.Base64,
		});
		const thumbnailArrayBuffer = decode(thumbnailBase64);
		const thumbnailPath = `${eventId}/${userId}/${timestamp}_thumb.jpg`;

		const { data: thumbUploadData, error: thumbUploadError } = await supabase.storage
			.from("event-photos")
			.upload(thumbnailPath, thumbnailArrayBuffer, {
				contentType: "image/jpeg",
				upsert: false,
			});

		if (thumbUploadError) {
			console.warn("Thumbnail upload error:", thumbUploadError);
			return null;
		}

		return thumbUploadData.path;
	} catch (error) {
		console.warn("Thumbnail generation error:", error);
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
	} = options;

	try {
		const validCapturedAt = safeDate(capturedAt);
		const readableUri = await getReadableUri(uri);
		const base64 = await readAsStringAsync(readableUri, {
			encoding: EncodingType.Base64,
		});

		const arrayBuffer = decode(base64);
		const timestamp = Date.now();
		const extension =
			readableUri.split(".").pop()?.toLowerCase() || (mediaType === "video" ? "mp4" : "jpg");
		const fileName = `${eventId}/${userId}/${timestamp}.${extension}`;

		const contentType = getContentType(extension, mediaType);

		const { data: uploadData, error: uploadError } = await supabase.storage
			.from("event-photos")
			.upload(fileName, arrayBuffer, {
				contentType,
				upsert: false,
			});

		if (uploadError) {
			console.error("Storage upload error:", uploadError);
			return { success: false, error: uploadError.message };
		}

		// Generate and upload thumbnail for videos
		let thumbnailPath: string | null = null;
		if (mediaType === "video") {
			thumbnailPath = await generateAndUploadThumbnail(readableUri, eventId, userId, timestamp);
		}

		const insertData: MediaItemInsert = {
			event_id: eventId,
			uploaded_by_user_id: userId,
			captured_at: validCapturedAt.toISOString(),
			media_type: mediaType,
			width,
			height,
			duration_milliseconds: mediaType === "video" ? Math.round(duration || 0) : null,
			file_size_bytes: fileSize || base64.length,
			storage_path: uploadData.path,
			thumbnail_path: thumbnailPath,
			visibility: "shared",
		};

		const { error: dbError } = await supabase.from("media_items").insert(insertData);

		if (dbError) {
			console.error("Database insert error:", dbError);
			// Clean up both video and thumbnail on failure
			const pathsToRemove = [uploadData.path];
			if (thumbnailPath) pathsToRemove.push(thumbnailPath);
			await supabase.storage.from("event-photos").remove(pathsToRemove);
			return { success: false, error: dbError.message };
		}

		return { success: true, path: uploadData.path };
	} catch (error) {
		console.error("Upload error:", error);
		return { success: false, error: `Failed to upload ${mediaType}` };
	}
}

export async function uploadPhoto(
	uri: string,
	eventId: string,
	userId: string,
	capturedAt: Date,
	width?: number,
	height?: number,
	fileSize?: number
): Promise<UploadResult> {
	return uploadMedia({
		uri,
		eventId,
		userId,
		capturedAt,
		width,
		height,
		fileSize,
		mediaType: "photo",
	});
}

export function getPhotoUrl(storagePath: string): string {
	const { data } = supabase.storage.from("event-photos").getPublicUrl(storagePath);
	return data.publicUrl;
}

export function getMediaUrl(storagePath: string): string {
	return getPhotoUrl(storagePath);
}

export async function downloadPhoto(storagePath: string, fileName: string): Promise<string | null> {
	try {
		const url = getPhotoUrl(storagePath);
		const localUri = `${cacheDirectory}${fileName}`;

		const downloadResult = await downloadAsync(url, localUri);

		if (downloadResult.status === 200) {
			return downloadResult.uri;
		}

		return null;
	} catch (error) {
		console.error("Download error:", error);
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
