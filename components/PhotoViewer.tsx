import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Animated,
	Dimensions,
	FlatList,
	Modal,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	PanResponder,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { saveToLibrary } from "@/lib/mediaLibrary";
import {
	downloadPhoto,
	isPhotoDownloaded,
	markPhotoDownloaded,
	usePhotoThumbnailUrl,
	useStorageUrl,
} from "@/lib/storage";
import { formatLocalizedDate, formatLocalizedTime } from "@/lib/utils";
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

function clampIndex(index: number, length: number): number {
	if (length <= 0) return 0;
	return Math.max(0, Math.min(index, length - 1));
}

function ZoomableImage({ photo, thumbnailUri }: ZoomableImageProps) {
	const scrollRef = useRef<ScrollView>(null);
	const [isZoomed, setIsZoomed] = useState(false);
	const signedPhotoUrl = useStorageUrl(photo.isPending ? null : photo.storage_path);
	const photoUri = photo.isPending && photo.localUri ? photo.localUri : signedPhotoUrl;

	const handlePress = useCallback(() => {
		if (isZoomed) {
			scrollRef.current?.scrollTo({ x: 0, y: 0, animated: true });
		}
	}, [isZoomed]);

	const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
		setIsZoomed(event.nativeEvent.zoomScale > 1);
	}, []);

	return (
		<ScrollView
			ref={scrollRef}
			style={styles.mediaFill}
			contentContainerStyle={styles.mediaFill}
			maximumZoomScale={4}
			minimumZoomScale={1}
			showsHorizontalScrollIndicator={false}
			showsVerticalScrollIndicator={false}
			onScroll={handleScroll}
			scrollEventThrottle={16}
			bouncesZoom
			centerContent
		>
			<Pressable onPress={handlePress} style={styles.mediaFill}>
				{photoUri ? (
					<Image
						source={{ uri: photoUri }}
						style={styles.mediaFill}
						contentFit="contain"
						cachePolicy="memory-disk"
						enableLiveTextInteraction={false}
						placeholder={thumbnailUri ? { uri: thumbnailUri } : undefined}
						placeholderContentFit="contain"
						transition={120}
					/>
				) : (
					<View style={styles.loadingState}>
						<ActivityIndicator size="large" color="#fff" />
					</View>
				)}
			</Pressable>
		</ScrollView>
	);
}

function PhotoPage({
	photo,
	initialThumbnailUri,
	isInitial,
}: {
	photo: MergedMediaItem;
	initialThumbnailUri?: string;
	isInitial: boolean;
}) {
	const signedThumbnailUrl = useStorageUrl(photo.isPending ? null : photo.thumbnail_path);
	const signedPhotoUrl = usePhotoThumbnailUrl(
		photo.isPending || photo.media_type !== "photo" ? null : photo.storage_path
	);
	const thumbnailUri =
		isInitial && initialThumbnailUri
			? initialThumbnailUri
			: photo.localThumbnailUri ||
				signedThumbnailUrl ||
				(photo.isPending ? photo.localUri : signedPhotoUrl) ||
				undefined;

	return <ZoomableImage photo={photo} thumbnailUri={thumbnailUri} />;
}

function VideoPage({
	photo,
	initialThumbnailUri,
	isInitial,
	isActive,
}: {
	photo: MergedMediaItem;
	initialThumbnailUri?: string;
	isInitial: boolean;
	isActive: boolean;
}) {
	const signedThumbnailUrl = useStorageUrl(photo.isPending ? null : photo.thumbnail_path);
	const thumbnailUri =
		isInitial && initialThumbnailUri
			? initialThumbnailUri
			: photo.localThumbnailUri || signedThumbnailUrl || undefined;

	return (
		<View style={styles.mediaFill}>
			<VideoPlayer
				media={photo}
				autoPlay
				isActive={isActive}
				nativeControls={false}
				allowTapToggle
				thumbnailUri={thumbnailUri}
			/>
		</View>
	);
}

