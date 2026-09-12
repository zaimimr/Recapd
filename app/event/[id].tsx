import Feather from "@expo/vector-icons/Feather";
import { differenceInDays, differenceInHours, isPast } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	View,
} from "react-native";
import GuestSheet from "@/components/GuestSheet";
import MasonryGrid from "@/components/MasonryGrid";
import type { MergedMediaItem } from "@/components/MomentCluster";
import NotificationPromptModal from "@/components/NotificationPromptModal";
import ParticipantLimitBanner from "@/components/ParticipantLimitBanner";
import PhotoViewer from "@/components/PhotoViewer";
import {
	AvatarStack,
	Button,
	Card,
	EmptyState,
	Eyebrow,
	IconButton,
	NavBar,
	Pill,
	Screen,
	StatRow,
} from "@/components/ui";
import Gradient from "@/components/ui/Gradient";
import { radius, shadow, space, theme, type } from "@/constants/theme";
import { checkDiskBudget, formatBytes } from "@/lib/diskSpace";
import {
	DELETION_DELAY_DAYS,
	DELETION_DELAY_WINDOW_DAYS,
	delayEventDeletion,
} from "@/lib/eventDeletion";
import { getEventStatus } from "@/lib/eventStatus";
import { logger } from "@/lib/logger";
import { saveToLibrary } from "@/lib/mediaLibrary";
import { markNotificationPromptSeen, shouldShowNotificationPrompt } from "@/lib/notificationPrompt";
import { registerForPushNotifications, savePushToken } from "@/lib/notifications";
import {
	clearRecapdQueue,
	getRecapdQueueCounts,
	type RecapdQueueCounts,
} from "@/lib/recapdUploaderBridge";
import {
	classifyDownloadError,
	type DownloadFailureReason,
	deleteCachedDownload,
	describeDownloadFailure,
	downloadPhoto,
	getDownloadedPhotoIds,
	markPhotoDownloaded,
} from "@/lib/storage";
import { formatLocalizedDate, formatLocalizedTimeRange } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { buildMergedTimeline, type ParticipantWithStats, useEventStore } from "@/store/eventStore";

function UploadProgressBar({ eventId }: { eventId: string }) {
	const retryFailedUpload = useEventStore((state) => state.retryFailedUpload);
	const clearAllPendingUploads = useEventStore((state) => state.clearAllPendingUploads);
	const [counts, setCounts] = useState<RecapdQueueCounts | null>(null);
	const peakRef = useRef(0);

	const handleCancelAll = useCallback(() => {
		const outstandingNow = (counts?.remaining ?? 0) + (counts?.failed ?? 0);
		Alert.alert(
			"Cancel all uploads?",
			`This stops ${outstandingNow} pending upload${outstandingNow === 1 ? "" : "s"} across all events. Photos already uploaded are kept.`,
			[
				{ text: "Keep uploading", style: "cancel" },
				{
					text: "Cancel all",
					style: "destructive",
					onPress: () => {
						peakRef.current = 0;
						setCounts({ remaining: 0, failed: 0, failedIds: [], inFlightFraction: 0 });
						void clearRecapdQueue();
						void clearAllPendingUploads();
					},
				},
			]
		);
	}, [counts, clearAllPendingUploads]);

	useEffect(() => {
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const tick = async () => {
			const next = await getRecapdQueueCounts(eventId);
			if (cancelled) return;
			setCounts(next);
			timer = setTimeout(tick, 1200);
		};

		void tick();
		return () => {
			cancelled = true;
			if (timer) clearTimeout(timer);
		};
	}, [eventId]);

	const handleRetryAll = useCallback(() => {
		if (!counts) return;
		for (const id of counts.failedIds) retryFailedUpload(id);
	}, [counts, retryFailedUpload]);

	const outstanding = (counts?.remaining ?? 0) + (counts?.failed ?? 0);
	if (outstanding > peakRef.current) peakRef.current = outstanding;
	if (outstanding === 0 && peakRef.current !== 0) peakRef.current = 0;

	if (!counts || (counts.remaining === 0 && counts.failed === 0)) return null;

	const peak = peakRef.current;
	const done = Math.max(0, peak - outstanding);
	const fraction = peak > 0 ? Math.min(1, (done + counts.inFlightFraction) / peak) : 0;

	return (
		<View style={styles.uploadBar}>
			<View style={styles.uploadBarRow}>
				{counts.remaining > 0 ? (
					<Text style={styles.uploadBarText}>
						Uploading {done} of {peak}
					</Text>
				) : null}
				{counts.failed > 0 ? (
					<Text style={styles.uploadBarFailed}>{counts.failed} failed</Text>
				) : null}
				<View style={styles.uploadBarSpacer} />
				{counts.failed > 0 ? (
					<Button label="Retry" icon="refresh-cw" size="sm" full={false} onPress={handleRetryAll} />
				) : null}
				<Button
					label="Cancel all"
					variant="ghost"
					size="sm"
					full={false}
					onPress={handleCancelAll}
				/>
			</View>
			{counts.remaining > 0 ? (
				<View style={styles.uploadBarTrack}>
					<Gradient
						colors={theme.gradient}
						style={[styles.uploadBarFill, { width: `${Math.round(fraction * 100)}%` }]}
					/>
				</View>
			) : null}
		</View>
	);
}

