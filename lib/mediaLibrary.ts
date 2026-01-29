import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";

export interface LocalPhoto {
  id: string;
  uri: string;
  filename: string;
  creationTime: number;
  width: number;
  height: number;
  duration: number;
  mediaType: "photo" | "video";
}

export async function requestMediaPermissions(): Promise<boolean> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  return status === "granted";
}

export const PRO_MAX_VIDEO_DURATION_MS = 300*1000;
export const FREE_MAX_VIDEO_DURATION_MS = 30*1000;

export async function getMediaInTimeRange(
  startTime: Date,
  endTime: Date,
  limit: number = 1000,
  includeVideos: boolean = true,
): Promise<LocalPhoto[]> {
  const hasPermission = await requestMediaPermissions();
  if (!hasPermission) return [];

  const mediaTypes: MediaLibrary.MediaTypeValue[] = includeVideos
    ? ["photo", "video"]
    : ["photo"];

  const assets = await MediaLibrary.getAssetsAsync({
    mediaType: mediaTypes,
    sortBy: [MediaLibrary.SortBy.creationTime],
    first: limit,
  });

  const startTimestamp = startTime.getTime();
  const endTimestamp = endTime.getTime();

  const filtered = assets.assets.filter((asset) => {
    const created = asset.creationTime;
    return created >= startTimestamp && created <= endTimestamp;
  });

  const photosWithLocalUri = await Promise.all(
    filtered.map(async (asset) => {
      const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
      return {
        id: asset.id,
        uri: assetInfo?.localUri || asset.uri,
        filename: asset.filename,
        creationTime: asset.creationTime,
        width: asset.width,
        height: asset.height,
        duration: asset.duration,
        mediaType:
          asset.mediaType === "photo"
            ? "photo"
            : ("video" as "photo" | "video"),
      };
    }),
  );

  return photosWithLocalUri;
}

export async function getPhotosInTimeRange(
  startTime: Date,
  endTime: Date,
  limit: number = 1000,
): Promise<LocalPhoto[]> {
  return getMediaInTimeRange(startTime, endTime, limit, false);
}

export async function saveToLibrary(
  uri: string,
): Promise<MediaLibrary.Asset | null> {
  try {
    const hasPermission = await requestMediaPermissions();
    if (!hasPermission) return null;

    const asset = await MediaLibrary.createAssetAsync(uri);
    return asset;
  } catch (error) {
    console.error("Save to library error:", error);
    return null;
  }
}

export interface PickMediaOptions {
  includeVideos?: boolean;
  maxVideoDuration?: number;
}

export interface PickMediaResult {
  media: LocalPhoto[];
  videosFiltered: boolean;
  videosTooLong: number;
}

export async function pickMediaFromLibrary(
  options: PickMediaOptions = {}
): Promise<PickMediaResult> {
  const { includeVideos = true, maxVideoDuration = 0 } = options;

  const mediaTypes: ImagePicker.MediaType[] = includeVideos
    ? ["images", "videos"]
    : ["images"];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes,
    allowsMultipleSelection: true,
    quality: 1,
    exif: true,
    videoMaxDuration: maxVideoDuration > 0 ? maxVideoDuration : undefined,
  });

  if (result.canceled || !result.assets) {
    return { media: [], videosFiltered: false, videosTooLong: 0 };
  }

  let videosTooLong = 0;
  const validAssets = result.assets.filter((asset) => {
    console.log("Picked asset:", asset);
    if (asset.type === "video" && !includeVideos) {
      return false;
    }
    if (asset.type === "video" && maxVideoDuration > 0) {
      const duration = asset.duration || 0;
      if (duration > maxVideoDuration) {
        videosTooLong++;
        return false;
      }
    }
    return true;
  });

  const videosFiltered = !includeVideos && result.assets.some(a => a.type === "video");

  const media = validAssets.map((asset, index) => {
    let creationTime = Date.now();
    if (asset.exif?.DateTimeOriginal) {
      const parsed = new Date(asset.exif.DateTimeOriginal as string).getTime();
      if (!isNaN(parsed) && parsed > 0 && parsed <= 8640000000000000) {
        creationTime = parsed;
      }
    }

    const isVideo = asset.type === "video";
    const defaultExt = isVideo ? "mp4" : "jpg";


    return {
      id: `manual-${Date.now()}-${index}`,
      uri: asset.uri,
      filename: asset.fileName || `${isVideo ? 'video' : 'photo'}-${index}.${defaultExt}`,
      creationTime,
      width: asset.width,
      height: asset.height,
      duration: asset.duration || 0,
      mediaType: (isVideo ? "video" : "photo") as "photo" | "video",
    };
  });

  return { media, videosFiltered, videosTooLong };
}

export async function pickPhotosFromLibrary(): Promise<{
  photos: LocalPhoto[];
  videosFiltered: boolean;
}> {
  const result = await pickMediaFromLibrary({ includeVideos: false });
  return { photos: result.media, videosFiltered: result.videosFiltered };
}
