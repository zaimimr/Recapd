import { saveToLibrary } from "@/lib/mediaLibrary";
import {
  downloadPhoto,
  getPhotoUrl,
  isPhotoDownloaded,
  markPhotoDownloaded,
} from "@/lib/storage";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { format } from "date-fns";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MergedMediaItem } from "./MomentCluster";
import VideoPlayer from "./VideoPlayer";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface PhotoViewerProps {
  photos: MergedMediaItem[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
  onDelete?: (photoId: string) => Promise<boolean>;
  currentUserId?: string;
  isDark: boolean;
  initialThumbnailUri?: string;
}

interface ZoomableImageProps {
  photo: MergedMediaItem;
  thumbnailUri?: string;
}

function ZoomableImage({ photo, thumbnailUri }: ZoomableImageProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [isZoomed, setIsZoomed] = useState(false);

  const imageUri =
    photo.isPending && photo.localUri
      ? photo.localUri
      : getPhotoUrl(photo.storage_path);

  const placeholderUri = photo.localUri || thumbnailUri;

  const handleDoubleTap = useCallback(() => {
    if (isZoomed) {
      scrollRef.current?.scrollTo({ x: 0, y: 0, animated: true });
    }
  }, [isZoomed]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const zoomScale = event.nativeEvent.zoomScale;
      setIsZoomed(zoomScale > 1);
    },
    [],
  );

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      maximumZoomScale={4}
      minimumZoomScale={1}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      bouncesZoom
      centerContent
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleDoubleTap}
        style={styles.imageWrapper}
      >
        <Image
          source={{ uri: imageUri }}
          style={styles.image}
          contentFit="contain"
          cachePolicy="memory-disk"
          placeholder={placeholderUri ? { uri: placeholderUri } : undefined}
          placeholderContentFit="contain"
          transition={100}
        />
      </TouchableOpacity>
    </ScrollView>
  );
}