export default function EventScreen() {
	const { id, justJoined } = useLocalSearchParams<{
		id: string;
		justJoined?: string;
	}>();
	const router = useRouter();
	const user = useAuthStore((state) => state.user);
	const {
		currentEvent,
		mediaItems,
		pendingUploads,
		isLoading,
		fetchEventById,
		fetchMediaItems,
		subscribeToMediaItems,
		subscribeToParticipants,
		subscribeToEvent,
		retryFailedUpload,
		skipPendingUpload,
		removePendingUpload,
		deletePhoto,
		fetchParticipantStats,
		markNoPhotosToUpload,
		getNoPhotosToUpload,
		leaveEvent,
		removeParticipant,
	} = useEventStore();

	const [viewerVisible, setViewerVisible] = useState(false);
	const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
	const [selectedThumbnailUri, setSelectedThumbnailUri] = useState<string | undefined>();
	const [downloadingAll, setDownloadingAll] = useState(false);
	const [downloadProgress, setDownloadProgress] = useState({
		current: 0,
		total: 0,
	});
	const [guestSheetVisible, setGuestSheetVisible] = useState(false);
	const [participants, setParticipants] = useState<ParticipantWithStats[]>([]);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [notificationPromptVisible, setNotificationPromptVisible] = useState(false);
	const [hasMarkedNoPhotos, setHasMarkedNoPhotos] = useState(false);
	const [markingNoPhotos, setMarkingNoPhotos] = useState(false);
	const [delayingDeletion, setDelayingDeletion] = useState(false);

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

	useEffect(() => {
		async function checkNoPhotosStatus() {
			if (id && user?.id) {
				const status = await getNoPhotosToUpload(id, user.id);
				setHasMarkedNoPhotos(status);
			}
		}
		checkNoPhotosStatus();
	}, [id, user?.id, getNoPhotosToUpload]);

	// Refresh participant stats when currentEvent participants change (real-time updates)
	useEffect(() => {
		if (id && currentEvent?.participants) {
			const currentEventId = id;
			fetchParticipantStats(id).then((stats) => {
				if (currentEventId === id) {
					setParticipants(stats);
				}
			});
		}
	}, [id, fetchParticipantStats, currentEvent?.participants]);

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

	const mergedPhotos = useMemo(
		() => (id ? buildMergedTimeline(mediaItems, pendingUploads, id) : []),
		[id, mediaItems, pendingUploads]
	);

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		await loadData();
		setIsRefreshing(false);
	}, [loadData]);

	function handlePhotoPress(photo: MergedMediaItem, index: number) {
		const thumbnailUri = photo.isPending
			? photo.media_type === "video"
				? photo.localThumbnailUri || undefined
				: photo.localUri || undefined
			: undefined;
		setSelectedThumbnailUri(thumbnailUri);
		setSelectedPhotoIndex(index);
		setViewerVisible(true);
	}

	function handleCloseViewer() {
		setViewerVisible(false);
		setSelectedThumbnailUri(undefined);
	}

	const handleDeletePhoto = useCallback(
		async (photoId: string): Promise<boolean> => {
			if (!id) return false;
			return deletePhoto(photoId, id);
		},
		[id, deletePhoto]
	);

	function handleOpenGuestSheet() {
		setGuestSheetVisible(true);
	}

	function handleContribute() {
		router.push(`/contribute/${id}`);
	}

	function handleShare() {
		router.push(`/event/share/${id}`);
	}

	function handleDelayDeletion() {
		if (delayingDeletion) return;
		Alert.alert(
			"Delay deletion?",
			`This pushes the deletion date back ${DELETION_DELAY_DAYS} days and notifies everyone to download their photos. You can only do this once.`,
			[
				{ text: "Not now", style: "cancel" },
				{
					text: `Delay ${DELETION_DELAY_DAYS} days`,
					onPress: async () => {
						setDelayingDeletion(true);
						const result = await delayEventDeletion(id);
						setDelayingDeletion(false);

						if (result.ok) {
							await fetchEventById(id);
							Alert.alert(
								"Deletion delayed",
								`Photos now stay ${DELETION_DELAY_DAYS} more days. Everyone has been reminded to download.`
							);
							return;
						}

						const message =
							result.reason === "already_delayed"
								? "This event's deletion has already been delayed once."
								: result.reason === "too_early"
									? `You can only delay within ${DELETION_DELAY_WINDOW_DAYS} days of deletion.`
									: result.reason === "unauthorized"
										? "Only the event host can delay deletion."
										: result.reason === "event_inactive"
											? "This event is no longer active."
											: "Something went wrong. Please try again.";
						Alert.alert("Couldn't delay deletion", message);
					},
				},
			]
		);
	}

	async function handleDownloadAll() {
		if (mediaItems.length === 0 || downloadingAll) return;

		setDownloadingAll(true);

		// Only download media from other users (not my own uploads)
		const othersMedia = mediaItems.filter((p) => p.uploaded_by_user_id !== user?.id);

		if (othersMedia.length === 0) {
			setDownloadingAll(false);
			Alert.alert("No Media to Download", "There is no media from other guests to download");
			return;
		}

		const downloadedIds = await getDownloadedPhotoIds();
		const mediaToDownload = othersMedia.filter((p) => !downloadedIds.has(p.id));
		const skippedCount = othersMedia.length - mediaToDownload.length;

		if (mediaToDownload.length === 0) {
			setDownloadingAll(false);
			Alert.alert(
				"Already Downloaded",
				`All ${othersMedia.length} media items from other guests are already in your camera roll`
			);
			return;
		}

		const estimatedBytes = mediaToDownload.reduce((sum, p) => sum + (p.file_size_bytes ?? 0), 0);
		if (estimatedBytes > 0) {
			const budget = await checkDiskBudget(estimatedBytes);
			if (!budget.ok) {
				setDownloadingAll(false);
				Alert.alert(
					"Storage Full",
					`Saving these needs about ${formatBytes(budget.requiredBytes)}, but only ${formatBytes(
						budget.freeBytes
					)} is free. Free up some space, then try again.`
				);
				return;
			}
		}

		setDownloadProgress({ current: 0, total: mediaToDownload.length });

		let successCount = 0;
		let failureCount = 0;
		const failureReasons = new Set<DownloadFailureReason>();
		let outOfSpace = false;

		for (let i = 0; i < mediaToDownload.length; i++) {
			const media = mediaToDownload[i];
			setDownloadProgress({ current: i + 1, total: mediaToDownload.length });

			try {
				const extension = media.media_type === "video" ? "mp4" : "jpg";
				const localUri = await downloadPhoto(media.storage_path, `recapd_${media.id}.${extension}`);
				try {
					const asset = await saveToLibrary(localUri);
					if (asset) {
						await markPhotoDownloaded(media.id);
						successCount++;
					} else {
						failureCount++;
						failureReasons.add("unknown");
					}
				} finally {
					await deleteCachedDownload(localUri);
				}
			} catch (error) {
				failureCount++;
				const reason = classifyDownloadError(error);
				failureReasons.add(reason);
				if (reason === "out_of_space") {
					outOfSpace = true;
					break;
				}
				logger.error(`Failed to download media ${media.id}`, error, {
					eventId: id,
					mediaId: media.id,
				});
			}
		}

		setDownloadingAll(false);

		const remaining = mediaToDownload.length - successCount;
		const savedLine =
			skippedCount > 0
				? `Saved ${successCount} new media items. ${skippedCount} already in your camera roll.`
				: `Saved ${successCount} of ${mediaToDownload.length} media items to your camera roll.`;

		if (failureCount === 0) {
			Alert.alert("Download Complete", savedLine);
			return;
		}

		const primaryReason: DownloadFailureReason = outOfSpace
			? "out_of_space"
			: failureReasons.has("network")
				? "network"
				: failureReasons.has("server")
					? "server"
					: "unknown";

		const title = outOfSpace ? "Storage Full" : "Download Incomplete";
		const failLine = outOfSpace
			? `${describeDownloadFailure("out_of_space")} ${remaining} item${remaining === 1 ? "" : "s"} still need saving.`
			: `${remaining} item${remaining === 1 ? "" : "s"} didn't save. ${describeDownloadFailure(primaryReason)}`;

		Alert.alert(title, `${savedLine}\n\n${failLine}`);
	}

	async function handleSkipUpload(idToSkip: string) {
		Alert.alert(
			"Skip Upload?",
			"This keeps the item out of the feed for now. You can add it again later from your library.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Skip",
					style: "destructive",
					onPress: () => {
						void skipPendingUpload(idToSkip);
					},
				},
			]
		);
	}

	function handleRemoveUpload(idToRemove: string) {
		Alert.alert(
			"Remove Upload?",
			"This will remove the item from your feed and stop trying to upload it.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Remove",
					style: "destructive",
					onPress: () => {
						void removePendingUpload(idToRemove);
					},
				},
			]
		);
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

	async function handleNoPhotosToShare() {
		if (!id || !user?.id || markingNoPhotos) return;

		setMarkingNoPhotos(true);
		const success = await markNoPhotosToUpload(id, user.id);
		setMarkingNoPhotos(false);

		if (success) {
			setHasMarkedNoPhotos(true);
		} else {
			Alert.alert("Error", "Failed to save your preference. Please try again.");
		}
	}

	function handleRemoveParticipant(targetUserId: string, displayName: string) {
		Alert.alert(`Remove ${displayName}?`, "They will no longer be part of this event.", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Remove",
				style: "destructive",
				onPress: async () => {
					if (!id || !user?.id) return;
					const success = await removeParticipant(id, targetUserId, user.id);
					if (success) {
						const stats = await fetchParticipantStats(id);
						setParticipants(stats);
					}
				},
			},
		]);
	}

	function handleLeaveEvent() {
		if (!id || !user?.id) return;

		const hostCount = participants.filter((p) => p.role === "host").length;
		if (hostCount <= 1 && participants.some((p) => p.userId === user.id && p.role === "host")) {
			Alert.alert("Can't Leave", "You're the only host. You must delete the event to leave.");
			return;
		}

		Alert.alert("Leave Event?", "You will no longer have access to this event's media.", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Leave",
				style: "destructive",
				onPress: async () => {
					const result = await leaveEvent(id, user.id);
					if (result.success) {
						router.replace("/(tabs)/events");
					} else if (result.isLastHost) {
						Alert.alert("Can't Leave", "You're the only host. You must delete the event to leave.");
					}
				},
			},
		]);
	}

	if (isLoading && !currentEvent) {
		return (
			<Screen style={styles.centered}>
				<ActivityIndicator size="large" color={theme.accent} />
			</Screen>
		);
	}

	if (!currentEvent) {
		return (
			<Screen>
				<NavBar onBack={() => router.replace("/(tabs)/events")} />
				<EmptyState
					icon="alert-circle"
					title="Album not found"
					body="It may have expired, or the link was wrong."
					action={
						<Button label="Back to my albums" onPress={() => router.replace("/(tabs)/events")} />
					}
				/>
			</Screen>
		);
	}

	const isEnded = isPast(new Date(currentEvent.ends_at));
	const daysUntilExpiry = differenceInDays(new Date(currentEvent.expires_at), new Date());
	const hoursUntilExpiry = differenceInHours(new Date(currentEvent.expires_at), new Date());
	const _expiryProgress = isEnded
		? Math.max(0, Math.min(100, ((14 - daysUntilExpiry) / 14) * 100))
		: 0;
	const isHost = currentEvent.participants?.some(
		(p) => p.user_id === user?.id && p.role === "host"
	);
	const canDelayDeletion =
		isHost &&
		!currentEvent.deletion_delayed_at &&
		daysUntilExpiry > 0 &&
		daysUntilExpiry <= DELETION_DELAY_WINDOW_DAYS;
	const myMediaCount = mergedPhotos.filter((p) => p.uploaded_by_user_id === user?.id).length;

	const status = getEventStatus(currentEvent);
	const uploaded = mergedPhotos.filter((p) => !p.isPending);
	const photoCount = uploaded.filter((p) => p.media_type !== "video").length;
	const videoCount = uploaded.filter((p) => p.media_type === "video").length;
	const guestNames = (currentEvent.participants ?? [])
		.map((p) => p.nickname || "")
		.filter((name) => name.length > 0);

	return (
		<Screen>
			<NavBar
				title={currentEvent.title}
				subtitle={`${formatLocalizedDate(currentEvent.starts_at, {
					month: "short",
					day: "numeric",
				})} · ${formatLocalizedTimeRange(currentEvent.starts_at, currentEvent.ends_at)}`}
				onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/events"))}
				right={
					<>
						{isHost ? (
							<IconButton
								icon="edit-2"
								accessibilityLabel="Edit album"
								onPress={() => router.push(`/event/edit/${id}`)}
							/>
						) : null}
						<IconButton icon="share" accessibilityLabel="Invite guests" onPress={handleShare} />
					</>
				}
			/>

			<MasonryGrid
				photos={mergedPhotos}
				onPhotoPress={handlePhotoPress}
				onRetry={retryFailedUpload}
				onSkip={handleSkipUpload}
				onRemove={handleRemoveUpload}
				isDark
				refreshControl={
					<RefreshControl
						refreshing={isRefreshing}
						onRefresh={handleRefresh}
						tintColor={theme.accent}
						colors={[theme.accent]}
					/>
				}
				emptyComponent={
					<EmptyState
						icon="camera"
						title="Nothing here yet"
						body="Be the first to drop a photo in and kick the album off."
						action={<Button label="Add your photos" icon="plus" onPress={handleContribute} />}
					/>
				}
				headerComponent={
					<View style={styles.header}>
						<Card>
							<View style={styles.cardTop}>
								<Eyebrow>Event album</Eyebrow>
								<Pill label={status.label} tone={status.tone} dot={status.dot} />
							</View>

							<Text style={styles.albumTitle} numberOfLines={2}>
								{currentEvent.title}
							</Text>

							<Pressable
								onPress={handleOpenGuestSheet}
								accessibilityRole="button"
								accessibilityLabel={`${currentEvent.participant_count || 0} guests`}
								accessibilityHint="Opens the guest list"
								style={({ pressed }) => [styles.guestRow, pressed && { opacity: 0.7 }]}
							>
								{guestNames.length > 0 ? <AvatarStack names={guestNames} size={22} /> : null}
								<Text style={styles.guestText}>
									{currentEvent.participant_count || 0}{" "}
									{currentEvent.participant_count === 1 ? "guest" : "guests"}
									{status.key === "live" ? " adding photos" : ""}
								</Text>
								<Feather name="chevron-right" size={14} color={theme.textDisabled} />
							</Pressable>

							<StatRow
								items={[
									{ value: photoCount.toLocaleString(), label: "Photos" },
									{ value: videoCount.toLocaleString(), label: "Videos" },
									{ value: currentEvent.participant_count || 0, label: "Guests" },
								]}
							/>

							<Button
								label="Add your photos"
								icon="plus"
								onPress={handleContribute}
								style={styles.primaryAction}
							/>

							{mediaItems.length > 0 ? (
								<Button
									label={
										downloadingAll
											? `Saving ${downloadProgress.current} of ${downloadProgress.total}`
											: "Save all to camera roll"
									}
									icon="download"
									variant="secondary"
									loading={downloadingAll}
									onPress={handleDownloadAll}
									style={styles.secondaryAction}
								/>
							) : null}
						</Card>

						{isEnded && daysUntilExpiry > 0 ? (
							<Card accent style={styles.expiryCard}>
								<View style={styles.expiryRow}>
									<View style={styles.expiryIcon}>
										<Feather name="clock" size={17} color={theme.accentSoft} />
									</View>
									<View style={styles.expiryText}>
										<Text style={styles.expiryTitle}>
											{daysUntilExpiry <= 1
												? `${hoursUntilExpiry} hours left to download`
												: `${daysUntilExpiry} days left to download`}
										</Text>
										<Text style={styles.expiryBody}>
											The album closes and wipes itself when the timer runs out.
										</Text>
									</View>
								</View>
								{canDelayDeletion ? (
									<Button
										label={`Give everyone ${DELETION_DELAY_DAYS} more days`}
										icon="calendar"
										variant="secondary"
										size="md"
										loading={delayingDeletion}
										onPress={handleDelayDeletion}
										style={styles.expiryAction}
									/>
								) : null}
							</Card>
						) : null}

						<ParticipantLimitBanner
							participantCount={currentEvent.participant_count || 0}
							hostIsPro={currentEvent.hostIsPro || false}
							isHost={isHost || false}
							isDark
						/>

						{isEnded && myMediaCount === 0 && !hasMarkedNoPhotos ? (
							<Button
								label="I don't have media to share"
								icon="check"
								variant="ghost"
								size="md"
								loading={markingNoPhotos}
								onPress={handleNoPhotosToShare}
							/>
						) : null}

						{isEnded && myMediaCount === 0 && hasMarkedNoPhotos ? (
							<View style={styles.noPhotos}>
								<Feather name="check-circle" size={15} color={theme.success} />
								<Text style={styles.noPhotosText}>
									Thanks. We won't remind you about this album.
								</Text>
							</View>
						) : null}

						{mergedPhotos.length > 0 ? (
							<View style={styles.feedHeader}>
								<Eyebrow>The feed</Eyebrow>
								<Pill label={`${mergedPhotos.length} items`} />
							</View>
						) : null}
					</View>
				}
			/>

			<PhotoViewer
				photos={mergedPhotos}
				initialIndex={selectedPhotoIndex}
				visible={viewerVisible}
				onClose={handleCloseViewer}
				onDelete={handleDeletePhoto}
				currentUserId={user?.id}
				isDark
				initialThumbnailUri={selectedThumbnailUri}
			/>

			<GuestSheet
				visible={guestSheetVisible}
				onClose={() => setGuestSheetVisible(false)}
				participants={participants}
				isDark
				isHost={isHost || false}
				currentUserId={user?.id || ""}
				eventId={id}
				onRemoveParticipant={handleRemoveParticipant}
				onLeaveEvent={handleLeaveEvent}
			/>

			<NotificationPromptModal
				visible={notificationPromptVisible}
				onEnable={handleEnableNotifications}
				onMaybeLater={handleMaybeLater}
				isDark
			/>

			{id ? <UploadProgressBar eventId={id} /> : null}
		</Screen>
	);
}

