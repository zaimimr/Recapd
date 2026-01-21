import { useColorScheme } from "@/components/useColorScheme";
import {
  getPhotosInTimeRange,
  LocalPhoto,
  requestMediaPermissions,
} from "@/lib/mediaLibrary";
import { useAuthStore } from "@/store/authStore";
import { useEventStore } from "@/store/eventStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  Pressable,
} from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const NUM_COLUMNS = 3;
const GRID_PADDING = 8;
const GRID_GAP = 2;
const PHOTO_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

type Step = "loading" | "found" | "select" | "error";

interface PhotoPreviewProps {
  photo: LocalPhoto | null;
  visible: boolean;
  onClose: () => void;
}

function PhotoPreview({ photo, visible, onClose }: PhotoPreviewProps) {
  if (!photo) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.previewContainer} onPress={onClose}>
        <View style={styles.previewHeader}>
          <TouchableOpacity style={styles.previewCloseButton} onPress={onClose}>
            <FontAwesome name="times" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.previewImageContainer}>
          <Image
            source={{ uri: photo.uri }}
            style={styles.previewImage}
            resizeMode="contain"
          />
        </View>
      </Pressable>
    </Modal>
  );
}

export default function ContributeScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { currentEvent, fetchEventById, addPendingUploads } = useEventStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [step, setStep] = useState<Step>("loading");
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<LocalPhoto | null>(null);

  const loadPhotos = useCallback(async () => {
    if (!eventId) return;

    setStep("loading");

    const event = currentEvent || (await fetchEventById(eventId));
    if (!event) {
      setStep("error");
      return;
    }

    const hasPermission = await requestMediaPermissions();
    if (!hasPermission) {
      setPermissionDenied(true);
      setStep("error");
      return;
    }

    const startTime = new Date(event.starts_at);
    const endTime = new Date(event.ends_at);

    const foundPhotos = await getPhotosInTimeRange(startTime, endTime);
    setPhotos(foundPhotos);
    setSelectedIds(new Set(foundPhotos.map((p) => p.id)));

    if (foundPhotos.length > 0) {
      setStep("found");
    } else {
      setStep("select");
    }
  }, [eventId, currentEvent, fetchEventById]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  function handleShareAll() {
    if (!user || !eventId || photos.length === 0) return;
    addPendingUploads(photos, eventId, user.id);
    router.replace(`/event/${eventId}`);
  }

  function handleReviewFirst() {
    setStep("select");
  }

  function handleSkip() {
    router.back();
  }

  function togglePhotoSelection(id: string) {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  }

  function selectAll() {
    setSelectedIds(new Set(photos.map((p) => p.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  function handleUpload() {
    if (!user || !eventId || selectedIds.size === 0) return;
    const selectedPhotos = photos.filter((p) => selectedIds.has(p.id));
    addPendingUploads(selectedPhotos, eventId, user.id);
    router.replace(`/event/${eventId}`);
  }

  if (step === "loading") {
    return (
      <View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
        <ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
        <Text style={[styles.loadingText, isDark && styles.textMuted]}>
          Scanning your photos...
        </Text>
      </View>
    );
  }

  if (step === "error") {
    return (
      <View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
        <FontAwesome name="exclamation-circle" size={48} color="#ef4444" />
        <Text style={[styles.errorTitle, isDark && styles.textDark]}>
          {permissionDenied ? "Permission Required" : "Something went wrong"}
        </Text>
        <Text style={[styles.errorText, isDark && styles.textMuted]}>
          {permissionDenied
            ? "Please allow access to your photos in Settings to continue"
            : "Unable to load the event. Please try again."}
        </Text>
        <TouchableOpacity style={styles.errorButton} onPress={handleSkip}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === "found") {
    return (
      <>
        <Stack.Screen
          options={{
            title: "",
            headerRight: () => (
              <TouchableOpacity onPress={handleSkip} style={{ padding: 8 }}>
                <FontAwesome name="times" size={22} color={isDark ? "#fff" : "#000"} />
              </TouchableOpacity>
            ),
          }}
        />
        <View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
          <View style={styles.foundContent}>
            <View style={styles.foundIcon}>
              <FontAwesome name="camera" size={32} color="#000" />
            </View>
            <Text style={[styles.foundTitle, isDark && styles.textDark]}>
              We found {photos.length} photo{photos.length !== 1 ? "s" : ""}
            </Text>
            <Text style={[styles.foundText, isDark && styles.textMuted]}>
              from the event time window
            </Text>
            <View style={styles.foundActions}>
              <TouchableOpacity style={styles.primaryButton} onPress={handleReviewFirst}>
                <Text style={styles.primaryButtonText}>Review First</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, isDark && styles.secondaryButtonDark]}
                onPress={handleShareAll}
              >
                <Text style={[styles.secondaryButtonText, isDark && styles.textDark]}>
                  Share All
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: `Select Photos (${selectedIds.size})` }} />

      <View style={[styles.container, isDark && styles.containerDark]}>
        <View style={styles.selectHeader}>
          <Text style={[styles.selectCount, isDark && styles.textMuted]}>
            {photos.length} photo{photos.length !== 1 ? "s" : ""} from the event
          </Text>
          <View style={styles.selectActions}>
            <TouchableOpacity onPress={selectAll}>
              <Text style={styles.selectAction}>Select All</Text>
            </TouchableOpacity>
            <Text style={[styles.selectDivider, isDark && styles.textMuted]}>|</Text>
            <TouchableOpacity onPress={deselectAll}>
              <Text style={styles.selectAction}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          data={photos}
          keyExtractor={(item) => item.id}
          numColumns={NUM_COLUMNS}
          renderItem={({ item }) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <TouchableOpacity
                style={styles.selectPhotoItem}
                onPress={() => togglePhotoSelection(item.id)}
                onLongPress={() => setPreviewPhoto(item)}
                delayLongPress={200}
              >
                <Image source={{ uri: item.uri }} style={styles.selectPhotoImage} />
                <View style={[styles.selectOverlay, isSelected && styles.selectOverlaySelected]}>
                  {isSelected && (
                    <View style={styles.selectCheckmark}>
                      <FontAwesome name="check" size={12} color="#fff" />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.selectGrid}
        />

        <View style={[styles.selectFooter, isDark && styles.selectFooterDark]}>
          <TouchableOpacity
            style={[
              styles.uploadButton,
              selectedIds.size === 0 && styles.uploadButtonDisabled,
            ]}
            onPress={handleUpload}
            disabled={selectedIds.size === 0}
          >
            <FontAwesome name="cloud-upload" size={20} color="#fff" style={styles.uploadIcon} />
            <Text style={styles.uploadButtonText}>
              {selectedIds.size > 0
                ? `Share ${selectedIds.size} Photo${selectedIds.size !== 1 ? "s" : ""}`
                : "Select photos to share"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <PhotoPreview
        photo={previewPhoto}
        visible={previewPhoto !== null}
        onClose={() => setPreviewPhoto(null)}
      />
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
    padding: 24,
  },
  loadingText: {
    fontSize: 16,
    color: "#666",
    marginTop: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000",
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  errorButton: {
    backgroundColor: "#000",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  errorButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  foundContent: {
    alignItems: "center",
  },
  foundIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  foundTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#000",
    marginBottom: 8,
  },
  foundText: {
    fontSize: 16,
    color: "#666",
    marginBottom: 32,
  },
  foundActions: {
    width: "100%",
    gap: 12,
  },
  primaryButton: {
    backgroundColor: "#000",
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  secondaryButton: {
    paddingVertical: 16,
    alignItems: "center",
  },
  secondaryButtonDark: {},
  secondaryButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "500",
  },
  selectHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  selectCount: {
    fontSize: 14,
    color: "#666",
  },
  selectActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectAction: {
    fontSize: 14,
    color: "#3b82f6",
    fontWeight: "500",
  },
  selectDivider: {
    color: "#e5e5e5",
  },
  selectGrid: {
    padding: GRID_PADDING,
  },
  selectPhotoItem: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    margin: GRID_GAP / 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  selectPhotoImage: {
    width: "100%",
    height: "100%",
  },
  selectOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 6,
  },
  selectOverlaySelected: {
    borderColor: "#3b82f6",
    backgroundColor: "rgba(59, 130, 246, 0.2)",
  },
  selectCheckmark: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#3b82f6",
    justifyContent: "center",
    alignItems: "center",
  },
  selectFooter: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e5e5",
  },
  selectFooterDark: {
    backgroundColor: "#000",
    borderTopColor: "#333",
  },
  uploadButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 18,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#007AFF",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  uploadButtonDisabled: {
    backgroundColor: "#c7c7cc",
    shadowOpacity: 0,
  },
  uploadIcon: {
    marginRight: 10,
  },
  uploadButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  textDark: {
    color: "#fff",
  },
  textMuted: {
    color: "#888",
  },
  previewContainer: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
  },
  previewHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    zIndex: 10,
  },
  previewCloseButton: {
    padding: 8,
    alignSelf: "flex-start",
  },
  previewImageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  previewImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
});
