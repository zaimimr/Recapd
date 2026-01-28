import { useColorScheme } from "@/components/useColorScheme";
import SelectionPhotoViewer from "@/components/SelectionPhotoViewer";
import {
  getPhotosInTimeRange,
  LocalPhoto,
  pickPhotosFromLibrary,
  requestMediaPermissions,
} from "@/lib/mediaLibrary";
import { useAuthStore } from "@/store/authStore";
import { useEventStore } from "@/store/eventStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const NUM_COLUMNS = 3;
const GRID_PADDING = 8;
const GRID_GAP = 2;
const PHOTO_SIZE =
  (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) /
  NUM_COLUMNS;

type Step = "loading" | "select" | "empty" | "error";

export default function ContributeScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const {
    currentEvent,
    fetchEventById,
    addPendingUploads,
    getUploadedPhotoIdsForEvent,
  } = useEventStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [step, setStep] = useState<Step>("loading");
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [manualPhotos, setManualPhotos] = useState<LocalPhoto[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [uploadedIds, setUploadedIds] = useState<Set<string>>(new Set());
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [scanError, setScanError] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const allPhotos = [...photos, ...manualPhotos];

  const loadPhotos = useCallback(async () => {
    if (!eventId) return;

    setStep("loading");
    setScanError(false);

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

    try {
      const startTime = new Date(event.starts_at);
      const endTime = new Date(event.ends_at);

      const foundPhotos = await getPhotosInTimeRange(startTime, endTime);

      const alreadyUploaded = user
        ? await getUploadedPhotoIdsForEvent(eventId, user.id, foundPhotos)
        : new Set<string>();

      setPhotos(foundPhotos);
      setUploadedIds(alreadyUploaded);

      const newPhotoIds = foundPhotos
        .filter((p) => !alreadyUploaded.has(p.id))
        .map((p) => p.id);
      setSelectedIds(new Set(newPhotoIds));

      if (foundPhotos.length > 0) {
        setStep("select");
      } else {
        setStep("empty");
      }
    } catch (error) {
      console.error('Photo scanning failed:', error);
      setScanError(true);
      setStep("error");
    }
  }, [eventId, currentEvent, fetchEventById, getUploadedPhotoIdsForEvent, user]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  function handleSkip() {
    router.back();
  }

  function togglePhotoSelection(id: string) {
    if (uploadedIds.has(id)) return;
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  }

  function selectAll() {
    const selectableIds = allPhotos
      .filter((p) => !uploadedIds.has(p.id))
      .map((p) => p.id);
    setSelectedIds(new Set(selectableIds));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  async function handleManualPick() {
    const { photos: picked, videosFiltered } = await pickPhotosFromLibrary();
    if (videosFiltered) {
      Alert.alert(
        "Videos Not Supported",
        "Currently we do not support video uploads. Videos have been deselected."
      );
    }
    if (picked.length > 0) {
      const existingUris = new Set(allPhotos.map((p) => p.uri));
      const newPhotos = picked.filter((p) => !existingUris.has(p.uri));
      setManualPhotos((prev) => [...prev, ...newPhotos]);
      const newIds = new Set(newPhotos.map((p) => p.id));
      setSelectedIds((prev) => new Set([...prev, ...newIds]));
    }
  }

  async function handleManualPickFromError() {
    const { photos: picked, videosFiltered } = await pickPhotosFromLibrary();
    if (videosFiltered) {
      Alert.alert(
        "Videos Not Supported",
        "Currently we do not support video uploads. Videos have been deselected."
      );
    }
    if (picked.length > 0) {
      setManualPhotos(picked);
      const newIds = new Set(picked.map((p) => p.id));
      setSelectedIds(newIds);
      setStep("select");
    }
  }

  const newPhotosCount = allPhotos.filter((p) => !uploadedIds.has(p.id)).length;
  const alreadyUploadedCount =
    uploadedIds.size > 0
      ? allPhotos.filter((p) => uploadedIds.has(p.id)).length
      : 0;

  function handleUpload() {
    if (!user || !eventId || selectedIds.size === 0) return;
    const selectedPhotos = allPhotos.filter((p) => selectedIds.has(p.id));
    addPendingUploads(selectedPhotos, eventId, user.id);
    router.replace(`/event/${eventId}`);
  }

  if (step === "loading") {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          isDark && styles.containerDark,
        ]}
      >
        <ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
        <Text style={[styles.loadingText, isDark && styles.textMuted]}>
          Scanning your photos...
        </Text>
      </View>
    );
  }

  if (step === "error") {
    const errorTitle = permissionDenied
      ? "Permission Required"
      : scanError
        ? "Scanning Issue"
        : "Something went wrong";
    const errorMessage = permissionDenied
      ? "Please allow access to your photos in Settings to continue"
      : scanError
        ? "We had trouble scanning your photos automatically"
        : "Unable to load the event. Please try again.";

    return (
      <View
        style={[
          styles.container,
          styles.centered,
          isDark && styles.containerDark,
        ]}
      >
        <FontAwesome name="exclamation-circle" size={48} color="#ef4444" />
        <Text style={[styles.errorTitle, isDark && styles.textDark]}>
          {errorTitle}
        </Text>
        <Text style={[styles.errorText, isDark && styles.textMuted]}>
          {errorMessage}
        </Text>
        {scanError && (
          <TouchableOpacity
            style={styles.manualPickButton}
            onPress={handleManualPickFromError}
          >
            <FontAwesome name="photo" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.manualPickButtonText}>Select Photos Manually</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.errorButton, scanError && styles.errorButtonSecondary]}
          onPress={handleSkip}
        >
          <Text style={[styles.errorButtonText, scanError && styles.errorButtonTextSecondary]}>
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === "empty") {
    return (
      <>
        <Stack.Screen
          options={{
            title: "",
            headerRight: () => (
              <TouchableOpacity onPress={handleSkip} style={{ padding: 8 }}>
                <FontAwesome
                  name="times"
                  size={22}
                  color={isDark ? "#fff" : "#000"}
                />
              </TouchableOpacity>
            ),
          }}
        />
        <View
          style={[
            styles.container,
            styles.centered,
            isDark && styles.containerDark,
          ]}
        >
          <View style={styles.emptyContent}>
            <View style={[styles.emptyIcon, isDark && styles.emptyIconDark]}>
              <FontAwesome
                name="camera"
                size={32}
                color={isDark ? "#888" : "#666"}
              />
            </View>
            <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
              No Photos Found
            </Text>
            <Text style={[styles.emptyText, isDark && styles.textMuted]}>
              We couldn't find any photos from the event time window.
            </Text>
            <Text style={[styles.emptyHint, isDark && styles.textMuted]}>
              Or select photos manually from your library.
            </Text>
            <TouchableOpacity
              style={styles.manualPickButton}
              onPress={handleManualPickFromError}
            >
              <FontAwesome name="photo" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.manualPickButtonText}>Select Photos Manually</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.emptyButtonSecondary} onPress={handleSkip}>
              <Text style={styles.emptyButtonSecondaryText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{ title: `Select Photos (${selectedIds.size})` }}
      />

      <View style={[styles.container, isDark && styles.containerDark]}>
        <View style={styles.selectHeader}>
          <View>
            <Text style={[styles.selectCount, isDark && styles.textMuted]}>
              {newPhotosCount} new photo{newPhotosCount !== 1 ? "s" : ""}
            </Text>
            {alreadyUploadedCount > 0 && (
              <Text style={[styles.uploadedCount, isDark && styles.textMuted]}>
                {alreadyUploadedCount} already uploaded
              </Text>
            )}
          </View>
          <View style={styles.selectActions}>
            <TouchableOpacity onPress={selectAll}>
              <Text style={styles.selectAction}>Select All</Text>
            </TouchableOpacity>
            <Text style={[styles.selectDivider, isDark && styles.textMuted]}>
              |
            </Text>
            <TouchableOpacity onPress={deselectAll}>
              <Text style={styles.selectAction}>Clear</Text>
            </TouchableOpacity>
            <Text style={[styles.selectDivider, isDark && styles.textMuted]}>
              |
            </Text>
            <TouchableOpacity onPress={handleManualPick} style={styles.addPhotosButton}>
              <FontAwesome name="plus" size={14} color="#3b82f6" />
              <Text style={styles.selectAction}> Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          data={allPhotos}
          keyExtractor={(item) => item.id}
          numColumns={NUM_COLUMNS}
          renderItem={({ item, index }) => {
            const isSelected = selectedIds.has(item.id);
            const isUploaded = uploadedIds.has(item.id);
            return (
              <TouchableOpacity
                style={styles.selectPhotoItem}
                onPress={() => togglePhotoSelection(item.id)}
                onLongPress={() => setPreviewIndex(index)}
                delayLongPress={200}
                disabled={isUploaded}
              >
                <Image
                  source={{ uri: item.uri }}
                  style={styles.selectPhotoImage}
                />
                {isUploaded ? (
                  <View style={styles.uploadedOverlay}>
                    <View style={styles.uploadedBadge}>
                      <FontAwesome name="cloud" size={10} color="#fff" />
                    </View>
                  </View>
                ) : (
                  <View
                    style={[
                      styles.selectOverlay,
                      isSelected && styles.selectOverlaySelected,
                    ]}
                  >
                    {isSelected && (
                      <View style={styles.selectCheckmark}>
                        <FontAwesome name="check" size={12} color="#fff" />
                      </View>
                    )}
                  </View>
                )}
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
            <FontAwesome
              name="cloud-upload"
              size={20}
              color="#fff"
              style={styles.uploadIcon}
            />
            <Text style={styles.uploadButtonText}>
              {selectedIds.size > 0
                ? `Share ${selectedIds.size} Photo${selectedIds.size !== 1 ? "s" : ""}`
                : "Select photos to share"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <SelectionPhotoViewer
        photos={allPhotos}
        initialIndex={previewIndex ?? 0}
        visible={previewIndex !== null}
        onClose={() => setPreviewIndex(null)}
        selectedIds={selectedIds}
        uploadedIds={uploadedIds}
        onToggleSelection={togglePhotoSelection}
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
  errorButtonSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#666",
  },
  errorButtonTextSecondary: {
    color: "#666",
  },
  manualPickButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3b82f6",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 12,
  },
  manualPickButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyContent: {
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  emptyIconDark: {
    backgroundColor: "#1a1a1a",
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#000",
    marginBottom: 12,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginBottom: 32,
  },
  emptyButton: {
    backgroundColor: "#000",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyButtonSecondary: {
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  emptyButtonSecondaryText: {
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
  addPhotosButton: {
    flexDirection: "row",
    alignItems: "center",
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
  uploadedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    borderRadius: 6,
  },
  uploadedBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#22c55e",
    justifyContent: "center",
    alignItems: "center",
  },
  uploadedCount: {
    fontSize: 12,
    color: "#22c55e",
    marginTop: 2,
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
});
