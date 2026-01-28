import GuestSheet from "@/components/GuestSheet";
import MasonryGrid from "@/components/MasonryGrid";
import { MergedMediaItem } from "@/components/MomentCluster";
import NotificationPromptModal from "@/components/NotificationPromptModal";
import PhotoViewer from "@/components/PhotoViewer";
import { useColorScheme } from "@/components/useColorScheme";
import { saveToLibrary } from "@/lib/mediaLibrary";
import {
  registerForPushNotifications,
  savePushToken,
  sendReminderToParticipants,
} from "@/lib/notifications";
import {
  shouldShowNotificationPrompt,
  markNotificationPromptSeen,
} from "@/lib/notificationPrompt";
import {
  downloadPhoto,
  getDownloadedPhotoIds,
  getPhotoUrl,
  markPhotoDownloaded,
} from "@/lib/storage";
import { useAuthStore } from "@/store/authStore";
import { ParticipantWithStats, useEventStore } from "@/store/eventStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { differenceInDays, differenceInHours, format, isPast } from "date-fns";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function EventScreen() {
  const { id, justJoined } = useLocalSearchParams<{ id: string; justJoined?: string }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const {
    currentEvent,
    mediaItems,
    isLoading,
    fetchEventById,
    fetchMediaItems,
    subscribeToMediaItems,
    subscribeToParticipants,
    subscribeToEvent,
    getMergedTimeline,
    retryFailedUpload,
    deletePhoto,
    fetchParticipantStats,
  } = useEventStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [viewerVisible, setViewerVisible] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [selectedThumbnailUri, setSelectedThumbnailUri] = useState<
    string | undefined
  >();
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({
    current: 0,
    total: 0,
  });
  const [sendingReminder, setSendingReminder] = useState(false);
  const [guestSheetVisible, setGuestSheetVisible] = useState(false);
  const [participants, setParticipants] = useState<ParticipantWithStats[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notificationPromptVisible, setNotificationPromptVisible] = useState(false);

  const loadData = useCallback(async () => {
    if (id) {
      await fetchEventById(id);
      await fetchMediaItems(id);
      // Pre-fetch participants so guest sheet opens instantly
      const stats = await fetchParticipantStats(id);
      setParticipants(stats);
    }
  }, [id, fetchEventById, fetchMediaItems, fetchParticipantStats]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh participant stats when currentEvent participants change (real-time updates)
  useEffect(() => {
    if (id && currentEvent?.participants) {
      fetchParticipantStats(id).then(setParticipants);
    }
  }, [id, currentEvent?.participant_count, fetchParticipantStats]);

  useEffect(() => {
    if (id) {
      const unsubscribe = subscribeToMediaItems(id);
      return unsubscribe;
    }
  }, [id, subscribeToMediaItems]);

  useEffect(() => {
    if (id) {
      const unsubscribe = subscribeToParticipants(id);
      return unsubscribe;
    }
  }, [id, subscribeToParticipants]);

  useEffect(() => {
    if (id) {
      const unsubscribe = subscribeToEvent(id);
      return unsubscribe;
    }
  }, [id, subscribeToEvent]);

  useEffect(() => {
    async function checkNotificationPrompt() {
      if (justJoined === "true") {
        const shouldShow = await shouldShowNotificationPrompt();
        if (shouldShow) {
          setTimeout(() => setNotificationPromptVisible(true), 800);
        }
      }
    }
    checkNotificationPrompt();
  }, [justJoined]);

  const mergedPhotos = id ? getMergedTimeline(id) : [];

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  }, [loadData]);

  function handlePhotoPress(photo: MergedMediaItem, index: number) {
    // Store the thumbnail URI for instant preview in viewer
    const thumbnailUri =
      photo.isPending && photo.localUri
        ? photo.localUri
        : getPhotoUrl(photo.storage_path);
    setSelectedThumbnailUri(thumbnailUri);
    setSelectedPhotoIndex(index);
    setViewerVisible(true);
  }

  function handleCloseViewer() {
    setViewerVisible(false);
    setSelectedThumbnailUri(undefined);
  }

  async function handleDeletePhoto(photoId: string): Promise<boolean> {
    if (!id) return false;
    return deletePhoto(photoId, id);
  }

  function handleOpenGuestSheet() {
    setGuestSheetVisible(true);
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

    // Only download photos from other users (not my own uploads)
    const othersPhotos = mediaItems.filter(
      (p) => p.uploaded_by_user_id !== user?.id,
    );

    if (othersPhotos.length === 0) {
      setDownloadingAll(false);
      Alert.alert(
        "No Photos to Download",
        "There are no photos from other guests to download",
      );
      return;
    }

    const downloadedIds = await getDownloadedPhotoIds();
    const photosToDownload = othersPhotos.filter(
      (p) => !downloadedIds.has(p.id),
    );
    const skippedCount = othersPhotos.length - photosToDownload.length;

    if (photosToDownload.length === 0) {
      setDownloadingAll(false);
      Alert.alert(
        "Already Downloaded",
        `All ${othersPhotos.length} photos from other guests are already in your camera roll`,
      );
      return;
    }

    setDownloadProgress({ current: 0, total: photosToDownload.length });

    let successCount = 0;
    for (let i = 0; i < photosToDownload.length; i++) {
      const photo = photosToDownload[i];
      setDownloadProgress({ current: i + 1, total: photosToDownload.length });

      try {
        const localUri = await downloadPhoto(
          photo.storage_path,
          `recapd_${photo.id}.jpg`,
        );
        if (localUri) {
          const asset = await saveToLibrary(localUri);
          if (asset) {
            await markPhotoDownloaded(photo.id);
            successCount++;
          }
        }
      } catch {
        // Continue with next photo
      }
    }

    setDownloadingAll(false);

    const message =
      skippedCount > 0
        ? `Saved ${successCount} new photos. ${skippedCount} already in your camera roll.`
        : `Saved ${successCount} of ${photosToDownload.length} photos to your camera roll`;

    Alert.alert("Download Complete", message);
  }

  async function handleEnableNotifications() {
    await markNotificationPromptSeen();
    setNotificationPromptVisible(false);
    const token = await registerForPushNotifications();
    if (token && user?.id) {
      await savePushToken(user.id, token);
    }
  }

  async function handleMaybeLater() {
    await markNotificationPromptSeen();
    setNotificationPromptVisible(false);
  }

  async function handleRemindGuests() {
    if (!currentEvent || !user || sendingReminder) return;

    setSendingReminder(true);
    const { success, sentCount } = await sendReminderToParticipants(
      currentEvent.id,
      currentEvent.title,
      user.id,
    );
    setSendingReminder(false);

    if (success) {
      if (sentCount > 0) {
        Alert.alert(
          "Reminder Sent",
          `Notification sent to ${sentCount} guest${sentCount !== 1 ? "s" : ""}`,
        );
      } else {
        Alert.alert(
          "No Guests to Notify",
          "No guests have push notifications enabled",
        );
      }
    } else {
      Alert.alert("Error", "Failed to send reminder");
    }
  }

  if (isLoading && !currentEvent) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          isDark && styles.containerDark,
        ]}
      >
        <ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
      </View>
    );
  }

  if (!currentEvent) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          isDark && styles.containerDark,
        ]}
      >
        <Text style={[styles.errorText, isDark && styles.textDark]}>
          Event not found
        </Text>
      </View>
    );
  }

  const isEnded = isPast(new Date(currentEvent.ends_at));
  const daysUntilExpiry = differenceInDays(
    new Date(currentEvent.expires_at),
    new Date(),
  );
  const hoursUntilExpiry = differenceInHours(
    new Date(currentEvent.expires_at),
    new Date(),
  );
  const expiryProgress = isEnded
    ? Math.max(0, Math.min(100, ((14 - daysUntilExpiry) / 14) * 100))
    : 0;
  const isHost = currentEvent.participants?.some(
    (p) => p.user_id === user?.id && p.role === "host",
  );

  const getExpiryColor = () => {
    if (daysUntilExpiry <= 1) return "#ef4444";
    if (daysUntilExpiry <= 3) return "#f59e0b";
    return "#22c55e";
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: currentEvent.title,
          headerRight: () => (
            <View style={styles.headerRight}>
              {isHost && (
                <TouchableOpacity
                  onPress={() => router.push(`/event/edit/${id}`)}
                  style={styles.headerButton}
                >
                  <FontAwesome
                    name="pencil"
                    size={18}
                    color={isDark ? "#fff" : "#000"}
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={handleShare}
                style={styles.headerButton}
              >
                <FontAwesome
                  name="share-alt"
                  size={20}
                  color={isDark ? "#fff" : "#000"}
                />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <View style={[styles.container, isDark && styles.containerDark]}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
            />
          }
        >
          <View style={styles.header}>
            <View style={styles.eventInfo}>
              <Text style={[styles.eventDate, isDark && styles.textMuted]}>
                {format(new Date(currentEvent.starts_at), "EEEE, MMMM d, yyyy")}
              </Text>
              <Text style={[styles.eventTime, isDark && styles.textMuted]}>
                {format(new Date(currentEvent.starts_at), "h:mm a")} -{" "}
                {format(new Date(currentEvent.ends_at), "h:mm a")}
              </Text>
            </View>

            {isEnded && daysUntilExpiry > 0 && (
              <View
                style={[styles.expiryBanner, isDark && styles.expiryBannerDark]}
              >
                <View
                  style={[
                    styles.expiryIconContainer,
                    { backgroundColor: getExpiryColor() },
                  ]}
                >
                  <FontAwesome name="clock-o" size={16} color="#fff" />
                </View>
                <View style={styles.expiryContent}>
                  <Text
                    style={[styles.expiryLabel, isDark && styles.textMuted]}
                  >
                    Photos expire in
                  </Text>
                  <Text
                    style={[styles.expiryValue, { color: getExpiryColor() }]}
                  >
                    {daysUntilExpiry <= 1
                      ? `${hoursUntilExpiry} hours`
                      : `${daysUntilExpiry} days`}
                  </Text>
                </View>
              </View>
            )}

            <View style={[styles.stats, isDark && styles.statsDark]}>
              <View style={styles.stat}>
                <Text style={[styles.statValue, isDark && styles.textDark]}>
                  {mergedPhotos.length}
                </Text>
                <Text style={[styles.statLabel, isDark && styles.textMuted]}>
                  Photos
                </Text>
              </View>
              <View
                style={[styles.statDivider, isDark && styles.statDividerDark]}
              />
              <TouchableOpacity
                style={styles.stat}
                onPress={handleOpenGuestSheet}
              >
                <Text style={[styles.statValue, isDark && styles.textDark]}>
                  {currentEvent.participant_count || 0}
                </Text>
                <Text style={[styles.statLabel, isDark && styles.textMuted]}>
                  Guests
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.contributeButton}
              onPress={handleContribute}
            >
              <FontAwesome name="plus" size={16} color="#fff" />
              <Text style={styles.contributeButtonText}>Add Your Photos</Text>
            </TouchableOpacity>

            {mediaItems.length > 0 && (
              <TouchableOpacity
                style={[
                  styles.downloadAllButton,
                  isDark && styles.downloadAllButtonDark,
                ]}
                onPress={handleDownloadAll}
                disabled={downloadingAll}
              >
                {downloadingAll ? (
                  <>
                    <ActivityIndicator
                      size="small"
                      color={isDark ? "#fff" : "#000"}
                    />
                    <Text
                      style={[
                        styles.downloadAllButtonText,
                        isDark && styles.textDark,
                      ]}
                    >
                      Downloading {downloadProgress.current}/
                      {downloadProgress.total}
                    </Text>
                  </>
                ) : (
                  <>
                    <FontAwesome
                      name="download"
                      size={16}
                      color={isDark ? "#fff" : "#000"}
                    />
                    <Text
                      style={[
                        styles.downloadAllButtonText,
                        isDark && styles.textDark,
                      ]}
                    >
                      Download All Photos
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {isHost && (
              <TouchableOpacity
                style={styles.remindButton}
                onPress={handleRemindGuests}
                disabled={sendingReminder}
              >
                {sendingReminder ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <FontAwesome name="bell" size={16} color="#fff" />
                )}
                <Text style={styles.remindButtonText}>
                  {sendingReminder ? "Sending..." : "Remind Guests to Upload"}
                </Text>
              </TouchableOpacity>
            )}

            {mergedPhotos.length > 0 && (
              <Text style={[styles.timelineTitle, isDark && styles.textDark]}>
                Timeline
              </Text>
            )}
          </View>

          {mergedPhotos.length === 0 ? (
            <View style={styles.emptyState}>
              <FontAwesome
                name="camera"
                size={48}
                color={isDark ? "#444" : "#ccc"}
              />
              <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
                No Photos Yet
              </Text>
              <Text style={[styles.emptyText, isDark && styles.textMuted]}>
                Photos from the event will appear here after they're uploaded
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={handleContribute}
              >
                <Text style={styles.emptyButtonText}>Add Photos</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <MasonryGrid
              photos={mergedPhotos}
              onPhotoPress={handlePhotoPress}
              onRetry={retryFailedUpload}
              isDark={isDark}
            />
          )}
        </ScrollView>

        <PhotoViewer
          photos={mergedPhotos}
          initialIndex={selectedPhotoIndex}
          visible={viewerVisible}
          onClose={handleCloseViewer}
          onDelete={handleDeletePhoto}
          currentUserId={user?.id}
          isDark={isDark}
          initialThumbnailUri={selectedThumbnailUri}
        />

        <GuestSheet
          visible={guestSheetVisible}
          onClose={() => setGuestSheetVisible(false)}
          participants={participants}
          isDark={isDark}
        />

        <NotificationPromptModal
          visible={notificationPromptVisible}
          onEnable={handleEnableNotifications}
          onMaybeLater={handleMaybeLater}
          isDark={isDark}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  containerDark: {
    backgroundColor: "#000",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    padding: 24,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerButton: {
    padding: 8,
  },
  header: {
    marginBottom: 24,
  },
  eventInfo: {
    marginBottom: 16,
  },
  eventDate: {
    fontSize: 16,
    color: "#666",
    marginBottom: 4,
  },
  eventTime: {
    fontSize: 14,
    color: "#999",
  },
  expiryBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    gap: 12,
  },
  expiryBannerDark: {
    backgroundColor: "#1a1a1a",
  },
  expiryIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  expiryContent: {
    flex: 1,
  },
  expiryLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 2,
  },
  expiryValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  stats: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  statsDark: {
    backgroundColor: "#1a1a1a",
  },
  stat: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    width: 1,
    backgroundColor: "#e5e5e5",
    marginHorizontal: 16,
  },
  statDividerDark: {
    backgroundColor: "#333",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#000",
  },
  statLabel: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  contributeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 24,
  },
  contributeButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  downloadAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 24,
  },
  downloadAllButtonDark: {
    backgroundColor: "#1a1a1a",
  },
  downloadAllButtonText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "600",
  },
  remindButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#7c3aed",
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginBottom: 24,
  },
  remindButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  timelineTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  emptyButton: {
    backgroundColor: "#000",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  errorText: {
    fontSize: 16,
    color: "#666",
  },
  textDark: {
    color: "#fff",
  },
  textMuted: {
    color: "#888",
  },
});
