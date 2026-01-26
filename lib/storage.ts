import { MediaItemInsert, MediaItemUpdate } from "@/types/database";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { decode } from "base64-arraybuffer";
import {
  cacheDirectory,
  downloadAsync,
  EncodingType,
  readAsStringAsync,
} from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { supabase } from "./supabase";

const DOWNLOADED_PHOTOS_KEY = "recapd_downloaded_photos";

async function getReadableUri(uri: string): Promise<string> {
  if (
    uri.startsWith("ph://") ||
    uri.startsWith("assets-library://") ||
    !uri.includes("/")
  ) {
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

// Helper to create a valid Date, falling back to current time if invalid
function safeDate(value: Date | string | number | undefined | null): Date {
  if (!value) return new Date();
  const date = value instanceof Date ? value : new Date(value);
  // Check if date is valid (not NaN and within reasonable bounds)
  if (
    isNaN(date.getTime()) ||
    date.getTime() < 0 ||
    date.getTime() > 8640000000000000
  ) {
    return new Date();
  }
  return date;
}

export async function uploadPhoto(
  uri: string,
  eventId: string,
  userId: string,
  capturedAt: Date,
  width?: number,
  height?: number,
  fileSize?: number,
): Promise<UploadResult> {
  try {
    const validCapturedAt = safeDate(capturedAt);
    const readableUri = await getReadableUri(uri);
    const base64 = await readAsStringAsync(readableUri, {
      encoding: EncodingType.Base64,
    });

    const arrayBuffer = decode(base64);
    const timestamp = Date.now();
    const extension = readableUri.split(".").pop()?.toLowerCase() || "jpg";
    const fileName = `${eventId}/${userId}/${timestamp}.${extension}`;

    const contentType = extension === "png" ? "image/png" : "image/jpeg";

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

    const insertData: MediaItemInsert = {
      event_id: eventId,
      uploaded_by_user_id: userId,
      captured_at: validCapturedAt.toISOString(),
      media_type: "photo",
      width,
      height,
      file_size_bytes: fileSize || base64.length,
      storage_path: uploadData.path,
      visibility: "shared",
    };

    const { error: dbError } = await supabase
      .from("media_items")
      .insert(insertData);

    if (dbError) {
      console.error("Database insert error:", dbError);
      await supabase.storage.from("event-photos").remove([uploadData.path]);
      return { success: false, error: dbError.message };
    }

    return { success: true, path: uploadData.path };
  } catch (error) {
    console.error("Upload error:", error);
    return { success: false, error: "Failed to upload photo" };
  }
}

export async function uploadPhotoBatch(
  photos: Array<{
    uri: string;
    capturedAt: Date;
    width?: number;
    height?: number;
    fileSize?: number;
  }>,
  eventId: string,
  userId: string,
  onProgress?: (progress: UploadProgress) => void,
): Promise<{ successful: number; failed: number; errors: string[] }> {
  const results = { successful: 0, failed: 0, errors: [] as string[] };
  const total = photos.length;

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const result = await uploadPhoto(
      photo.uri,
      eventId,
      userId,
      photo.capturedAt,
      photo.width,
      photo.height,
      photo.fileSize,
    );

    if (result.success) {
      results.successful++;
    } else {
      results.failed++;
      if (result.error) {
        results.errors.push(result.error);
      }
    }

    onProgress?.({
      current: i + 1,
      total,
      percentage: Math.round(((i + 1) / total) * 100),
    });
  }

  return results;
}

export function getPhotoUrl(storagePath: string): string {
  const { data } = supabase.storage
    .from("event-photos")
    .getPublicUrl(storagePath);
  return data.publicUrl;
}

export async function downloadPhoto(
  storagePath: string,
  fileName: string,
): Promise<string | null> {
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

export async function deletePhoto(
  storagePath: string,
  mediaItemId: string,
): Promise<boolean> {
  try {
    const updateData: MediaItemUpdate = {
      visibility: "deleted",
      deleted_at: new Date().toISOString(),
    };

    const { error: dbError } = await supabase
      .from("media_items")
      .update(updateData)
      .eq("id", mediaItemId);

    if (dbError) throw dbError;

    return true;
  } catch (error) {
    console.error("Delete error:", error);
    return false;
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
    await AsyncStorage.setItem(
      DOWNLOADED_PHOTOS_KEY,
      JSON.stringify(downloadedIds),
    );
  }
}

export async function getDownloadedPhotoIds(): Promise<Set<string>> {
  const data = await AsyncStorage.getItem(DOWNLOADED_PHOTOS_KEY);
  const downloadedIds: string[] = data ? JSON.parse(data) : [];
  return new Set(downloadedIds);
}
