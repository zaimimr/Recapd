import FontAwesome from "@expo/vector-icons/FontAwesome";
import { differenceInDays, differenceInHours, isPast } from "date-fns";
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
import GuestSheet from "@/components/GuestSheet";
import MasonryGrid from "@/components/MasonryGrid";
import type { MergedMediaItem } from "@/components/MomentCluster";
import NotificationPromptModal from "@/components/NotificationPromptModal";
import ParticipantLimitBanner from "@/components/ParticipantLimitBanner";
import PhotoViewer from "@/components/PhotoViewer";
import { useColorScheme } from "@/components/useColorScheme";
import { logger } from "@/lib/logger";
import { saveToLibrary } from "@/lib/mediaLibrary";
import { markNotificationPromptSeen, shouldShowNotificationPrompt } from "@/lib/notificationPrompt";
import { registerForPushNotifications, savePushToken } from "@/lib/notifications";
import { downloadPhoto, getDownloadedPhotoIds, markPhotoDownloaded } from "@/lib/storage";
import { formatLocalizedDate, formatLocalizedTimeRange } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { type ParticipantWithStats, useEventStore } from "@/store/eventStore";

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
		isLoading,
		fetchEventById,
		fetchMediaItems,
		subscribeToMediaItems,
		subscribeToParticipants,
		subscribeToEvent,
		getMergedTimeline,
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
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";

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

	const mergedPhotos = id ? getMergedTimeline(id) : [];

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

		setDownloadProgress({ current: 0, total: mediaToDownload.length });

		let successCount = 0;
		for (let i = 0; i < mediaToDownload.length; i++) {
			const media = mediaToDownload[i];
			setDownloadProgress({ current: i + 1, total: mediaToDownload.length });

			try {
				const extension = media.media_type === "video" ? "mp4" : "jpg";
				const localUri = await downloadPhoto(media.storage_path, `recapd_${media.id}.${extension}`);
				if (localUri) {
					const asset = await saveToLibrary(localUri);
					if (asset) {
						await markPhotoDownloaded(media.id);
						successCount++;
					}
				}
			} catch (error) {
				logger.error(`Failed to download media ${media.id}`, error, {
					eventId: id,
					mediaId: media.id,
				});
			}
		}

		setDownloadingAll(false);

		const message =
			skippedCount > 0
				? `Saved ${successCount} new media items. ${skippedCount} already in your camera roll.`
				: `Saved ${successCount} of ${mediaToDownload.length} media items to your camera roll`;

		Alert.alert("Download Complete", message);
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
			<View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
				<ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
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
	const hoursUntilExpiry = differenceInHours(new Date(currentEvent.expires_at), new Date());
	const _expiryProgress = isEnded
		? Math.max(0, Math.min(100, ((14 - daysUntilExpiry) / 14) * 100))
		: 0;
	const isHost = currentEvent.participants?.some(
		(p) => p.user_id === user?.id && p.role === "host"
	);
	const myMediaCount = mergedPhotos.filter((p) => p.uploaded_by_user_id === user?.id).length;

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
					headerBackVisible: false,
					headerLeft: () => (
						<TouchableOpacity
							onPress={() =>
								router.canGoBack() ? router.back() : router.replace("/(tabs)/events")
							}
							style={styles.headerButton}
						>
							<FontAwesome name="angle-left" size={28} color={isDark ? "#fff" : "#000"} />
						</TouchableOpacity>
					),
					headerRight: () => (
						<View style={styles.headerRight}>
							{isHost && (
								<TouchableOpacity
									onPress={() => router.push(`/event/edit/${id}`)}
									style={styles.headerButton}
								>
									<FontAwesome name="pencil" size={18} color={isDark ? "#fff" : "#000"} />
								</TouchableOpacity>
							)}
							<TouchableOpacity onPress={handleShare} style={styles.headerButton}>
								<FontAwesome name="share-alt" size={20} color={isDark ? "#fff" : "#000"} />
							</TouchableOpacity>
						</View>
					),
				}}
			/>

			<View style={[styles.container, isDark && styles.containerDark]}>
				<ScrollView
					contentContainerStyle={styles.scrollContent}
					refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
				>
					<View style={styles.header}>
						<View style={styles.eventInfo}>
							<Text style={[styles.sectionEyebrow, isDark && styles.textMuted]}>Event</Text>
							<Text style={[styles.eventDate, isDark && styles.textDark]}>
								{formatLocalizedDate(currentEvent.starts_at, {
									weekday: "long",
									month: "long",
									day: "numeric",
									year: "numeric",
								})}
							</Text>
							<Text style={[styles.eventTime, isDark && styles.textMuted]}>
								{formatLocalizedTimeRange(currentEvent.starts_at, currentEvent.ends_at)}
							</Text>
						</View>

						{isEnded && daysUntilExpiry > 0 && (
							<View style={[styles.expiryBanner, isDark && styles.expiryBannerDark]}>
								<View style={[styles.expiryIconContainer, { backgroundColor: getExpiryColor() }]}>
									<FontAwesome name="clock-o" size={16} color="#fff" />
								</View>
								<View style={styles.expiryContent}>
									<Text style={[styles.expiryLabel, isDark && styles.textMuted]}>
										Media expire in
									</Text>
									<Text style={[styles.expiryValue, { color: getExpiryColor() }]}>
										{daysUntilExpiry <= 1 ? `${hoursUntilExpiry} hours` : `${daysUntilExpiry} days`}
									</Text>
								</View>
							</View>
						)}

						<View style={[styles.stats, isDark && styles.statsDark]}>
							<View style={styles.stat}>
								<Text style={[styles.statValue, isDark && styles.textDark]}>
									{mergedPhotos.filter((p) => p.syncStatus !== "failed").length}
								</Text>
								<Text style={[styles.statLabel, isDark && styles.textMuted]}>Media</Text>
							</View>
							<View style={[styles.statDivider, isDark && styles.statDividerDark]} />
							<TouchableOpacity style={styles.stat} onPress={handleOpenGuestSheet}>
								<Text style={[styles.statValue, isDark && styles.textDark]}>
									{currentEvent.participant_count || 0}
								</Text>
								<Text style={[styles.statLabel, isDark && styles.textMuted]}>Guests</Text>
							</TouchableOpacity>
						</View>

						<ParticipantLimitBanner
							participantCount={currentEvent.participant_count || 0}
							hostIsPro={currentEvent.hostIsPro || false}
							isHost={isHost || false}
							isDark={isDark}
						/>

						<View style={styles.actionStack}>
							<TouchableOpacity
								style={[
									styles.secondaryActionButton,
									styles.remindButton,
									isDark && styles.remindButtonDark,
								]}
								onPress={handleContribute}
							>
								<FontAwesome name="plus" size={16} color={isDark ? "#0a0d12" : "#fff"} />
								<Text
									style={[styles.contributeButtonText, isDark && styles.contributeButtonTextDark]}
								>
									Add Your Media
								</Text>
							</TouchableOpacity>

							{mediaItems.length > 0 ? (
								<View style={styles.secondaryActionRow}>
									{mediaItems.length > 0 && (
										<TouchableOpacity
											style={[
												styles.secondaryActionButton,
												isDark && styles.secondaryActionButtonDark,
											]}
											onPress={handleDownloadAll}
											disabled={downloadingAll}
										>
											{downloadingAll ? (
												<>
													<ActivityIndicator size="small" color={isDark ? "#fff" : "#111827"} />
													<Text
														style={[styles.secondaryActionText, isDark && styles.textDark]}
														numberOfLines={1}
													>
														{downloadProgress.current}/{downloadProgress.total}
													</Text>
												</>
											) : (
												<>
													<FontAwesome
														name="download"
														size={15}
														color={isDark ? "#fff" : "#111827"}
													/>
													<Text style={[styles.secondaryActionText, isDark && styles.textDark]}>
														Download All
													</Text>
												</>
											)}
										</TouchableOpacity>
									)}
								</View>
							) : null}

							{isEnded && myMediaCount === 0 && !hasMarkedNoPhotos && (
								<TouchableOpacity
									style={[styles.noPhotosButton, isDark && styles.noPhotosButtonDark]}
									onPress={handleNoPhotosToShare}
									disabled={markingNoPhotos}
								>
									{markingNoPhotos ? (
										<ActivityIndicator size="small" color={isDark ? "#d1d5db" : "#374151"} />
									) : (
										<FontAwesome name="check" size={14} color={isDark ? "#d1d5db" : "#374151"} />
									)}
									<Text style={[styles.noPhotosButtonText, isDark && styles.textMuted]}>
										I don't have media to share
									</Text>
								</TouchableOpacity>
							)}

							{isEnded && myMediaCount === 0 && hasMarkedNoPhotos && (
								<View
									style={[styles.noPhotosConfirmation, isDark && styles.noPhotosConfirmationDark]}
								>
									<FontAwesome name="check-circle" size={16} color="#22c55e" />
									<Text style={[styles.noPhotosConfirmationText, isDark && styles.textMuted]}>
										Thanks! We won't remind you about this event.
									</Text>
								</View>
							)}
						</View>

						{mergedPhotos.length > 0 && (
							<View style={styles.sectionHeader}>
								<Text style={[styles.sectionEyebrow, isDark && styles.textMuted]}>Feed</Text>
								<Text style={[styles.timelineTitle, isDark && styles.textDark]}>
									Everyone's media
								</Text>
							</View>
						)}
					</View>

					{mergedPhotos.length === 0 ? (
						<View style={[styles.emptyState, isDark && styles.panelDark]}>
							<FontAwesome name="camera" size={48} color={isDark ? "#444" : "#ccc"} />
							<Text style={[styles.emptyTitle, isDark && styles.textDark]}>No media yet</Text>
							<Text style={[styles.emptyText, isDark && styles.textMuted]}>
								Photos and videos appear here as guests share them.
							</Text>
						</View>
					) : (
						<MasonryGrid
							photos={mergedPhotos}
							onPhotoPress={handlePhotoPress}
							onRetry={retryFailedUpload}
							onSkip={handleSkipUpload}
							onRemove={handleRemoveUpload}
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
					isDark={isDark}
				/>
			</View>
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
	},
	scrollContent: {
		paddingTop: 18,
		paddingBottom: 28,
	},
	headerRight: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	headerButton: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
	},
	header: {
		marginBottom: 16,
		paddingHorizontal: 16,
		gap: 12,
	},
	eventInfo: {
		gap: 3,
	},
	panelDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	sectionEyebrow: {
		fontSize: 11,
		fontWeight: "700",
		letterSpacing: 1.2,
		textTransform: "uppercase",
		color: "#6b7280",
	},
	eventDate: {
		fontSize: 24,
		fontWeight: "700",
		color: "#111827",
		letterSpacing: -0.8,
	},
	eventTime: {
		fontSize: 14,
		color: "#6b7280",
		fontWeight: "500",
	},
	expiryBanner: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#fff",
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderWidth: 1,
		borderColor: "#e5e7eb",
		gap: 12,
	},
	expiryBannerDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	expiryIconContainer: {
		width: 36,
		height: 36,
		borderRadius: 999,
		justifyContent: "center",
		alignItems: "center",
	},
	expiryContent: {
		flex: 1,
	},
	expiryLabel: {
		fontSize: 12,
		color: "#6b7280",
		marginBottom: 2,
		textTransform: "uppercase",
		letterSpacing: 0.8,
	},
	expiryValue: {
		fontSize: 16,
		fontWeight: "700",
	},
	stats: {
		flexDirection: "row",
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	statsDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	stat: {
		flex: 1,
		alignItems: "center",
		paddingVertical: 2,
	},
	statDivider: {
		width: 1,
		backgroundColor: "#e5e7eb",
		marginHorizontal: 16,
	},
	statDividerDark: {
		backgroundColor: "#242833",
	},
	statValue: {
		fontSize: 26,
		fontWeight: "700",
		color: "#111827",
	},
	statLabel: {
		fontSize: 11,
		color: "#6b7280",
		marginTop: 5,
		textTransform: "uppercase",
		letterSpacing: 1,
	},
	actionStack: {
		gap: 10,
	},
	contributeButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#111827",
		paddingVertical: 14,
		borderRadius: 999,
		gap: 8,
	},
	contributeButtonText: {
		color: "#fff",
		fontSize: 15,
		fontWeight: "600",
	},
	contributeButtonTextDark: {
		color: "#0a0d12",
	},
	secondaryActionRow: {
		flexDirection: "row",
		gap: 10,
	},
	secondaryActionButton: {
		flex: 1,
		minHeight: 48,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#d1d5db",
		borderRadius: 999,
		gap: 8,
		paddingHorizontal: 12,
	},
	secondaryActionButtonDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	secondaryActionText: {
		color: "#111827",
		fontSize: 14,
		fontWeight: "600",
	},
	remindButton: {
		backgroundColor: "#111827",
		borderColor: "#111827",
	},
	remindButtonDark: {
		backgroundColor: "#ffffff",
		borderColor: "#ffffff",
	},
	remindButtonText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "600",
	},
	timelineTitle: {
		fontSize: 20,
		fontWeight: "700",
		color: "#111827",
		letterSpacing: -0.5,
	},
	sectionHeader: {
		paddingTop: 2,
		gap: 2,
	},
	emptyState: {
		alignItems: "center",
		paddingHorizontal: 24,
		paddingVertical: 52,
		marginHorizontal: 16,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e5e7eb",
	},
	emptyTitle: {
		fontSize: 20,
		fontWeight: "700",
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
		backgroundColor: "#111827",
		paddingVertical: 13,
		paddingHorizontal: 24,
		borderRadius: 999,
	},
	emptyButtonText: {
		color: "#fff",
		fontSize: 15,
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
	noPhotosButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 12,
		paddingHorizontal: 14,
		gap: 6,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#d1d5db",
		borderRadius: 999,
	},
	noPhotosButtonDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	noPhotosButtonText: {
		color: "#374151",
		fontSize: 13,
		fontWeight: "600",
	},
	noPhotosConfirmation: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 12,
		paddingHorizontal: 14,
		gap: 8,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#d1d5db",
		borderRadius: 999,
	},
	noPhotosConfirmationDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	noPhotosConfirmationText: {
		color: "#374151",
		fontSize: 13,
		fontWeight: "600",
	},
});
