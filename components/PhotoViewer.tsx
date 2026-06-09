import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Image } from "expo-image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Animated,
	Dimensions,
	type GestureResponderEvent,
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
	backfillVideoThumbnail,
	classifyDownloadError,
	describeDownloadFailure,
	downloadPhoto,
	isPhotoDownloaded,
	markPhotoDownloaded,
	usePhotoThumbnailUrl,
	useStorageUrl,
} from "@/lib/storage";
import { formatLocalizedDate, formatLocalizedTime } from "@/lib/utils";
import MediaViewerPager, { type MediaViewerPagerHandle } from "./MediaViewerPager";
import type { MergedMediaItem } from "./MomentCluster";
import VideoPlayer from "./VideoPlayer";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

function getBlurhash(photo: MergedMediaItem): string | undefined {
	const value = (photo as MergedMediaItem & { blurhash?: string | null }).blurhash;
	return value ?? undefined;
}

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
	blurhash?: string;
	onSingleTap?: () => void;
}

const DOUBLE_TAP_DELAY = 250;
const DOUBLE_TAP_ZOOM = 2.5;

function clampIndex(index: number, length: number): number {
	if (length <= 0) return 0;
	return Math.max(0, Math.min(index, length - 1));
}

function PlaceholderFrame({
	thumbnailUri,
	blurhash,
}: {
	thumbnailUri?: string;
	blurhash?: string;
}) {
	if (thumbnailUri) {
		return (
			<Image
				source={{ uri: thumbnailUri }}
				style={styles.mediaFill}
				contentFit="contain"
				cachePolicy="memory-disk"
				placeholder={blurhash ? { blurhash } : undefined}
				placeholderContentFit="contain"
			/>
		);
	}

	if (blurhash) {
		return <Image placeholder={{ blurhash }} style={styles.mediaFill} contentFit="cover" />;
	}

	return <View style={styles.mediaFill} />;
}

function ZoomableImage({ photo, thumbnailUri, blurhash, onSingleTap }: ZoomableImageProps) {
	const scrollRef = useRef<ScrollView>(null);
	const isZoomedRef = useRef(false);
	const lastTapRef = useRef(0);
	const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const signedPhotoUrl = useStorageUrl(photo.isPending ? null : photo.storage_path);
	const photoUri = photo.isPending && photo.localUri ? photo.localUri : signedPhotoUrl;

	const zoomToRect = useCallback((x: number, y: number, width: number, height: number) => {
		(
			scrollRef.current as unknown as {
				scrollResponderZoomTo?: (rect: {
					x: number;
					y: number;
					width: number;
					height: number;
					animated: boolean;
				}) => void;
			}
		)?.scrollResponderZoomTo?.({ x, y, width, height, animated: true });
	}, []);

	const zoomOut = useCallback(() => {
		zoomToRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
		scrollRef.current?.scrollTo({ x: 0, y: 0, animated: true });
	}, [zoomToRect]);

	const handleDoubleTap = useCallback(
		(locationX: number, locationY: number) => {
			if (isZoomedRef.current) {
				zoomOut();
				return;
			}
			const width = SCREEN_WIDTH / DOUBLE_TAP_ZOOM;
			const height = SCREEN_HEIGHT / DOUBLE_TAP_ZOOM;
			zoomToRect(locationX - width / 2, locationY - height / 2, width, height);
		},
		[zoomOut, zoomToRect]
	);

	const handlePress = useCallback(
		(event: GestureResponderEvent) => {
			const now = Date.now();
			const { locationX, locationY } = event.nativeEvent;

			if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
				lastTapRef.current = 0;
				if (singleTapTimer.current) {
					clearTimeout(singleTapTimer.current);
					singleTapTimer.current = null;
				}
				handleDoubleTap(locationX, locationY);
				return;
			}

			lastTapRef.current = now;
			singleTapTimer.current = setTimeout(() => {
				singleTapTimer.current = null;
				if (isZoomedRef.current) {
					zoomOut();
				} else {
					onSingleTap?.();
				}
			}, DOUBLE_TAP_DELAY);
		},
		[handleDoubleTap, zoomOut, onSingleTap]
	);

	useEffect(
		() => () => {
			if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
		},
		[]
	);

	const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
		isZoomedRef.current = event.nativeEvent.zoomScale > 1;
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
						placeholder={thumbnailUri ? { uri: thumbnailUri } : blurhash ? { blurhash } : undefined}
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
	isActive,
	onSingleTap,
}: {
	photo: MergedMediaItem;
	initialThumbnailUri?: string;
	isInitial: boolean;
	isActive: boolean;
	onSingleTap?: () => void;
}) {
	const signedThumbnailUrl = useStorageUrl(photo.isPending ? null : photo.thumbnail_path);
	const signedPhotoUrl = usePhotoThumbnailUrl(
		photo.isPending || photo.media_type !== "photo" ? null : photo.storage_path
	);
	const blurhash = getBlurhash(photo);
	const thumbnailUri =
		isInitial && initialThumbnailUri
			? initialThumbnailUri
			: photo.localThumbnailUri ||
				signedThumbnailUrl ||
				(photo.isPending ? photo.localUri : signedPhotoUrl) ||
				undefined;

	if (!isActive) {
		return <PlaceholderFrame thumbnailUri={thumbnailUri} blurhash={blurhash} />;
	}

	return (
		<ZoomableImage
			photo={photo}
			thumbnailUri={thumbnailUri}
			blurhash={blurhash}
			onSingleTap={onSingleTap}
		/>
	);
}