export default function PhotoViewer({
  photos,
  initialIndex,
  visible,
  onClose,
  onDelete,
  currentUserId,
  isDark: _isDark,
  initialThumbnailUri,
}: PhotoViewerProps) {
  const insets = useSafeAreaInsets();
  const safeInitialIndex = Math.max(
    0,
    Math.min(initialIndex, photos.length - 1),
  );
  const [currentIndex, setCurrentIndex] = useState(safeInitialIndex);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(Math.max(0, Math.min(initialIndex, photos.length - 1)));
    }
  }, [visible, initialIndex, photos.length]);

  const currentPhoto = photos[currentIndex];
  const canDelete =
    currentPhoto &&
    !currentPhoto.isPending &&
    currentPhoto.uploaded_by_user_id === currentUserId;

  const handleDownload = useCallback(async () => {
    if (!currentPhoto || currentPhoto.isPending) return;

    setSaving(true);
    try {
      const alreadyDownloaded = await isPhotoDownloaded(currentPhoto.id);
      const isVideo = currentPhoto.media_type === "video";
      const mediaLabel = isVideo ? "video" : "photo";

      if (alreadyDownloaded) {
        Alert.alert(
          "Already Saved",
          `This ${mediaLabel} is already in your camera roll`,
        );
        setSaving(false);
        return;
      }

      const extension = isVideo ? "mp4" : "jpg";
      const localUri = await downloadPhoto(
        currentPhoto.storage_path,
        `recapd_${currentPhoto.id}.${extension}`,
      );
      if (localUri) {
        const asset = await saveToLibrary(localUri);
        if (asset) {
          await markPhotoDownloaded(currentPhoto.id);
          Alert.alert(
            "Saved",
            `${isVideo ? "Video" : "Photo"} saved to your camera roll`,
          );
        } else {
          Alert.alert("Error", `Failed to save ${mediaLabel}`);
        }
      }
    } catch {
      Alert.alert(
        "Error",
        `Failed to download ${currentPhoto.media_type === "video" ? "video" : "photo"}`,
      );
    }
    setSaving(false);
  }, [currentPhoto]);

  const handleDelete = useCallback(async () => {
    if (!currentPhoto || !onDelete) return;

    const isVideo = currentPhoto.media_type === "video";
    const mediaLabel = isVideo ? "video" : "photo";

    Alert.alert(
      `Delete ${isVideo ? "Video" : "Photo"}`,
      `Are you sure you want to delete this ${mediaLabel}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            const success = await onDelete(currentPhoto.id);
            setDeleting(false);
            if (success) {
              if (photos.length <= 1) {
                onClose();
              } else if (currentIndex >= photos.length - 1) {
                setCurrentIndex(currentIndex - 1);
              }
            } else {
              Alert.alert("Error", `Failed to delete ${mediaLabel}`);
            }
          },
        },
      ],
    );
  }, [currentPhoto, onDelete, currentIndex, photos.length, onClose]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index);
      }
    },
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  if (!visible || !currentPhoto) return null;

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <FontAwesome name="chevron-down" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.counter}>
              {currentIndex + 1} / {photos.length}
            </Text>
          </View>
          <View style={styles.headerRight}>
            {canDelete ? (
              <TouchableOpacity
                style={styles.headerButton}
                onPress={handleDelete}
                disabled={deleting}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <FontAwesome name="trash-o" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            ) : (
              <View style={styles.headerButtonPlaceholder} />
            )}
          </View>
        </View>

        <FlatList
          ref={flatListRef}
          data={photos}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          initialScrollIndex={safeInitialIndex}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          renderItem={({ item, index }) => (
            <View style={styles.imageContainer}>
              {item.media_type === "video" ? (
                <VideoPlayer media={item} />
              ) : (
                <ZoomableImage
                  photo={item}
                  thumbnailUri={
                    index === initialIndex ? initialThumbnailUri : undefined
                  }
                />
              )}
            </View>
          )}
        />

        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.footerContent}>
            <View style={styles.attribution}>
              {currentPhoto.uploader?.display_name &&
              !currentPhoto.isPending ? (
                <View style={styles.uploaderRow}>
                  <View
                    style={[
                      styles.uploaderAvatar,
                      {
                        backgroundColor: getAvatarColor(
                          currentPhoto.uploader.display_name,
                        ),
                      },
                    ]}
                  >
                    <Text style={styles.uploaderInitial}>
                      {currentPhoto.uploader.display_name
                        .charAt(0)
                        .toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.uploaderInfo}>
                    <Text style={styles.uploaderName}>
                      {currentPhoto.uploader.display_name}
                    </Text>
                    <Text style={styles.captureTime}>
                      {format(
                        new Date(currentPhoto.captured_at),
                        "MMM d, yyyy · h:mm a",
                      )}
                    </Text>
                  </View>
                </View>
              ) : currentPhoto.isPending ? (
                <View style={styles.pendingRow}>
                  <ActivityIndicator size="small" color="#fbbf24" />
                  <Text style={styles.pendingText}>Uploading...</Text>
                </View>
              ) : (
                <Text style={styles.captureTime}>
                  {format(
                    new Date(currentPhoto.captured_at),
                    "MMM d, yyyy · h:mm a",
                  )}
                </Text>
              )}
            </View>
            {!currentPhoto.isPending && (
              <TouchableOpacity
                style={styles.downloadButton}
                onPress={handleDownload}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <FontAwesome name="arrow-down" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function getAvatarColor(name: string): string {
  const colors = [
    "#f87171",
    "#fb923c",
    "#fbbf24",
    "#a3e635",
    "#34d399",
    "#22d3ee",
    "#818cf8",
    "#c084fc",
  ];
  const hash = name
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    zIndex: 10,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerButtonPlaceholder: {
    width: 40,
    height: 40,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerRight: {
    width: 40,
  },
  counter: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 15,
    fontWeight: "500",
  },
  imageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  imageWrapper: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.75,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    zIndex: 10,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  footerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  attribution: {
    flex: 1,
  },
  uploaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  uploaderAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  uploaderInitial: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  uploaderInfo: {
    flex: 1,
  },
  uploaderName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pendingText: {
    color: "#fbbf24",
    fontSize: 15,
    fontWeight: "500",
  },
  captureTime: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 13,
  },
  downloadButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 16,
  },
});
