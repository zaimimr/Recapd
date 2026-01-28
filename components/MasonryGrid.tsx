import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { format } from 'date-fns';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { getAvatarColor } from '@/lib/colors';
import { getPhotoUrl } from '@/lib/storage';
import { MergedMediaItem } from './MomentCluster';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 2;
const GAP = 8;
const COLUMN_WIDTH = (SCREEN_WIDTH - 48 - GAP) / NUM_COLUMNS;

interface MasonryGridProps {
  photos: MergedMediaItem[];
  onPhotoPress: (photo: MergedMediaItem, index: number) => void;
  onRetry?: (id: string) => void;
  isDark: boolean;
}

function calculatePhotoHeight(photo: MergedMediaItem): number {
  const aspectRatio = photo.width && photo.height ? photo.height / photo.width : 1;
  const height = COLUMN_WIDTH * aspectRatio;
  return Math.min(Math.max(height, 120), 300);
}

interface Column {
  photos: { photo: MergedMediaItem; index: number; height: number }[];
  totalHeight: number;
}

function distributePhotos(photos: MergedMediaItem[]): Column[] {
  const columns: Column[] = Array.from({ length: NUM_COLUMNS }, () => ({
    photos: [],
    totalHeight: 0,
  }));

  photos.forEach((photo, index) => {
    const height = calculatePhotoHeight(photo);
    const shortestColumn = columns.reduce((min, col, i) =>
      col.totalHeight < columns[min].totalHeight ? i : min
    , 0);

    columns[shortestColumn].photos.push({ photo, index, height });
    columns[shortestColumn].totalHeight += height + GAP;
  });

  return columns;
}

function PhotoCard({
  photo,
  index,
  height,
  onPress,
  onRetry,
  isDark,
}: {
  photo: MergedMediaItem;
  index: number;
  height: number;
  onPress: () => void;
  onRetry?: (id: string) => void;
  isDark: boolean;
}) {
  const imageUri = photo.isPending && photo.localUri
    ? photo.localUri
    : getPhotoUrl(photo.storage_path);

  const isSyncing = photo.isPending && photo.syncStatus === 'syncing';
  const isFailed = photo.isPending && photo.syncStatus === 'failed';

  return (
    <TouchableOpacity
      style={[styles.photoCard, { height }]}
      onPress={onPress}
      activeOpacity={0.9}
    >
      <Image
        source={{ uri: imageUri }}
        style={[
          styles.photoImage,
          photo.isPending && styles.pendingImage,
        ]}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
        recyclingKey={photo.id}
        blurRadius={photo.isPending && photo.syncStatus !== 'failed' ? 2 : 0}
      />

      {photo.isPending && (
        <View style={styles.syncOverlay}>
          {isSyncing && (
            <View style={styles.syncBadge}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          )}
          {isFailed && (
            <TouchableOpacity
              style={styles.retryBadge}
              onPress={() => onRetry?.(photo.id)}
            >
              <FontAwesome name="refresh" size={14} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {photo.uploader?.display_name && !photo.isPending && (
        <View style={styles.photoFooter}>
          <View
            style={[
              styles.avatarBadge,
              { backgroundColor: getAvatarColor(photo.uploader.display_name) },
            ]}
          >
            <Text style={styles.avatarInitial}>
              {photo.uploader.display_name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.timeText} numberOfLines={1}>
            {format(new Date(photo.captured_at), 'h:mm a')}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function MasonryGrid({
  photos,
  onPhotoPress,
  onRetry,
  isDark,
}: MasonryGridProps) {
  if (photos.length === 0) return null;

  const columns = distributePhotos(photos);

  return (
    <View style={styles.container}>
      {columns.map((column, colIndex) => (
        <View key={colIndex} style={styles.column}>
          {column.photos.map(({ photo, index, height }) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              index={index}
              height={height}
              onPress={() => onPhotoPress(photo, index)}
              onRetry={onRetry}
              isDark={isDark}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: GAP,
  },
  column: {
    flex: 1,
    gap: GAP,
  },
  photoCard: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  pendingImage: {
    opacity: 0.7,
  },
  syncOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncBadge: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 10,
    borderRadius: 20,
  },
  retryBadge: {
    backgroundColor: '#ef4444',
    padding: 10,
    borderRadius: 20,
  },
  photoFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  avatarBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  timeText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: '500',
  },
});
