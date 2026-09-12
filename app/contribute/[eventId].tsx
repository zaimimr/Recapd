import Feather from "@expo/vector-icons/Feather";
import { Image as ExpoImage } from "expo-image";
import * as MediaLibrary from "expo-media-library";
import { useLocalSearchParams, useRouter } from "expo-router";
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	FlatList,
	type LayoutChangeEvent,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import SelectionPhotoViewer from "@/components/SelectionPhotoViewer";
import { Button, EmptyState, IconButton, NavBar, Screen } from "@/components/ui";
import { CONTENT_MAX_WIDTH, radius, space, theme, type } from "@/constants/theme";
import { checkDiskBudget, formatBytes } from "@/lib/diskSpace";
import { logger } from "@/lib/logger";
import {
	type LocalPhoto,
	pickMediaFromLibrary,
	requestMediaPermissions,
	resolveAssetFileSizes,
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
	assetId,
	style,
}: {
	uri: string;
	assetId?: string;
	style: object;
}) {
	const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;
		(async () => {
			let sourceUri = uri;
			if (uri.startsWith("ph://") && assetId) {
				try {
					const info = await MediaLibrary.getAssetInfoAsync(assetId, {
						shouldDownloadFromNetwork: false,
					});
					if (info?.localUri) sourceUri = info.localUri;
				} catch {}
			}
			const thumbUri = await createVideoThumbnailUri(sourceUri, 0).catch(() => null);
			if (mounted) setThumbnailUri(thumbUri);
		})();
		return () => {
			mounted = false;
		};
	}, [uri, assetId]);

	if (!thumbnailUri) {
		return <View style={[style, { backgroundColor: "#1a1a1a" }]} />;
	}

	return (
		<ExpoImage
			source={{ uri: thumbnailUri }}
			style={style}
			contentFit="cover"
			cachePolicy="disk"
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

	const passesDurationLimit = useCallback(
		(item: LocalPhoto) =>
			!(
				item.mediaType === "video" &&
				maxVideoDurationMilliseconds > 0 &&
				item.duration > maxVideoDurationMilliseconds
			),
		[maxVideoDurationMilliseconds]
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
		setPhotos([]);
		setSelectedIds(new Set());
		setUploadedIds(new Set());

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

			let streamedAny = false;

			const scanResult = await scanMediaInTimeRange(startTime, endTime, {
				limit: 1000,
				includeVideos: true,
				timeoutMs: 20000,
				paddingMs: 2 * 60 * 1000,
				onBatch: (batch) => {
					if (scanRequestIdRef.current !== requestId) return;
					const pageMedia = batch.filter(passesDurationLimit);
					if (pageMedia.length === 0) return;
					streamedAny = true;
					startTransition(() => {
						setPhotos((prev) => {
							const seen = new Set(prev.map((p) => p.id));
							const additions = pageMedia.filter((p) => !seen.has(p.id));
							return additions.length ? [...prev, ...additions] : prev;
						});
						setSelectedIds((prev) => {
							const next = new Set(prev);
							for (const p of pageMedia) next.add(p.id);
							return next;
						});
						setStep("select");
					});
				},
			});
			if (scanRequestIdRef.current !== requestId) {
				return;
			}

			if (scanResult.timedOut) {
				setShowSlowScanActions(true);
			}

			const scanned = scanResult.media.filter(passesDurationLimit);

			if (!streamedAny) {
				setStep(scanned.length > 0 ? "select" : "empty");
			}

			if (user && scanned.length > 0) {
				getUploadedPhotoIdsForEvent(eventId, user.id, scanned)
					.then((alreadyUploaded) => {
						if (scanRequestIdRef.current !== requestId || alreadyUploaded.size === 0) return;
						setUploadedIds(alreadyUploaded);
						setSelectedIds((prev) => {
							const next = new Set(prev);
							for (const id of alreadyUploaded) next.delete(id);
							return next;
						});
					})
					.catch(() => {});
			}

			if (maxFileSizeBytes > 0 && scanned.length > 0) {
				resolveAssetFileSizes(scanned)
					.then((sizes) => {
						if (scanRequestIdRef.current !== requestId || sizes.size === 0) return;
						const oversize = new Set<string>();
						for (const [id, size] of sizes) {
							if (size > maxFileSizeBytes) oversize.add(id);
						}
						setPhotos((prev) =>
							prev
								.map((p) => (sizes.has(p.id) ? { ...p, fileSize: sizes.get(p.id) } : p))
								.filter((p) => !oversize.has(p.id))
						);
						if (oversize.size > 0) {
							setSelectedIds((prev) => {
								const next = new Set(prev);
								for (const id of oversize) next.delete(id);
								return next;
							});
						}
					})
					.catch(() => {});
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
		eventId,
		currentEvent,
		fetchEventById,
		getUploadedPhotoIdsForEvent,
		passesDurationLimit,
		user,
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
			<Screen style={styles.centered}>
				<View style={styles.statePanel}>
					<ActivityIndicator size="large" color={theme.accent} />
					<Text style={styles.stateTitle}>Scanning your camera roll…</Text>
					<Text style={styles.stateBody}>
						We're checking the event window and preparing previews. Nothing is uploaded yet.
					</Text>
					{showSlowScanActions ? (
						<View style={styles.stateActions}>
							<Text style={styles.stateNote}>
								This is taking longer than usual. Keep waiting, pick media by hand, or skip for now.
							</Text>
							<Button
								label="Pick media myself"
								icon="image"
								onPress={handleManualPickFromRecovery}
							/>
							<Button label="Skip for now" variant="ghost" size="md" onPress={handleSkip} />
						</View>
					) : null}
				</View>
			</Screen>
		);
	}

	if (step === "error") {
		const errorTitle = permissionDenied
			? "Photo access is off"
			: scanError
				? "We couldn't scan your library"
				: "Something went wrong";
		const errorMessage = permissionDenied
			? "Recapd needs access to your photos to add them to the album. Turn it on in Settings."
			: scanError
				? "The automatic scan failed. You can still pick your media by hand."
				: "We couldn't load this album. Try again in a moment.";

		return (
			<Screen edges="both">
				<NavBar title="Add your photos" onBack={handleSkip} />
				<View style={styles.centered}>
					<EmptyState icon="alert-circle" title={errorTitle} body={errorMessage} />
					<View style={styles.stateActions}>
						{scanError ? (
							<Button
								label="Pick media myself"
								icon="image"
								onPress={handleManualPickFromRecovery}
							/>
						) : null}
						<Button
							label="Try scanning again"
							variant={scanError ? "secondary" : "primary"}
							onPress={loadPhotos}
						/>
						<Button label="Go back" variant="ghost" size="md" onPress={handleSkip} />
					</View>
				</View>
			</Screen>
		);
	}

	if (step === "empty") {
		return (
			<Screen edges="both">
				<NavBar title="Add your photos" onBack={handleSkip} />
				<View style={styles.centered}>
					<EmptyState
						icon="camera"
						title="Nothing from that night"
						body="We couldn't find photos or videos taken during the event window. You can still pick something by hand."
					/>
					<View style={styles.stateActions}>
						<Button label="Pick media myself" icon="image" onPress={handleManualPickFromRecovery} />
						<Button label="Go back" variant="ghost" size="md" onPress={handleSkip} />
					</View>
				</View>
			</Screen>
		);
	}

	return (
		<Screen edges="both">
			<NavBar
				title="Add your photos"
				subtitle={getCountText()}
				onBack={handleSkip}
				right={
					<IconButton icon="plus" accessibilityLabel="Pick more media" onPress={handleManualPick} />
				}
			/>

			<View
				style={styles.flex}
				onLayout={(e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)}
			>
				<View style={styles.selectBar}>
					<View style={styles.selectBarText}>
						<Text style={styles.selectSummary} numberOfLines={1}>
							{getSelectionSummary()}
						</Text>
						{alreadyUploadedCount > 0 ? (
							<Text style={styles.selectNote}>{alreadyUploadedCount} already in the album</Text>
						) : null}
					</View>
					<View style={styles.selectBarActions}>
						<Button label="All" size="sm" variant="secondary" full={false} onPress={selectAll} />
						<Button label="None" size="sm" variant="ghost" full={false} onPress={deselectAll} />
					</View>
				</View>

				<FlatList
					data={allPhotos}
					keyExtractor={(item) => item.id}
					numColumns={NUM_COLUMNS}
					initialNumToRender={18}
					maxToRenderPerBatch={12}
					windowSize={5}
					removeClippedSubviews
					showsVerticalScrollIndicator={false}
					getItemLayout={(_, index) => {
						const length = photoSize + GRID_GAP;
						return { length, offset: length * Math.floor(index / NUM_COLUMNS), index };
					}}
					renderItem={({ item, index }) => {
						const isSelected = selectedIds.has(item.id);
						const isUploaded = uploadedIds.has(item.id);
						const isVideo = item.mediaType === "video";
						return (
							<Pressable
								style={[styles.tile, { width: photoSize, height: photoSize }]}
								onPress={() => togglePhotoSelection(item.id)}
								onLongPress={() => setPreviewIndex(index)}
								delayLongPress={200}
								disabled={isUploaded}
								accessibilityRole="checkbox"
								accessibilityState={{ checked: isSelected, disabled: isUploaded }}
								accessibilityLabel={
									isUploaded
										? "Already in the album"
										: `${isVideo ? "Video" : "Photo"}, ${isSelected ? "selected" : "not selected"}`
								}
								accessibilityHint={isUploaded ? undefined : "Long press to preview"}
							>
								{isVideo ? (
									<VideoThumbnail uri={item.uri} assetId={item.id} style={styles.tileImage} />
								) : (
									<ExpoImage
										source={{ uri: item.uri }}
										style={styles.tileImage}
										contentFit="cover"
										cachePolicy="memory-disk"
										recyclingKey={item.id}
										allowDownscaling
										priority="low"
									/>
								)}

								{isVideo ? (
									<View style={styles.videoBadge}>
										<Feather name="play" size={9} color="#FFFFFF" />
										{item.duration > 0 ? (
											<Text style={styles.videoDuration}>{formatDurationHms(item.duration)}</Text>
										) : null}
									</View>
								) : null}

								{isUploaded ? (
									<View style={styles.uploadedOverlay}>
										<View style={styles.uploadedBadge}>
											<Feather name="check" size={11} color="#FFFFFF" />
										</View>
									</View>
								) : (
									<View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
										{isSelected ? <Feather name="check" size={13} color="#FFFFFF" /> : null}
									</View>
								)}
							</Pressable>
						);
					}}
					contentContainerStyle={styles.grid}
				/>

				<View style={styles.footer}>
					<Button
						label={isQueueingUploads ? "Preparing…" : getShareButtonText()}
						icon="upload-cloud"
						loading={isQueueingUploads}
						disabled={selectedIds.size === 0}
						onPress={handleUpload}
					/>
					<Text style={styles.footerNote}>
						Uploads keep going in the background, even with the app closed.
					</Text>
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
		</Screen>
	);
}

