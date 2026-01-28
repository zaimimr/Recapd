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

export async function getPhotosInTimeRange(
  startTime: Date,
  endTime: Date,
  limit: number = 1000,
): Promise<LocalPhoto[]> {
  const hasPermission = await requestMediaPermissions();
  if (!hasPermission) return [];

  const assets = await MediaLibrary.getAssetsAsync({
    mediaType: ["photo"],
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

export async function getAssetInfo(
  assetId: string,
): Promise<MediaLibrary.AssetInfo | null> {
  try {
    const asset = await MediaLibrary.getAssetInfoAsync(assetId);
    return asset;
  } catch (error) {
    console.error("Get asset info error:", error);
    return null;
  }
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

export async function pickPhotosFromLibrary(): Promise<{
  photos: LocalPhoto[];
  videosFiltered: boolean;
}> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: true,
    quality: 1,
    exif: true,
  });

  if (result.canceled || !result.assets) return { photos: [], videosFiltered: false };

  const photoAssets = result.assets.filter((asset) => asset.type !== "video");
  const videosFiltered = photoAssets.length < result.assets.length;

  const photos = photoAssets.map((asset, index) => {
    let creationTime = Date.now();
    if (asset.exif?.DateTimeOriginal) {
      const parsed = new Date(asset.exif.DateTimeOriginal as string).getTime();
      if (!isNaN(parsed) && parsed > 0 && parsed <= 8640000000000000) {
        creationTime = parsed;
      }
    }
    return {
      id: `manual-${Date.now()}-${index}`,
      uri: asset.uri,
      filename: asset.fileName || `photo-${index}.jpg`,
      creationTime,
      width: asset.width,
      height: asset.height,
      duration: asset.duration || 0,
      mediaType: "photo" as "photo" | "video",
    };
  });

  return { photos, videosFiltered };
}