export default function PhotoViewer({
	photos,
	initialIndex,
	visible,
	onClose,
	onDelete,
	currentUserId,
	isDark,
	initialThumbnailUri,
}: PhotoViewerProps) {
	const insets = useSafeAreaInsets();
	const flatListRef = useRef<FlatList<MergedMediaItem>>(null);
	const safeInitialIndex = clampIndex(initialIndex, photos.length);
	const [currentIndex, setCurrentIndex] = useState(safeInitialIndex);
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const translateY = useRef(new Animated.Value(0)).current;
	const backdropOpacity = translateY.interpolate({
		inputRange: [0, SCREEN_HEIGHT * 0.7, SCREEN_HEIGHT],
		outputRange: [1, 0.2, 0],
		extrapolate: "clamp",
	});

	const currentPhoto = photos[currentIndex];
	const canDelete =
		currentPhoto && !currentPhoto.isPending && currentPhoto.uploaded_by_user_id === currentUserId;
	const capturedAt = currentPhoto?.captured_at;
	const captureDateLabel = capturedAt
		? formatLocalizedDate(capturedAt, {
				month: "short",
				day: "numeric",
				year: "numeric",
			})
		: null;
	const captureTimeLabel = capturedAt ? formatLocalizedTime(capturedAt) : null;

	const buttonSurface = isDark ? "rgba(15, 23, 42, 0.56)" : "rgba(15, 23, 42, 0.44)";
	const buttonBorder = isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.18)";

	const scrollToPhoto = useCallback((index: number, animated: boolean) => {
		flatListRef.current?.scrollToOffset({
			offset: SCREEN_WIDTH * index,
			animated,
		});
	}, []);

	useEffect(() => {
		if (!visible) {
			setSaving(false);
			setDeleting(false);
			return;
		}

		translateY.setValue(0);
		const nextIndex = clampIndex(initialIndex, photos.length);
		setCurrentIndex(nextIndex);

		requestAnimationFrame(() => {
			scrollToPhoto(nextIndex, false);
		});
	}, [visible, initialIndex, photos.length, scrollToPhoto, translateY]);

	useEffect(() => {
		if (!visible) return;
		if (photos.length === 0) {
			onClose();
			return;
		}

		const nextIndex = clampIndex(currentIndex, photos.length);
		if (nextIndex !== currentIndex) {
			setCurrentIndex(nextIndex);
			requestAnimationFrame(() => {
				scrollToPhoto(nextIndex, false);
			});
		}
	}, [visible, currentIndex, photos.length, onClose, scrollToPhoto]);

	const handleMomentumEnd = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			setCurrentIndex(
				clampIndex(Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH), photos.length)
			);
		},
		[photos.length]
	);

	const handleDownload = useCallback(async () => {
		if (!currentPhoto || currentPhoto.isPending) return;

		setSaving(true);
		try {
			const alreadyDownloaded = await isPhotoDownloaded(currentPhoto.id);
			const isVideo = currentPhoto.media_type === "video";
			const mediaLabel = isVideo ? "video" : "photo";

			if (alreadyDownloaded) {
				Alert.alert("Already Saved", `This ${mediaLabel} is already in your camera roll`);
				setSaving(false);
				return;
			}

			const extension = isVideo ? "mp4" : "jpg";
			const localUri = await downloadPhoto(
				currentPhoto.storage_path,
				`recapd_${currentPhoto.id}.${extension}`
			);

			if (!localUri) {
				Alert.alert("Error", `Failed to download ${mediaLabel}`);
				return;
			}

			const asset = await saveToLibrary(localUri);
			if (!asset) {
				Alert.alert("Error", `Failed to save ${mediaLabel}`);
				return;
			}

			await markPhotoDownloaded(currentPhoto.id);
			Alert.alert("Saved", `${isVideo ? "Video" : "Photo"} saved to your camera roll`);
		} catch {
			Alert.alert(
				"Error",
				`Failed to download ${currentPhoto.media_type === "video" ? "video" : "photo"}`
			);
		} finally {
			setSaving(false);
		}
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

						if (!success) {
							Alert.alert("Error", `Failed to delete ${mediaLabel}`);
							return;
						}

						if (photos.length <= 1) {
							onClose();
							return;
						}

						if (currentIndex >= photos.length - 1) {
							const nextIndex = Math.max(0, currentIndex - 1);
							setCurrentIndex(nextIndex);
							requestAnimationFrame(() => {
								scrollToPhoto(nextIndex, false);
							});
						}
					},
				},
			]
		);
	}, [currentPhoto, onDelete, photos.length, currentIndex, onClose, scrollToPhoto]);

	const animateClose = useCallback(() => {
		Animated.timing(translateY, {
			toValue: SCREEN_HEIGHT,
			duration: 180,
			useNativeDriver: true,
		}).start(({ finished }) => {
			if (finished) {
				onClose();
			}
		});
	}, [onClose, translateY]);

	const resetPosition = useCallback(() => {
		Animated.spring(translateY, {
			toValue: 0,
			useNativeDriver: true,
			bounciness: 0,
			speed: 18,
		}).start();
	}, [translateY]);

	const panResponder = useRef(
		PanResponder.create({
			onMoveShouldSetPanResponderCapture: (_, gestureState) =>
				gestureState.dy > 6 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
			onPanResponderMove: (_, gestureState) => {
				translateY.setValue(Math.max(0, gestureState.dy));
			},
			onPanResponderRelease: (_, gestureState) => {
				if (gestureState.dy > 120 || gestureState.vy > 1.05) {
					animateClose();
					return;
				}

				resetPosition();
			},
			onPanResponderTerminate: resetPosition,
		})
	).current;

	if (!visible || !currentPhoto) return null;

	return (
		<Modal
			visible={visible}
			animationType="none"
			transparent
			presentationStyle="overFullScreen"
			statusBarTranslucent
			onRequestClose={onClose}
		>
			<View style={styles.modalRoot}>
				<Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
				<Animated.View
					style={[
						styles.container,
						{
							transform: [{ translateY }],
						},
					]}
					{...panResponder.panHandlers}
				>
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
						onMomentumScrollEnd={handleMomentumEnd}
						onScrollToIndexFailed={({ index }) => {
							requestAnimationFrame(() => {
								scrollToPhoto(index, false);
							});
						}}
						renderItem={({ item, index }) => (
							<View style={styles.page}>
								{item.media_type === "video" ? (
									<VideoPage
										photo={item}
										isActive={index === currentIndex}
										isInitial={index === safeInitialIndex}
										initialThumbnailUri={initialThumbnailUri}
									/>
								) : (
									<PhotoPage
										photo={item}
										isInitial={index === safeInitialIndex}
										initialThumbnailUri={initialThumbnailUri}
									/>
								)}
							</View>
						)}
					/>

					<View pointerEvents="box-none" style={styles.overlay}>
						<Pressable
							onPress={animateClose}
							hitSlop={12}
							style={[
								styles.topButton,
								{
									top: insets.top + 12,
									backgroundColor: buttonSurface,
									borderColor: buttonBorder,
								},
							]}
						>
							<FontAwesome name="chevron-down" size={18} color="#fff" />
						</Pressable>

						{captureDateLabel && captureTimeLabel ? (
							<View
								style={[
									styles.timestampBadge,
									{
										left: 16,
										bottom: insets.bottom + 18,
										backgroundColor: buttonSurface,
										borderColor: buttonBorder,
									},
								]}
							>
								<Text style={styles.timestampDate}>{captureDateLabel}</Text>
								<Text style={styles.timestampTime}>{captureTimeLabel}</Text>
							</View>
						) : null}

						<View
							style={[
								styles.bottomActions,
								{
									bottom: insets.bottom + 18,
								},
							]}
						>
							{canDelete ? (
								<Pressable
									onPress={handleDelete}
									disabled={deleting}
									style={[
										styles.actionButton,
										{
											backgroundColor: buttonSurface,
											borderColor: buttonBorder,
										},
									]}
								>
									{deleting ? (
										<ActivityIndicator size="small" color="#fff" />
									) : (
										<FontAwesome name="trash-o" size={20} color="#fff" />
									)}
								</Pressable>
							) : null}

							{!currentPhoto.isPending ? (
								<Pressable
									onPress={handleDownload}
									disabled={saving}
									style={[
										styles.actionButton,
										{
											backgroundColor: buttonSurface,
											borderColor: buttonBorder,
										},
									]}
								>
									{saving ? (
										<ActivityIndicator size="small" color="#fff" />
									) : (
										<FontAwesome name="arrow-down" size={20} color="#fff" />
									)}
								</Pressable>
							) : null}
						</View>
					</View>
				</Animated.View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	modalRoot: {
		flex: 1,
	},
	backdrop: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "#000",
	},
	container: {
		flex: 1,
	},
	page: {
		width: SCREEN_WIDTH,
		height: SCREEN_HEIGHT,
		backgroundColor: "#000",
	},
	mediaFill: {
		flex: 1,
		width: SCREEN_WIDTH,
		height: SCREEN_HEIGHT,
		backgroundColor: "#000",
	},
	loadingState: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	overlay: {
		...StyleSheet.absoluteFillObject,
	},
	topButton: {
		position: "absolute",
		left: 16,
		width: 46,
		height: 46,
		borderRadius: 23,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
	timestampBadge: {
		position: "absolute",
		maxWidth: SCREEN_WIDTH - 108,
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 16,
		borderWidth: 1,
	},
	timestampDate: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "600",
	},
	timestampTime: {
		marginTop: 2,
		color: "rgba(255, 255, 255, 0.8)",
		fontSize: 13,
		fontWeight: "500",
	},
	bottomActions: {
		position: "absolute",
		right: 16,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	actionButton: {
		width: 52,
		height: 52,
		borderRadius: 26,
		borderWidth: 1,
		alignItems: "center",
		justifyContent: "center",
	},
});