function VideoPage({
	photo,
	initialThumbnailUri,
	isInitial,
	isActive,
	muted,
	onSurfaceTap,
}: {
	photo: MergedMediaItem;
	initialThumbnailUri?: string;
	isInitial: boolean;
	isActive: boolean;
	muted: boolean;
	onSurfaceTap?: () => void;
}) {
	const signedThumbnailUrl = useStorageUrl(photo.isPending ? null : photo.thumbnail_path);
	const blurhash = getBlurhash(photo);
	const thumbnailUri =
		isInitial && initialThumbnailUri
			? initialThumbnailUri
			: photo.localThumbnailUri || signedThumbnailUrl || undefined;

	useEffect(() => {
		if (!isActive) return;
		void backfillVideoThumbnail(photo);
	}, [isActive, photo]);

	if (!isActive) {
		return <PlaceholderFrame thumbnailUri={thumbnailUri} blurhash={blurhash} />;
	}

	return (
		<View style={styles.mediaFill}>
			<VideoPlayer
				media={photo}
				autoPlay
				loop
				isActive={isActive}
				nativeControls={false}
				allowTapToggle
				muted={muted}
				onSurfaceTap={onSurfaceTap}
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
	const pagerRef = useRef<MediaViewerPagerHandle>(null);
	const safeInitialIndex = clampIndex(initialIndex, photos.length);
	const [currentIndex, setCurrentIndex] = useState(safeInitialIndex);
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [controlsVisible, setControlsVisible] = useState(true);
	const [muted, setMuted] = useState(false);
	const controlsOpacity = useRef(new Animated.Value(1)).current;
	const translateY = useRef(new Animated.Value(0)).current;
	const backdropOpacity = translateY.interpolate({
		inputRange: [0, SCREEN_HEIGHT * 0.7, SCREEN_HEIGHT],
		outputRange: [1, 0.2, 0],
		extrapolate: "clamp",
	});

	const currentPhoto = photos[currentIndex];
	const isVideo = currentPhoto?.media_type === "video";
	const uploaderName = currentPhoto?.uploader?.display_name ?? null;
	const counterLabel = photos.length > 0 ? `${currentIndex + 1} / ${photos.length}` : null;
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
		pagerRef.current?.scrollToIndex(index, animated);
	}, []);

	const toggleControls = useCallback(() => {
		setControlsVisible((visible) => !visible);
	}, []);

	const toggleMuted = useCallback(() => {
		setMuted((value) => !value);
	}, []);

	useEffect(() => {
		Animated.timing(controlsOpacity, {
			toValue: controlsVisible ? 1 : 0,
			duration: 180,
			useNativeDriver: true,
		}).start();
	}, [controlsVisible, controlsOpacity]);

	useEffect(() => {
		if (!visible) {
			setSaving(false);
			setDeleting(false);
			return;
		}

		translateY.setValue(0);
		setControlsVisible(true);
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

	const handleIndexChange = useCallback(
		(index: number) => {
			setCurrentIndex(clampIndex(index, photos.length));
			setControlsVisible(true);
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

			const asset = await saveToLibrary(localUri);
			if (!asset) {
				Alert.alert("Couldn't Save", `We couldn't save this ${mediaLabel} to your camera roll.`);
				return;
			}

			await markPhotoDownloaded(currentPhoto.id);
			Alert.alert("Saved", `${isVideo ? "Video" : "Photo"} saved to your camera roll`);
		} catch (error) {
			const reason = classifyDownloadError(error);
			const title = reason === "out_of_space" ? "Storage Full" : "Couldn't Download";
			Alert.alert(title, describeDownloadFailure(reason));
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
					<MediaViewerPager
						ref={pagerRef}
						data={photos}
						initialIndex={safeInitialIndex}
						keyExtractor={(item) => item.id}
						onIndexChange={handleIndexChange}
						renderPage={(item, index, state) => (
							<View style={styles.page}>
								{item.media_type === "video" ? (
									<VideoPage
										photo={item}
										isActive={state.isActive}
										isInitial={index === safeInitialIndex}
										initialThumbnailUri={initialThumbnailUri}
										muted={muted}
										onSurfaceTap={toggleControls}
									/>
								) : (
									<PhotoPage
										photo={item}
										isActive={state.isActive}
										isInitial={index === safeInitialIndex}
										initialThumbnailUri={initialThumbnailUri}
										onSingleTap={toggleControls}
									/>
								)}
							</View>
						)}
					/>

					<Animated.View
						pointerEvents={controlsVisible ? "box-none" : "none"}
						style={[styles.overlay, { opacity: controlsOpacity }]}
					>
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

						{counterLabel ? (
							<View pointerEvents="none" style={[styles.counterRow, { top: insets.top + 12 }]}>
								<View
									style={[
										styles.counterBadge,
										{ backgroundColor: buttonSurface, borderColor: buttonBorder },
									]}
								>
									<Text style={styles.counterText}>{counterLabel}</Text>
								</View>
							</View>
						) : null}

						{isVideo ? (
							<Pressable
								onPress={toggleMuted}
								hitSlop={12}
								style={[
									styles.topButton,
									styles.muteButton,
									{
										top: insets.top + 12,
										backgroundColor: buttonSurface,
										borderColor: buttonBorder,
									},
								]}
							>
								<FontAwesome name={muted ? "volume-off" : "volume-up"} size={18} color="#fff" />
							</Pressable>
						) : null}

						{uploaderName || (captureDateLabel && captureTimeLabel) ? (
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
								{uploaderName ? <Text style={styles.uploaderName}>{uploaderName}</Text> : null}
								{captureDateLabel && captureTimeLabel ? (
									<Text style={styles.timestampDate}>
										{captureDateLabel} · {captureTimeLabel}
									</Text>
								) : null}
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
					</Animated.View>
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
	muteButton: {
		left: undefined,
		right: 16,
	},
	counterRow: {
		position: "absolute",
		left: 0,
		right: 0,
		alignItems: "center",
	},
	counterBadge: {
		paddingHorizontal: 14,
		height: 46,
		justifyContent: "center",
		borderRadius: 23,
		borderWidth: 1,
	},
	counterText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "600",
	},
	timestampBadge: {
		position: "absolute",
		maxWidth: SCREEN_WIDTH - 108,
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderRadius: 16,
		borderWidth: 1,
	},
	uploaderName: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "600",
	},
	timestampDate: {
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
