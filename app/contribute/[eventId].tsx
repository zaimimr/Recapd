import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Image as ExpoImage } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	FlatList,
	type LayoutChangeEvent,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import SelectionPhotoViewer from "@/components/SelectionPhotoViewer";
import { useColorScheme } from "@/components/useColorScheme";
import { checkDiskBudget, formatBytes } from "@/lib/diskSpace";
import { logger } from "@/lib/logger";
import {
	type LocalPhoto,
	pickMediaFromLibrary,
	requestMediaPermissions,
	scanMediaInTimeRange,
} from "@/lib/mediaLibrary";
import { createVideoThumbnailUri } from "@/lib/storage";
import { formatDuration } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useEventStore } from "@/store/eventStore";
import { useIsPro, useSubscriptionPlans } from "@/store/subscriptionStore";
import {
	formatFileSizeLabel,
	formatVideoDurationLabel,
	getMaxFileSizeBytes,
	getMaxVideoDurationMs,
	PRO_MAX_FILE_SIZE_BYTES,
	PRO_MAX_VIDEO_DURATION_MS,
} from "@/types/subscription";

const NUM_COLUMNS = 3;
const GRID_PADDING = 8;
const GRID_GAP = 2;
const SCAN_ACTION_DELAY_MS = 4000;

function formatDurationHms(milliseconds: number): string {
	if (!Number.isFinite(milliseconds) || milliseconds < 0) return "00:00:00";
	const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
		.toString()
		.padStart(2, "0")}`;
}

const VideoThumbnail = memo(function VideoThumbnail({
	uri,
	style,
}: {
	uri: string;
	style: object;
}) {
	const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;
		createVideoThumbnailUri(uri, 0)
			.then((thumbUri) => {
				if (mounted) setThumbnailUri(thumbUri);
			})
			.catch(() => {});
		return () => {
			mounted = false;
		};
	}, [uri]);

	if (!thumbnailUri) {
		return <View style={[style, { backgroundColor: "#1a1a1a" }]} />;
	}

	return (
		<ExpoImage
			source={{ uri: thumbnailUri }}
			style={style}
			contentFit="cover"
			cachePolicy="memory-disk"
			transition={150}
		/>
	);
});

type Step = "loading" | "select" | "empty" | "error";

export default function ContributeScreen() {
	const { eventId } = useLocalSearchParams<{ eventId: string }>();
	const router = useRouter();
	const user = useAuthStore((state) => state.user);
	const { currentEvent, fetchEventById, addPendingUploads, getUploadedPhotoIdsForEvent } =
		useEventStore();
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";
	const [containerWidth, setContainerWidth] = useState(0);
	const photoSize = containerWidth
		? Math.floor((containerWidth - GRID_PADDING * 2 - GRID_GAP * NUM_COLUMNS) / NUM_COLUMNS)
		: 0;

	const isPro = useIsPro();
	const plans = useSubscriptionPlans();
	const hostIsPro = currentEvent?.hostIsPro || false;
	const maxVideoDurationMilliseconds = getMaxVideoDurationMs(isPro, hostIsPro, plans);
	const maxFileSizeBytes = getMaxFileSizeBytes(isPro, hostIsPro, plans);
	const canUpgradeForMoreLimits = !isPro && !hostIsPro;

	const notifySkippedMedia = useCallback(
		(videosTooLong: number, filesTooLarge: number, iCloudUnavailable: number = 0) => {
			if (videosTooLong > 0) {
				const base = `${videosTooLong} video${videosTooLong > 1 ? "s were" : " was"} skipped (over ${formatDuration(maxVideoDurationMilliseconds)}).`;
				Alert.alert(
					"Videos Too Long",
					canUpgradeForMoreLimits
						? `${base} Upgrade to Pro for videos up to ${formatVideoDurationLabel(PRO_MAX_VIDEO_DURATION_MS)}.`
						: base
				);
			}
			if (filesTooLarge > 0) {
				const base = `${filesTooLarge} file${filesTooLarge > 1 ? "s were" : " was"} skipped (over ${formatFileSizeLabel(maxFileSizeBytes)}).`;
				Alert.alert(
					"Files Too Large",
					canUpgradeForMoreLimits
						? `${base} Upgrade to Pro for files up to ${formatFileSizeLabel(PRO_MAX_FILE_SIZE_BYTES)}.`
						: base
				);
			}
			if (iCloudUnavailable > 0) {
				Alert.alert(
					"iCloud Items Skipped",
					`${iCloudUnavailable} item${iCloudUnavailable > 1 ? "s are" : " is"} stored in iCloud and could not be downloaded. Open them in the Photos app first to bring them to this device, then try again.`
				);
			}
		},
		[canUpgradeForMoreLimits, maxVideoDurationMilliseconds, maxFileSizeBytes]
	);

	const [step, setStep] = useState<Step>("loading");
	const [photos, setPhotos] = useState<LocalPhoto[]>([]);
	const [manualPhotos, setManualPhotos] = useState<LocalPhoto[]>([]);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [uploadedIds, setUploadedIds] = useState<Set<string>>(new Set());
	const [permissionDenied, setPermissionDenied] = useState(false);
	const [scanError, setScanError] = useState(false);
	const [previewIndex, setPreviewIndex] = useState<number | null>(null);
	const [showSlowScanActions, setShowSlowScanActions] = useState(false);
	const [isQueueingUploads, setIsQueueingUploads] = useState(false);
	const scanRequestIdRef = useRef(0);

	const allPhotos = useMemo(() => [...photos, ...manualPhotos], [photos, manualPhotos]);

	const cancelActiveScan = useCallback(() => {
		scanRequestIdRef.current += 1;
		setShowSlowScanActions(false);
	}, []);

	const applyScannedMedia = useCallback(
		(filteredMedia: LocalPhoto[], alreadyUploaded: Set<string>) => {
			const newPhotoIds = filteredMedia.filter((p) => !alreadyUploaded.has(p.id)).map((p) => p.id);
			startTransition(() => {
				setPhotos(filteredMedia);
				setUploadedIds(alreadyUploaded);
				setSelectedIds(new Set(newPhotoIds));
				setStep(filteredMedia.length > 0 ? "select" : "empty");
			});
		},
		[]
	);

	const mergeManualMedia = useCallback(
		async (picked: LocalPhoto[], options?: { replaceExisting?: boolean }) => {
			if (!eventId || picked.length === 0) return;

			const replaceExisting = options?.replaceExisting ?? false;
			const existingUris = new Set((replaceExisting ? [] : allPhotos).map((photo) => photo.uri));
			const uniqueMedia = picked
				.filter((photo) => !existingUris.has(photo.uri))
				.filter((photo) => {
					if (photo.mediaType === "video" && photo.duration > maxVideoDurationMilliseconds) {
						return false;
					}
					if (typeof photo.fileSize === "number" && photo.fileSize > maxFileSizeBytes) {
						return false;
					}
					return true;
				});
			const uploadedForPicked =
				user && uniqueMedia.length > 0
					? await getUploadedPhotoIdsForEvent(eventId, user.id, uniqueMedia)
					: new Set<string>();

			startTransition(() => {
				setManualPhotos((prev) => (replaceExisting ? uniqueMedia : [...prev, ...uniqueMedia]));
				setUploadedIds((prev) => new Set([...prev, ...uploadedForPicked]));
				setSelectedIds((prev) => {
					const next = replaceExisting ? new Set<string>() : new Set(prev);
					for (const item of uniqueMedia) {
						if (!uploadedForPicked.has(item.id)) {
							next.add(item.id);
						}
					}
					return next;
				});
				setStep("select");
			});
		},
		[
			allPhotos,
			eventId,
			getUploadedPhotoIdsForEvent,
			maxVideoDurationMilliseconds,
			maxFileSizeBytes,
			user,
		]
	);

	const loadPhotos = useCallback(async () => {
		if (!eventId) return;

		const requestId = scanRequestIdRef.current + 1;
		scanRequestIdRef.current = requestId;
		setStep("loading");
		setPermissionDenied(false);
		setScanError(false);
		setShowSlowScanActions(false);

		const slowScanTimer = setTimeout(() => {
			if (scanRequestIdRef.current === requestId) {
				setShowSlowScanActions(true);
			}
		}, SCAN_ACTION_DELAY_MS);

		try {
			const event = currentEvent?.id === eventId ? currentEvent : await fetchEventById(eventId);
			if (!event || scanRequestIdRef.current !== requestId) {
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

			const scanResult = await scanMediaInTimeRange(startTime, endTime, {
				limit: 1000,
				includeVideos: true,
				timeoutMs: 20000,
				paddingMs: 2 * 60 * 1000,
			});
			if (scanRequestIdRef.current !== requestId) {
				return;
			}

			if (scanResult.timedOut) {
				setShowSlowScanActions(true);
			}

			const filteredMedia = scanResult.media.filter((item) => {
				if (
					item.mediaType === "video" &&
					maxVideoDurationMilliseconds > 0 &&
					item.duration > maxVideoDurationMilliseconds
				) {
					return false;
				}
				if (
					maxFileSizeBytes > 0 &&
					typeof item.fileSize === "number" &&
					item.fileSize > maxFileSizeBytes
				) {
					return false;
				}
				return true;
			});

			const alreadyUploaded = user
				? await getUploadedPhotoIdsForEvent(eventId, user.id, filteredMedia)
				: new Set<string>();
			if (scanRequestIdRef.current !== requestId) {
				return;
			}
			applyScannedMedia(filteredMedia, alreadyUploaded);
			if (scanResult.iCloudUnavailable > 0) {
				notifySkippedMedia(0, 0, scanResult.iCloudUnavailable);
			}
		} catch (error) {
			logger.error("Photo scanning failed", error, { eventId });
			setScanError(true);
			setStep("error");
		} finally {
			clearTimeout(slowScanTimer);
			if (scanRequestIdRef.current === requestId) {
				setShowSlowScanActions(false);
			}
		}
	}, [
		applyScannedMedia,
		eventId,
		currentEvent,
		fetchEventById,
		getUploadedPhotoIdsForEvent,
		notifySkippedMedia,
		user,
		maxVideoDurationMilliseconds,
		maxFileSizeBytes,
	]);

	useEffect(() => {
		loadPhotos();
	}, [loadPhotos]);

	function handleSkip() {
		cancelActiveScan();
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
		const selectableIds = allPhotos.filter((p) => !uploadedIds.has(p.id)).map((p) => p.id);
		setSelectedIds(new Set(selectableIds));
	}

	function deselectAll() {
		setSelectedIds(new Set());
	}

	async function handleManualPick() {
		const {
			media: picked,
			videosTooLong,
			filesTooLarge,
			iCloudUnavailable,
			error,
		} = await pickMediaFromLibrary({
			includeVideos: true,
			maxVideoDuration: maxVideoDurationMilliseconds,
			maxFileSizeBytes,
		});

		if (error) {
			Alert.alert("Media Access Error", error);
			return;
		}

		notifySkippedMedia(videosTooLong, filesTooLarge, iCloudUnavailable);

		if (picked.length > 0) {
			await mergeManualMedia(picked);
		}
	}

	async function handleManualPickFromRecovery() {
		cancelActiveScan();
		const {
			media: picked,
			videosTooLong,
			filesTooLarge,
			iCloudUnavailable,
			error,
		} = await pickMediaFromLibrary({
			includeVideos: true,
			maxVideoDuration: maxVideoDurationMilliseconds,
			maxFileSizeBytes,
		});

		if (error) {
			Alert.alert("Media Access Error", error);
			return;
		}

		notifySkippedMedia(videosTooLong, filesTooLarge, iCloudUnavailable);

		if (picked.length > 0) {
			await mergeManualMedia(picked, { replaceExisting: true });
		}
	}

	const selectableMedia = allPhotos.filter((p) => !uploadedIds.has(p.id));
	const newPhotosCount = selectableMedia.filter((p) => p.mediaType === "photo").length;
	const newVideosCount = selectableMedia.filter((p) => p.mediaType === "video").length;
	const alreadyUploadedCount =
		uploadedIds.size > 0 ? allPhotos.filter((p) => uploadedIds.has(p.id)).length : 0;

	const selectedPhotosCount = allPhotos.filter(
		(p) => selectedIds.has(p.id) && p.mediaType === "photo"
	).length;
	const selectedVideosCount = allPhotos.filter(
		(p) => selectedIds.has(p.id) && p.mediaType === "video"
	).length;
	const selectedVideoDuration = allPhotos
		.filter((p) => selectedIds.has(p.id) && p.mediaType === "video")
		.reduce((total, item) => total + item.duration, 0);

	function getShareButtonText(): string {
		if (selectedIds.size === 0) return "Select media to share";
		const parts: string[] = [];
		if (selectedPhotosCount > 0)
			parts.push(`${selectedPhotosCount} photo${selectedPhotosCount !== 1 ? "s" : ""}`);
		if (selectedVideosCount > 0)
			parts.push(`${selectedVideosCount} video${selectedVideosCount !== 1 ? "s" : ""}`);
		return `Share ${parts.join(" & ")}`;
	}

	function getCountText(): string {
		const parts: string[] = [];
		if (newPhotosCount > 0) parts.push(`${newPhotosCount} photo${newPhotosCount !== 1 ? "s" : ""}`);
		if (newVideosCount > 0) parts.push(`${newVideosCount} video${newVideosCount !== 1 ? "s" : ""}`);
		return parts.join(", ") || "No new media";
	}

	function getSelectionSummary(): string {
		if (selectedIds.size === 0) return "Nothing selected yet";
		const parts = [`${selectedIds.size} selected`];
		if (selectedVideosCount > 0) {
			parts.push(`${formatDurationHms(selectedVideoDuration)} total video duration`);
		}
		return parts.join(" · ");
	}

	async function handleUpload() {
		if (!user || !eventId || selectedIds.size === 0 || isQueueingUploads) return;
		const selectedPhotos = allPhotos.filter((p) => selectedIds.has(p.id));

		setIsQueueingUploads(true);
		try {
			const knownBundleBytes = selectedPhotos.reduce(
				(sum, item) => sum + (typeof item.fileSize === "number" ? item.fileSize : 0),
				0
			);
			if (knownBundleBytes > 0) {
				const budget = await checkDiskBudget(knownBundleBytes);
				if (!budget.ok) {
					Alert.alert(
						"Not Enough Free Space",
						`Your selection is ~${formatBytes(knownBundleBytes)} but only ${formatBytes(budget.freeBytes)} are free. Free up space or pick fewer items.`
					);
					setIsQueueingUploads(false);
					return;
				}
			}
			await addPendingUploads(selectedPhotos, eventId, user.id);
			router.replace(`/event/${eventId}`);
		} catch (error) {
			logger.error("Failed to queue uploads", error, {
				eventId,
				userId: user.id,
				selectedCount: selectedPhotos.length,
			});
			Alert.alert("Upload Error", "We couldn't prepare your uploads. Please try again.");
		} finally {
			setIsQueueingUploads(false);
		}
	}

	if (step === "loading") {
		return (
			<View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
				<View style={[styles.statePanel, isDark && styles.statePanelDark]}>
					<ActivityIndicator size="large" color={isDark ? "#fff" : "#111827"} />
					<Text style={[styles.loadingText, isDark && styles.textMuted]}>
						Scanning your photos and videos...
					</Text>
					<Text style={[styles.loadingHint, isDark && styles.textMuted]}>
						We’re checking the event time window and preparing previews.
					</Text>
					{showSlowScanActions && (
						<View style={styles.loadingActions}>
							<Text style={[styles.loadingSlowText, isDark && styles.textMuted]}>
								This is taking longer than usual. You can keep waiting, choose media manually, or
								skip for now.
							</Text>
							<TouchableOpacity
								style={styles.manualPickButton}
								onPress={handleManualPickFromRecovery}
							>
								<FontAwesome name="photo" size={18} color="#fff" style={{ marginRight: 8 }} />
								<Text style={styles.manualPickButtonText}>Select Media Manually</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={[styles.emptyButtonSecondary, isDark && styles.emptyButtonSecondaryDark]}
								onPress={handleSkip}
							>
								<Text style={[styles.emptyButtonSecondaryText, isDark && styles.textMuted]}>
									Skip for now
								</Text>
							</TouchableOpacity>
						</View>
					)}
				</View>
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
			? "Please allow access to your photos and videos in Settings to continue"
			: scanError
				? "We had trouble scanning your photos and videos automatically"
				: "Unable to load the event. Please try again.";

		return (
			<View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
				<View style={[styles.statePanel, isDark && styles.statePanelDark]}>
					<FontAwesome name="exclamation-circle" size={48} color="#ef4444" />
					<Text style={[styles.errorTitle, isDark && styles.textDark]}>{errorTitle}</Text>
					<Text style={[styles.errorText, isDark && styles.textMuted]}>{errorMessage}</Text>
					{scanError && (
						<TouchableOpacity
							style={styles.manualPickButton}
							onPress={handleManualPickFromRecovery}
						>
							<FontAwesome name="photo" size={18} color="#fff" style={{ marginRight: 8 }} />
							<Text style={styles.manualPickButtonText}>Select Media Manually</Text>
						</TouchableOpacity>
					)}
					<TouchableOpacity
						style={[styles.errorButton, styles.retryScanButton]}
						onPress={loadPhotos}
					>
						<Text style={styles.errorButtonText}>Try scanning again</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={[
							styles.errorButton,
							scanError && styles.errorButtonSecondary,
							scanError && isDark && styles.errorButtonSecondaryDark,
						]}
						onPress={handleSkip}
					>
						<Text style={[styles.errorButtonText, scanError && styles.errorButtonTextSecondary]}>
							Go Back
						</Text>
					</TouchableOpacity>
				</View>
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
								<FontAwesome name="times" size={22} color={isDark ? "#fff" : "#000"} />
							</TouchableOpacity>
						),
					}}
				/>
				<View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
					<View style={[styles.emptyContent, isDark && styles.statePanelDark]}>
						<View style={[styles.emptyIcon, isDark && styles.emptyIconDark]}>
							<FontAwesome name="camera" size={32} color={isDark ? "#888" : "#666"} />
						</View>
						<Text style={[styles.emptyTitle, isDark && styles.textDark]}>No Media Found</Text>
						<Text style={[styles.emptyText, isDark && styles.textMuted]}>
							We couldn't find any photos or videos from the event time window.
						</Text>
						<Text style={[styles.emptyHint, isDark && styles.textMuted]}>
							Select media manually or skip this for now.
						</Text>
						<TouchableOpacity
							style={styles.manualPickButton}
							onPress={handleManualPickFromRecovery}
						>
							<FontAwesome name="photo" size={18} color="#fff" style={{ marginRight: 8 }} />
							<Text style={styles.manualPickButtonText}>Select Media Manually</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={[styles.emptyButtonSecondary, isDark && styles.emptyButtonSecondaryDark]}
							onPress={handleSkip}
						>
							<Text style={[styles.emptyButtonSecondaryText, isDark && styles.textMuted]}>
								Go Back
							</Text>
						</TouchableOpacity>
					</View>
				</View>
			</>
		);
	}

	return (
		<>
			<Stack.Screen options={{ title: `Select Media (${selectedIds.size})` }} />

			<View
				style={[styles.container, isDark && styles.containerDark]}
				onLayout={(e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)}
			>
				<View style={[styles.selectHeader, isDark && styles.selectHeaderDark]}>
					<View>
						<Text style={[styles.headerKicker, isDark && styles.textMuted]}>Add Your Media</Text>
						<Text style={[styles.selectCount, isDark && styles.textMuted]}>{getCountText()}</Text>
						<Text style={[styles.selectionSummary, isDark && styles.textMuted]}>
							{getSelectionSummary()}
						</Text>
						{alreadyUploadedCount > 0 && (
							<Text style={[styles.uploadedCount, isDark && styles.textMuted]}>
								{alreadyUploadedCount} already uploaded
							</Text>
						)}
					</View>
					<View style={styles.selectActions}>
						<TouchableOpacity
							style={[styles.selectActionButton, isDark && styles.selectActionButtonDark]}
							onPress={selectAll}
						>
							<Text style={[styles.selectAction, isDark && styles.textDark]}>Select All</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={[styles.selectActionButton, isDark && styles.selectActionButtonDark]}
							onPress={deselectAll}
						>
							<Text style={[styles.selectAction, isDark && styles.textDark]}>Clear</Text>
						</TouchableOpacity>
						<TouchableOpacity
							onPress={handleManualPick}
							style={[styles.selectActionButton, isDark && styles.selectActionButtonDark]}
						>
							<FontAwesome name="plus" size={12} color={isDark ? "#fff" : "#111827"} />
							<Text style={[styles.selectAction, isDark && styles.textDark]}>Add Media</Text>
						</TouchableOpacity>
					</View>
				</View>

				<FlatList
					data={allPhotos}
					keyExtractor={(item) => item.id}
					numColumns={NUM_COLUMNS}
					initialNumToRender={15}
					maxToRenderPerBatch={9}
					windowSize={5}
					removeClippedSubviews
					renderItem={({ item, index }) => {
						const isSelected = selectedIds.has(item.id);
						const isUploaded = uploadedIds.has(item.id);
						const isVideo = item.mediaType === "video";
						return (
							<TouchableOpacity
								style={[styles.selectPhotoItem, { width: photoSize, height: photoSize }]}
								onPress={() => togglePhotoSelection(item.id)}
								onLongPress={() => setPreviewIndex(index)}
								delayLongPress={200}
								disabled={isUploaded}
							>
								{isVideo ? (
									<VideoThumbnail uri={item.uri} style={styles.selectPhotoImage} />
								) : (
									<ExpoImage
										source={{ uri: item.uri }}
										style={styles.selectPhotoImage}
										contentFit="cover"
										cachePolicy="memory-disk"
									/>
								)}
								{isVideo && (
									<View style={styles.videoIndicator}>
										<FontAwesome name="play-circle" size={28} color="#fff" />
										{item.duration > 0 && (
											<View style={styles.durationBadge}>
												<Text style={styles.durationText}>{formatDurationHms(item.duration)}</Text>
											</View>
										)}
									</View>
								)}
								{isUploaded ? (
									<View style={styles.uploadedOverlay}>
										<View style={styles.uploadedBadge}>
											<FontAwesome name="cloud" size={10} color="#fff" />
										</View>
									</View>
								) : (
									<View style={[styles.selectOverlay, isSelected && styles.selectOverlaySelected]}>
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
						style={[styles.uploadButton, selectedIds.size === 0 && styles.uploadButtonDisabled]}
						onPress={handleUpload}
						disabled={selectedIds.size === 0 || isQueueingUploads}
					>
						{isQueueingUploads ? (
							<ActivityIndicator size="small" color="#fff" style={styles.uploadIcon} />
						) : (
							<FontAwesome name="cloud-upload" size={20} color="#fff" style={styles.uploadIcon} />
						)}
						<Text style={styles.uploadButtonText}>
							{isQueueingUploads ? "Preparing uploads..." : getShareButtonText()}
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
		backgroundColor: "#f3f4f6",
	},
	containerDark: {
		backgroundColor: "#05070b",
	},
	centered: {
		justifyContent: "center",
		alignItems: "center",
		padding: 24,
	},
	statePanel: {
		width: "100%",
		maxWidth: 360,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		paddingHorizontal: 20,
		paddingVertical: 24,
		alignItems: "center",
	},
	statePanelDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	loadingText: {
		fontSize: 16,
		color: "#6b7280",
		marginTop: 16,
		fontWeight: "600",
	},
	loadingHint: {
		fontSize: 14,
		color: "#6b7280",
		marginTop: 8,
		textAlign: "center",
	},
	loadingActions: {
		marginTop: 24,
		width: "100%",
		alignItems: "center",
	},
	loadingSlowText: {
		fontSize: 14,
		color: "#6b7280",
		textAlign: "center",
		marginBottom: 16,
		maxWidth: 320,
	},
	errorTitle: {
		fontSize: 20,
		fontWeight: "700",
		color: "#111827",
		marginTop: 16,
		marginBottom: 8,
	},
	errorText: {
		fontSize: 16,
		color: "#6b7280",
		textAlign: "center",
		marginBottom: 24,
	},
	errorButton: {
		backgroundColor: "#111827",
		paddingVertical: 14,
		paddingHorizontal: 32,
		borderRadius: 999,
	},
	errorButtonText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "600",
	},
	errorButtonSecondary: {
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#d1d5db",
	},
	errorButtonSecondaryDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	errorButtonTextSecondary: {
		color: "#6b7280",
	},
	retryScanButton: {
		marginBottom: 12,
	},
	manualPickButton: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#111827",
		paddingVertical: 14,
		paddingHorizontal: 24,
		borderRadius: 999,
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
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		paddingVertical: 28,
	},
	emptyIcon: {
		width: 72,
		height: 72,
		borderRadius: 36,
		backgroundColor: "#f9fafb",
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 24,
		borderWidth: 1,
		borderColor: "#e5e7eb",
	},
	emptyIconDark: {
		backgroundColor: "#151821",
		borderColor: "#242833",
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
		color: "#6b7280",
		textAlign: "center",
		marginBottom: 8,
	},
	emptyHint: {
		fontSize: 14,
		color: "#6b7280",
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
		borderWidth: 1,
		borderColor: "#d1d5db",
		borderRadius: 999,
		backgroundColor: "#fff",
	},
	emptyButtonSecondaryDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	emptyButtonSecondaryText: {
		color: "#6b7280",
		fontSize: 15,
		fontWeight: "600",
	},
	selectHeader: {
		padding: 16,
		borderBottomWidth: 1,
		borderBottomColor: "#e5e7eb",
		backgroundColor: "#fff",
		gap: 12,
	},
	selectHeaderDark: {
		backgroundColor: "#0f1115",
		borderBottomColor: "#242833",
	},
	headerKicker: {
		fontSize: 11,
		fontWeight: "700",
		letterSpacing: 1.1,
		textTransform: "uppercase",
		color: "#6b7280",
		marginBottom: 4,
	},
	selectCount: {
		fontSize: 15,
		color: "#374151",
		fontWeight: "600",
	},
	selectionSummary: {
		fontSize: 12,
		color: "#6b7280",
		marginTop: 4,
	},
	selectActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		flexWrap: "wrap",
	},
	selectActionButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 10,
		paddingVertical: 8,
		borderRadius: 999,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#d1d5db",
	},
	selectActionButtonDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	selectAction: {
		fontSize: 13,
		color: "#111827",
		fontWeight: "600",
	},
	selectGrid: {
		padding: GRID_PADDING,
	},
	selectPhotoItem: {
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
		borderTopColor: "#e5e7eb",
	},
	selectFooterDark: {
		backgroundColor: "#0f1115",
		borderTopColor: "#242833",
	},
	uploadButton: {
		backgroundColor: "#111827",
		paddingVertical: 18,
		borderRadius: 999,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#111827",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.18,
		shadowRadius: 8,
		elevation: 8,
	},
	uploadButtonDisabled: {
		opacity: 0.5,
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
	videoIndicator: {
		...StyleSheet.absoluteFillObject,
		justifyContent: "center",
		alignItems: "center",
	},
	durationBadge: {
		position: "absolute",
		bottom: 4,
		right: 4,
		backgroundColor: "rgba(0, 0, 0, 0.7)",
		paddingHorizontal: 4,
		paddingVertical: 2,
		borderRadius: 3,
	},
	durationText: {
		color: "#fff",
		fontSize: 10,
		fontWeight: "600",
	},
});
