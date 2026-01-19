import { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAuthStore } from '@/store/authStore';
import { useEventStore } from '@/store/eventStore';
import { useColorScheme } from '@/components/useColorScheme';
import { getPhotosInTimeRange, LocalPhoto, requestMediaPermissions } from '@/lib/mediaLibrary';
import { uploadPhotoBatch, UploadProgress } from '@/lib/storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PHOTO_SIZE = (SCREEN_WIDTH - 48 - 12) / 4;

type Step = 'loading' | 'found' | 'select' | 'uploading' | 'done' | 'error';

export default function ContributeScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const { currentEvent, fetchEventById } = useEventStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [step, setStep] = useState<Step>('loading');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({ current: 0, total: 0, percentage: 0 });
  const [uploadResult, setUploadResult] = useState<{ successful: number; failed: number } | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const loadPhotos = useCallback(async () => {
    if (!eventId) return;

    setStep('loading');

    const event = currentEvent || await fetchEventById(eventId);
    if (!event) {
      setStep('error');
      return;
    }

    const hasPermission = await requestMediaPermissions();
    if (!hasPermission) {
      setPermissionDenied(true);
      setStep('error');
      return;
    }

    const startTime = new Date(event.starts_at);
    const endTime = new Date(event.ends_at);

    const foundPhotos = await getPhotosInTimeRange(startTime, endTime);
    setPhotos(foundPhotos);
    setSelectedIds(new Set(foundPhotos.map((p) => p.id)));

    if (foundPhotos.length > 0) {
      setStep('found');
    } else {
      setStep('select');
    }
  }, [eventId, currentEvent, fetchEventById]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  function handleShareAll() {
    setStep('select');
  }

  function handleReviewFirst() {
    setStep('select');
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

  async function handleUpload() {
    if (!user || !eventId || selectedIds.size === 0) return;

    setStep('uploading');

    const selectedPhotos = photos
      .filter((p) => selectedIds.has(p.id))
      .map((p) => ({
        uri: p.uri,
        capturedAt: new Date(p.creationTime),
        width: p.width,
        height: p.height,
      }));

    const result = await uploadPhotoBatch(
      selectedPhotos,
      eventId,
      user.id,
      (progress) => setUploadProgress(progress)
    );

    setUploadResult(result);
    setStep('done');
  }

  function handleDone() {
    router.replace(`/event/${eventId}`);
  }

  if (step === 'loading') {
    return (
      <View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
        <Text style={[styles.loadingText, isDark && styles.textMuted]}>
          Scanning your photos...
        </Text>
      </View>
    );
  }

  if (step === 'error') {
    return (
      <View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
        <FontAwesome name="exclamation-circle" size={48} color="#ef4444" />
        <Text style={[styles.errorTitle, isDark && styles.textDark]}>
          {permissionDenied ? 'Permission Required' : 'Something went wrong'}
        </Text>
        <Text style={[styles.errorText, isDark && styles.textMuted]}>
          {permissionDenied
            ? 'Please allow access to your photos in Settings to continue'
            : 'Unable to load the event. Please try again.'}
        </Text>
        <TouchableOpacity style={styles.errorButton} onPress={handleSkip}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (step === 'found') {
    return (
      <View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
        <View style={styles.foundContent}>
          <View style={styles.foundIcon}>
            <FontAwesome name="camera" size={32} color="#000" />
          </View>
          <Text style={[styles.foundTitle, isDark && styles.textDark]}>
            We found {photos.length} photo{photos.length !== 1 ? 's' : ''}
          </Text>
          <Text style={[styles.foundText, isDark && styles.textMuted]}>
            from the event time window
          </Text>

          <View style={styles.foundActions}>
            <TouchableOpacity style={styles.primaryButton} onPress={handleShareAll}>
              <Text style={styles.primaryButtonText}>Share All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, isDark && styles.secondaryButtonDark]}
              onPress={handleReviewFirst}
            >
              <Text style={[styles.secondaryButtonText, isDark && styles.textDark]}>
                Review First
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
              <Text style={[styles.skipButtonText, isDark && styles.textMuted]}>Not Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (step === 'uploading') {
    return (
      <View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
        <Text style={[styles.uploadingTitle, isDark && styles.textDark]}>
          Uploading...
        </Text>
        <Text style={[styles.uploadingProgress, isDark && styles.textMuted]}>
          {uploadProgress.current} of {uploadProgress.total}
        </Text>
        <View style={styles.progressBar}>
          <View
            style={[styles.progressFill, { width: `${uploadProgress.percentage}%` }]}
          />
        </View>
      </View>
    );
  }

  if (step === 'done') {
    return (
      <View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
        <View style={styles.doneIcon}>
          <FontAwesome name="check" size={32} color="#22c55e" />
        </View>
        <Text style={[styles.doneTitle, isDark && styles.textDark]}>All Done!</Text>
        <Text style={[styles.doneText, isDark && styles.textMuted]}>
          {uploadResult?.successful || 0} photo{uploadResult?.successful !== 1 ? 's' : ''} uploaded
          {uploadResult?.failed ? ` (${uploadResult.failed} failed)` : ''}
        </Text>
        <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
          <Text style={styles.doneButtonText}>View Timeline</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: `Select Photos (${selectedIds.size})`,
          headerRight: () => (
            <TouchableOpacity
              onPress={handleUpload}
              disabled={selectedIds.size === 0}
              style={{ opacity: selectedIds.size === 0 ? 0.5 : 1 }}
            >
              <Text style={{ color: '#3b82f6', fontSize: 16, fontWeight: '600' }}>
                Upload
              </Text>
            </TouchableOpacity>
          ),
        }}
      />

      <View style={[styles.container, isDark && styles.containerDark]}>
        <View style={styles.selectHeader}>
          <Text style={[styles.selectCount, isDark && styles.textMuted]}>
            {photos.length} photo{photos.length !== 1 ? 's' : ''} from the event
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
          numColumns={4}
          renderItem={({ item }) => {
            const isSelected = selectedIds.has(item.id);
            return (
              <TouchableOpacity
                style={styles.selectPhotoItem}
                onPress={() => togglePhotoSelection(item.id)}
              >
                <Image source={{ uri: item.uri }} style={styles.selectPhotoImage} />
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
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.selectGrid}
        />

        {selectedIds.size > 0 && (
          <View style={styles.selectFooter}>
            <TouchableOpacity style={styles.uploadButton} onPress={handleUpload}>
              <Text style={styles.uploadButtonText}>
                Upload {selectedIds.size} Photo{selectedIds.size !== 1 ? 's' : ''}
              </Text>
            </TouchableOpacity>
          </View>
        )}
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
    padding: 24,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  errorButton: {
    backgroundColor: '#000',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  errorButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  foundContent: {
    alignItems: 'center',
  },
  foundIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  foundTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  foundText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  foundActions: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#000',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  secondaryButtonDark: {
    backgroundColor: '#1a1a1a',
  },
  secondaryButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '600',
  },
  skipButton: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#666',
    fontSize: 16,
  },
  uploadingTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginTop: 24,
    marginBottom: 8,
  },
  uploadingProgress: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#e5e5e5',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#000',
    borderRadius: 4,
  },
  doneIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  doneTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  doneText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  doneButton: {
    backgroundColor: '#000',
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 14,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  selectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  selectCount: {
    fontSize: 14,
    color: '#666',
  },
  selectActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectAction: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '500',
  },
  selectDivider: {
    color: '#e5e5e5',
  },
  selectGrid: {
    padding: 12,
  },
  selectPhotoItem: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    margin: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  selectPhotoImage: {
    width: '100%',
    height: '100%',
  },
  selectOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 6,
  },
  selectOverlaySelected: {
    borderColor: '#3b82f6',
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  selectCheckmark: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
  },
  uploadButton: {
    backgroundColor: '#000',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  textDark: {
    color: '#fff',
  },
  textMuted: {
    color: '#888',
  },
});