const styles = StyleSheet.create({
	flex: {
		flex: 1,
	},
	centered: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: space.xl,
		width: "100%",
		maxWidth: CONTENT_MAX_WIDTH,
		alignSelf: "center",
	},
	statePanel: {
		alignItems: "center",
		gap: space.md,
	},
	stateTitle: {
		...type.heading,
		color: theme.textPrimary,
		textAlign: "center",
		marginTop: space.sm,
	},
	stateBody: {
		...type.body,
		color: theme.textMuted,
		textAlign: "center",
		maxWidth: 300,
	},
	stateNote: {
		...type.callout,
		color: theme.textMuted,
		textAlign: "center",
		marginBottom: space.xs,
	},
	stateActions: {
		alignSelf: "stretch",
		gap: space.md,
		marginTop: space.lg,
	},

	selectBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.md,
		paddingHorizontal: space.lg,
		paddingBottom: space.md,
	},
	selectBarText: {
		flex: 1,
		gap: 2,
	},
	selectSummary: {
		...type.bodyStrong,
		color: theme.textPrimary,
	},
	selectNote: {
		...type.caption,
		fontWeight: "500",
		color: theme.textMuted,
	},
	selectBarActions: {
		flexDirection: "row",
		gap: space.sm,
	},

	grid: {
		paddingHorizontal: GRID_GAP,
		paddingBottom: space.md,
		gap: GRID_GAP,
	},
	tile: {
		margin: GRID_GAP / 2,
		borderRadius: radius.sm,
		overflow: "hidden",
		backgroundColor: theme.cardElevated,
	},
	tileImage: {
		width: "100%",
		height: "100%",
	},
	videoBadge: {
		position: "absolute",
		left: 5,
		bottom: 5,
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		paddingHorizontal: 6,
		paddingVertical: 3,
		borderRadius: radius.pill,
		backgroundColor: "rgba(0,0,0,0.62)",
	},
	videoDuration: {
		fontSize: 9,
		fontWeight: "700",
		color: "#FFFFFF",
	},
	checkbox: {
		position: "absolute",
		top: 6,
		right: 6,
		width: 22,
		height: 22,
		borderRadius: 11,
		borderWidth: 1.5,
		borderColor: "rgba(255,255,255,0.85)",
		backgroundColor: "rgba(0,0,0,0.28)",
		alignItems: "center",
		justifyContent: "center",
	},
	checkboxOn: {
		backgroundColor: theme.accent,
		borderColor: theme.accent,
	},
	uploadedOverlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(7,7,12,0.62)",
		alignItems: "center",
		justifyContent: "center",
	},
	uploadedBadge: {
		width: 24,
		height: 24,
		borderRadius: 12,
		backgroundColor: theme.success,
		alignItems: "center",
		justifyContent: "center",
	},

	footer: {
		width: "100%",
		maxWidth: CONTENT_MAX_WIDTH,
		alignSelf: "center",
		paddingHorizontal: space.lg,
		paddingTop: space.md,
		paddingBottom: space.md,
		gap: space.sm,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: theme.border,
		backgroundColor: theme.page,
	},
	footerNote: {
		...type.caption,
		fontWeight: "500",
		color: theme.textFaint,
		textAlign: "center",
	},
});