const styles = StyleSheet.create({
	centered: {
		alignItems: "center",
		justifyContent: "center",
	},
	header: {
		paddingHorizontal: space.lg,
		paddingBottom: space.lg,
		gap: space.md,
	},
	cardTop: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: space.sm,
	},
	albumTitle: {
		...type.title,
		fontSize: 26,
		lineHeight: 30,
		color: theme.textPrimary,
	},
	guestRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.sm,
		marginTop: 6,
		marginBottom: space.lg,
	},
	guestText: {
		...type.callout,
		color: theme.textMuted,
		flex: 1,
	},
	primaryAction: {
		marginTop: space.lg,
	},
	secondaryAction: {
		marginTop: space.sm,
	},

	expiryCard: {
		gap: space.md,
	},
	expiryRow: {
		flexDirection: "row",
		gap: space.md,
		alignItems: "flex-start",
	},
	expiryIcon: {
		width: 38,
		height: 38,
		borderRadius: radius.md,
		backgroundColor: theme.accentSurface,
		alignItems: "center",
		justifyContent: "center",
	},
	expiryText: {
		flex: 1,
		gap: 3,
	},
	expiryTitle: {
		...type.bodyStrong,
		color: theme.textPrimary,
	},
	expiryBody: {
		...type.caption,
		fontWeight: "500",
		color: theme.textMuted,
	},
	expiryAction: {
		marginTop: space.xs,
	},

	noPhotos: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.sm,
		paddingVertical: space.md,
		paddingHorizontal: space.lg,
		borderRadius: radius.lg,
		backgroundColor: theme.successSurface,
	},
	noPhotosText: {
		...type.callout,
		color: theme.textMuted,
		flex: 1,
	},

	feedHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginTop: space.sm,
	},

	uploadBar: {
		position: "absolute",
		left: space.md,
		right: space.md,
		bottom: space.xl,
		backgroundColor: theme.cardElevated,
		borderRadius: radius.lg,
		borderWidth: 1,
		borderColor: theme.accentBorder,
		paddingHorizontal: space.lg,
		paddingVertical: space.md,
		gap: space.md,
		...shadow.card,
	},
	uploadBarRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.sm,
	},
	uploadBarText: {
		...type.caption,
		fontWeight: "700",
		color: theme.textPrimary,
	},
	uploadBarFailed: {
		...type.caption,
		fontWeight: "700",
		color: theme.danger,
	},
	uploadBarSpacer: {
		flex: 1,
	},
	uploadBarTrack: {
		height: 6,
		borderRadius: 3,
		backgroundColor: "rgba(255,255,255,0.10)",
		overflow: "hidden",
	},
	uploadBarFill: {
		height: "100%",
		borderRadius: 3,
	},
});
