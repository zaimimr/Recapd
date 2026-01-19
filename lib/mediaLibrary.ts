import * as MediaLibrary from 'expo-media-library';

export interface LocalPhoto {
  id: string;
  uri: string;
  filename: string;
  creationTime: number;
  width: number;
  height: number;
  duration: number;
  mediaType: 'photo' | 'video';
}

export async function requestMediaPermissions(): Promise<boolean> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  return status === 'granted';
}

export async function getPhotosInTimeRange(
  startTime: Date,
  endTime: Date,
  limit: number = 1000
): Promise<LocalPhoto[]> {
  const hasPermission = await requestMediaPermissions();
  if (!hasPermission) return [];

  const assets = await MediaLibrary.getAssetsAsync({
    mediaType: ['photo', 'video'],
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
        mediaType: asset.mediaType === 'photo' ? 'photo' : 'video' as 'photo' | 'video',
      };
    })
  );

  return photosWithLocalUri;
}

export async function getAssetInfo(assetId: string): Promise<MediaLibrary.AssetInfo | null> {
  try {
    const asset = await MediaLibrary.getAssetInfoAsync(assetId);
    return asset;
  } catch (error) {
    console.error('Get asset info error:', error);
    return null;
  }
}

export async function saveToLibrary(uri: string): Promise<MediaLibrary.Asset | null> {
  try {
    const hasPermission = await requestMediaPermissions();
    if (!hasPermission) return null;

    const asset = await MediaLibrary.createAssetAsync(uri);
    return asset;
  } catch (error) {
    console.error('Save to library error:', error);
    return null;
  }
}
