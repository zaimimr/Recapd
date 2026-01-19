import { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Modal,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { format, isPast, differenceInDays } from 'date-fns';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAuthStore } from '@/store/authStore';
import { useEventStore } from '@/store/eventStore';
import { useColorScheme } from '@/components/useColorScheme';
import { getPhotoUrl, downloadPhoto } from '@/lib/storage';
import { saveToLibrary } from '@/lib/mediaLibrary';
import { MediaItem } from '@/types/database';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PHOTO_SIZE = (SCREEN_WIDTH - 48 - 8) / 3;

interface TimelineSection {
  hour: string;
  photos: MediaItem[];
}

function groupPhotosByHour(photos: MediaItem[]): TimelineSection[] {
  const groups: { [key: string]: MediaItem[] } = {};

  photos.forEach((photo) => {
    const hour = format(new Date(photo.captured_at), 'ha');
    if (!groups[hour]) {
      groups[hour] = [];
    }
    groups[hour].push(photo);
  });

  return Object.entries(groups).map(([hour, photos]) => ({
    hour,
    photos,
  }));
}

function PhotoViewer({
  photo,
  visible,
  onClose,
  isDark,
}: {
  photo: MediaItem | null;
  visible: boolean;
  onClose: () => void;
  isDark: boolean;
}) {
  const [saving, setSaving] = useState(false);

  async function handleDownload() {
    if (!photo) return;

    setSaving(true);
    try {
      const localUri = await downloadPhoto(photo.storage_path, `between_${photo.id}.jpg`);
      if (localUri) {
        const asset = await saveToLibrary(localUri);
        if (asset) {
          Alert.alert('Saved', 'Photo saved to your camera roll');
        } else {
          Alert.alert('Error', 'Failed to save photo');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to download photo');
    }
    setSaving(false);
  }

  if (!photo) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.viewerContainer}>
        <TouchableOpacity style={styles.viewerCloseArea} onPress={onClose} />
        <Image
          source={{ uri: getPhotoUrl(photo.storage_path) }}
          style={styles.viewerImage}
          resizeMode="contain"
        />
        <View style={styles.viewerFooter}>
          <Text style={styles.viewerTime}>
            {format(new Date(photo.captured_at), 'h:mm a')}
          </Text>
          <TouchableOpacity
            style={styles.viewerDownload}
            onPress={handleDownload}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <FontAwesome name="download" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.viewerClose} onPress={onClose}>
          <FontAwesome name="times" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function PhotoGrid({
  photos,
  onPhotoPress,
}: {
  photos: MediaItem[];
  onPhotoPress: (photo: MediaItem) => void;
}) {
  return (
    <View style={styles.photoGrid}>
      {photos.map((photo) => (
        <TouchableOpacity
          key={photo.id}
          style={styles.photoItem}
          onPress={() => onPhotoPress(photo)}
        >
          <Image
            source={{ uri: getPhotoUrl(photo.storage_path) }}
            style={styles.photoImage}
            resizeMode="cover"
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const {
    currentEvent,
    mediaItems,
    isLoading,
    fetchEventById,
    fetchMediaItems,
    subscribeToMediaItems,
  } = useEventStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [selectedPhoto, setSelectedPhoto] = useState<MediaItem | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });

  const loadData = useCallback(async () => {
    if (id) {
      await fetchEventById(id);
      await fetchMediaItems(id);
    }
  }, [id, fetchEventById, fetchMediaItems]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (id) {
      const unsubscribe = subscribeToMediaItems(id);
      return unsubscribe;
    }
  }, [id, subscribeToMediaItems]);

  function handlePhotoPress(photo: MediaItem) {
    setSelectedPhoto(photo);
    setViewerVisible(true);
  }

  function handleCloseViewer() {
    setViewerVisible(false);
    setSelectedPhoto(null);
  }

  function handleContribute() {
    router.push(`/contribute/${id}`);
  }

  function handleShare() {
    router.push(`/event/share/${id}`);
  }

  async function handleDownloadAll() {
    if (mediaItems.length === 0 || downloadingAll) return;

    setDownloadingAll(true);
    setDownloadProgress({ current: 0, total: mediaItems.length });

    let successCount = 0;
    for (let i = 0; i < mediaItems.length; i++) {
      const photo = mediaItems[i];
      setDownloadProgress({ current: i + 1, total: mediaItems.length });

      try {
        const localUri = await downloadPhoto(photo.storage_path, `between_${photo.id}.jpg`);
        if (localUri) {
          const asset = await saveToLibrary(localUri);
          if (asset) successCount++;
        }
      } catch (error) {
        // Continue with next photo
      }
    }

    setDownloadingAll(false);
    Alert.alert(
      'Download Complete',
      `Saved ${successCount} of ${mediaItems.length} photos to your camera roll`
    );
  }

  if (isLoading && !currentEvent) {
    return (
      <View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
      </View>
    );
  }

  if (!currentEvent) {
    return (
      <View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
        <Text style={[styles.errorText, isDark && styles.textDark]}>Event not found</Text>
      </View>
    );
  }

  const isEnded = isPast(new Date(currentEvent.ends_at));
  const daysUntilExpiry = differenceInDays(new Date(currentEvent.expires_at), new Date());
  const sections = groupPhotosByHour(mediaItems);

  return (
    <>
      <Stack.Screen
        options={{
          title: currentEvent.title,
          headerRight: () => (
            <TouchableOpacity onPress={handleShare} style={{ marginRight: 8 }}>
              <FontAwesome name="share-alt" size={20} color={isDark ? '#fff' : '#000'} />
            </TouchableOpacity>
          ),
        }}
      />

      <View style={[styles.container, isDark && styles.containerDark]}>
        <FlatList
          data={sections}
          keyExtractor={(item) => item.hour}
          renderItem={({ item }) => (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, isDark && styles.textMuted]}>
                {item.hour}
              </Text>
              <PhotoGrid photos={item.photos} onPhotoPress={handlePhotoPress} />
            </View>
          )}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.eventInfo}>
                <Text style={[styles.eventDate, isDark && styles.textMuted]}>
                  {format(new Date(currentEvent.starts_at), 'EEEE, MMMM d, yyyy')}
                </Text>
                <Text style={[styles.eventTime, isDark && styles.textMuted]}>
                  {format(new Date(currentEvent.starts_at), 'h:mm a')} - {format(new Date(currentEvent.ends_at), 'h:mm a')}
                </Text>
              </View>

              {isEnded && daysUntilExpiry > 0 && (
                <View style={styles.expiryBanner}>
                  <FontAwesome name="clock-o" size={14} color="#f59e0b" />
                  <Text style={styles.expiryText}>
                    Expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}

              <View style={[styles.stats, isDark && styles.statsDark]}>
                <View style={styles.stat}>
                  <Text style={[styles.statValue, isDark && styles.textDark]}>
                    {mediaItems.length}
                  </Text>
                  <Text style={[styles.statLabel, isDark && styles.textMuted]}>Photos</Text>
                </View>
                <View style={[styles.statDivider, isDark && styles.statDividerDark]} />
                <View style={styles.stat}>
                  <Text style={[styles.statValue, isDark && styles.textDark]}>
                    {currentEvent.participant_count || 0}
                  </Text>
                  <Text style={[styles.statLabel, isDark && styles.textMuted]}>Guests</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.contributeButton} onPress={handleContribute}>
                <FontAwesome name="plus" size={16} color="#fff" />
                <Text style={styles.contributeButtonText}>Add Your Photos</Text>
              </TouchableOpacity>

              {mediaItems.length > 0 && (
                <TouchableOpacity
                  style={[styles.downloadAllButton, isDark && styles.downloadAllButtonDark]}
                  onPress={handleDownloadAll}
                  disabled={downloadingAll}
                >
                  {downloadingAll ? (
                    <>
                      <ActivityIndicator size="small" color={isDark ? '#fff' : '#000'} />
                      <Text style={[styles.downloadAllButtonText, isDark && styles.textDark]}>
                        Downloading {downloadProgress.current}/{downloadProgress.total}
                      </Text>
                    </>
                  ) : (
                    <>
                      <FontAwesome name="download" size={16} color={isDark ? '#fff' : '#000'} />
                      <Text style={[styles.downloadAllButtonText, isDark && styles.textDark]}>
                        Download All Photos
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {sections.length > 0 && (
                <Text style={[styles.timelineTitle, isDark && styles.textDark]}>Timeline</Text>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <FontAwesome name="camera" size={48} color={isDark ? '#444' : '#ccc'} />
              <Text style={[styles.emptyTitle, isDark && styles.textDark]}>No Photos Yet</Text>
              <Text style={[styles.emptyText, isDark && styles.textMuted]}>
                Photos from the event will appear here after they're uploaded
              </Text>
              <TouchableOpacity style={styles.emptyButton} onPress={handleContribute}>
                <Text style={styles.emptyButtonText}>Add Photos</Text>
              </TouchableOpacity>
            </View>
          }
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isLoading} onRefresh={loadData} />
          }
        />

        <PhotoViewer
          photo={selectedPhoto}
          visible={viewerVisible}
          onClose={handleCloseViewer}
          isDark={isDark}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  containerDark: {
    backgroundColor: '#000',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 24,
  },
  header: {
    marginBottom: 24,
  },
  eventInfo: {
    marginBottom: 16,
  },
  eventDate: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 14,
    color: '#999',
  },
  expiryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  expiryText: {
    color: '#92400e',
    fontSize: 14,
    fontWeight: '500',
  },
  stats: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  statsDark: {
    backgroundColor: '#1a1a1a',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e5e5e5',
    marginHorizontal: 16,
  },
  statDividerDark: {
    backgroundColor: '#333',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  contributeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 24,
  },
  contributeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  downloadAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 24,
  },
  downloadAllButtonDark: {
    backgroundColor: '#1a1a1a',
  },
  downloadAllButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  timelineTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  photoItem: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: '#000',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  viewerContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerCloseArea: {
    ...StyleSheet.absoluteFillObject,
  },
  viewerImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
  viewerFooter: {
    position: 'absolute',
    bottom: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  viewerTime: {
    color: '#fff',
    fontSize: 16,
  },
  viewerDownload: {
    padding: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 24,
  },
  viewerClose: {
    position: 'absolute',
    top: 60,
    right: 24,
    padding: 12,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
  textDark: {
    color: '#fff',
  },
  textMuted: {
    color: '#888',
  },
});
