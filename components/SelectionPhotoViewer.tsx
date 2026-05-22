import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	Dimensions,
	FlatList,
	Modal,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LocalPhoto } from "@/lib/mediaLibrary";
import { createVideoThumbnailUri } from "@/lib/storage";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface SelectionPhotoViewerProps {
	photos: LocalPhoto[];
	initialIndex: number;
	visible: boolean;
	onClose: () => void;
	selectedIds: Set<string>;
	uploadedIds: Set<string>;
	onToggleSelection: (id: string) => void;
}

interface ZoomableImageProps {
	photo: LocalPhoto;
}

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

function ZoomableVideoPlayer({ photo }: { photo: LocalPhoto }) {
	const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
	const player = useVideoPlayer(photo.uri, (player) => {
		player.loop = true;
		player.play();
	});

	useEffect(() => {
		let cancelled = false;

		async function generateThumbnail() {
			try {
				const uri = await createVideoThumbnailUri(photo.uri, 0);
				if (!cancelled) setThumbnailUri(uri);
			} catch {
				if (!cancelled) setThumbnailUri(null);
			}
		}

		generateThumbnail();

		return () => {
			cancelled = true;
		};
	}, [photo.uri]);

	return (
		<View style={styles.mediaFrame}>
			{thumbnailUri && (
				<Image source={{ uri: thumbnailUri }} style={styles.mediaBg} contentFit="cover" />
			)}
			<VideoView player={player} style={styles.mediaBg} contentFit="contain" nativeControls />
		</View>
	);
}

function ZoomableImage({ photo }: ZoomableImageProps) {
	const scrollRef = useRef<ScrollView>(null);
	const [isZoomed, setIsZoomed] = useState(false);

	const handleDoubleTap = useCallback(() => {
		if (isZoomed) {
			scrollRef.current?.scrollTo({ x: 0, y: 0, animated: true });
		}
	}, [isZoomed]);

	const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
		const zoomScale = event.nativeEvent.zoomScale;
		setIsZoomed(zoomScale > 1);
	}, []);

	if (photo.mediaType === "video") {
		return (
			<ScrollView
				ref={scrollRef}
				style={styles.scrollView}
				contentContainerStyle={styles.scrollContent}
				maximumZoomScale={3}
				minimumZoomScale={1}
				showsHorizontalScrollIndicator={false}
				showsVerticalScrollIndicator={false}
				onScroll={handleScroll}
				scrollEventThrottle={16}
				bouncesZoom
				centerContent
			>
				<ZoomableVideoPlayer photo={photo} />
			</ScrollView>
		);
	}

	return (
		<ScrollView
			ref={scrollRef}
			style={styles.scrollView}
			contentContainerStyle={styles.scrollContent}
			maximumZoomScale={4}
			minimumZoomScale={1}
			showsHorizontalScrollIndicator={false}
			showsVerticalScrollIndicator={false}
			onScroll={handleScroll}
			scrollEventThrottle={16}
			bouncesZoom
			centerContent
		>
			<TouchableOpacity activeOpacity={1} onPress={handleDoubleTap} style={styles.mediaFrame}>
				<Image
					source={{ uri: photo.uri }}
					style={styles.image}
					contentFit="contain"
					cachePolicy="memory-disk"
					transition={100}
				/>
			</TouchableOpacity>
		</ScrollView>
	);
}

export default function SelectionPhotoViewer({
	photos,
	initialIndex,
	visible,
	onClose,
	selectedIds,
	uploadedIds,
	onToggleSelection,
}: SelectionPhotoViewerProps) {
	const insets = useSafeAreaInsets();
	const [currentIndex, setCurrentIndex] = useState(initialIndex);
	const flatListRef = useRef<FlatList>(null);

	useEffect(() => {
		if (visible) {
			setCurrentIndex(initialIndex);
		}
	}, [visible, initialIndex]);

	const currentPhoto = photos[currentIndex];
	const currentDuration =
		currentPhoto?.mediaType === "video" && currentPhoto.duration
			? formatDurationHms(currentPhoto.duration)
			: null;

	const onViewableItemsChanged = useRef(
		({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
			if (viewableItems.length > 0 && viewableItems[0].index !== null) {
				setCurrentIndex(viewableItems[0].index);
			}
		}
	).current;

	const viewabilityConfig = useRef({
		itemVisiblePercentThreshold: 50,
	}).current;

	if (!visible || !currentPhoto) return null;

	const isUploaded = uploadedIds.has(currentPhoto.id);
	const isSelected = selectedIds.has(currentPhoto.id);

	function handleToggle() {
		if (!isUploaded) {
			onToggleSelection(currentPhoto.id);
		}
	}

	function getButtonStyle() {
		if (isUploaded) {
			return [styles.selectionButton, styles.selectionButtonUploaded];
		}
		if (isSelected) {
			return [styles.selectionButton, styles.selectionButtonSelected];
		}
		return [styles.selectionButton, styles.selectionButtonUnselected];
	}

	function getButtonTextStyle() {
		if (isUploaded) {
			return [styles.selectionButtonText, styles.selectionButtonTextUploaded];
		}
		if (isSelected) {
			return [styles.selectionButtonText, styles.selectionButtonTextSelected];
		}
		return [styles.selectionButtonText, styles.selectionButtonTextUnselected];
	}

	function getButtonLabel() {
		if (isUploaded) return "Already Uploaded";
		if (isSelected) return "Selected";
		return "Select";
	}

	function getButtonIcon() {
		if (isUploaded) return "cloud";
		if (isSelected) return "check";
		return "circle-o";
	}

	return (
		<Modal
			visible={visible}
			animationType="none"
			transparent={false}
			statusBarTranslucent
			onRequestClose={onClose}
		>
			<View style={styles.container}>
				<View style={[styles.header, { paddingTop: insets.top + 8 }]}>
					<TouchableOpacity
						style={styles.headerButton}
						onPress={onClose}
						hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
					>
						<FontAwesome name="chevron-down" size={20} color="#fff" />
					</TouchableOpacity>
					<View style={styles.headerCenter}>
						<Text style={styles.counter}>
							{currentIndex + 1} / {photos.length}
						</Text>
					</View>
					<View style={styles.headerButtonPlaceholder} />
				</View>

				<FlatList
					ref={flatListRef}
					data={photos}
					horizontal
					pagingEnabled
					showsHorizontalScrollIndicator={false}
					keyExtractor={(item) => item.id}
					initialScrollIndex={initialIndex}
					getItemLayout={(_, index) => ({
						length: SCREEN_WIDTH,
						offset: SCREEN_WIDTH * index,
						index,
					})}
					onViewableItemsChanged={onViewableItemsChanged}
					viewabilityConfig={viewabilityConfig}
					renderItem={({ item }) => (
						<View style={styles.imageContainer}>
							<ZoomableImage photo={item} />
						</View>
					)}
				/>

				<View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
					<View style={styles.mediaMetaRow}>
						<View style={styles.mediaPill}>
							<FontAwesome
								name={currentPhoto.mediaType === "video" ? "play" : "image"}
								size={10}
								color="#fff"
							/>
							<Text style={styles.mediaPillText}>
								{currentPhoto.mediaType === "video" ? "Video" : "Photo"}
							</Text>
						</View>
						{currentDuration && (
							<View style={styles.durationPill}>
								<Text style={styles.durationPillText}>{currentDuration}</Text>
							</View>
						)}
					</View>
					<TouchableOpacity style={getButtonStyle()} onPress={handleToggle} disabled={isUploaded}>
						<FontAwesome
							name={getButtonIcon()}
							size={18}
							color={isUploaded ? "#22c55e" : isSelected ? "#fff" : "#3b82f6"}
							style={styles.buttonIcon}
						/>
						<Text style={getButtonTextStyle()}>{getButtonLabel()}</Text>
					</TouchableOpacity>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#000",
	},
	header: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 16,
		paddingBottom: 12,
		zIndex: 10,
	},
	headerButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: "rgba(255, 255, 255, 0.15)",
		justifyContent: "center",
		alignItems: "center",
	},
	headerButtonPlaceholder: {
		width: 40,
		height: 40,
	},
	headerCenter: {
		flex: 1,
		alignItems: "center",
	},
	counter: {
		color: "rgba(255, 255, 255, 0.8)",
		fontSize: 15,
		fontWeight: "500",
	},
	imageContainer: {
		width: SCREEN_WIDTH,
		height: SCREEN_HEIGHT,
	},
	scrollView: {
		flex: 1,
		backgroundColor: "#000",
	},
	scrollContent: {
		flexGrow: 1,
		justifyContent: "center",
		alignItems: "center",
	},
	mediaFrame: {
		width: SCREEN_WIDTH,
		height: SCREEN_HEIGHT,
		justifyContent: "center",
		alignItems: "center",
	},
	image: {
		width: SCREEN_WIDTH,
		height: SCREEN_HEIGHT,
	},
	mediaBg: {
		...StyleSheet.absoluteFillObject,
	},
	footer: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		paddingHorizontal: 20,
		paddingTop: 16,
		zIndex: 10,
		alignItems: "center",
	},
	mediaMetaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 10,
	},
	mediaPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 999,
		backgroundColor: "rgba(255, 255, 255, 0.12)",
	},
	mediaPillText: {
		color: "#fff",
		fontSize: 10,
		fontWeight: "700",
		letterSpacing: 0.8,
	},
	durationPill: {
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 999,
		backgroundColor: "rgba(17, 24, 39, 0.92)",
		borderWidth: 1,
		borderColor: "rgba(255, 255, 255, 0.08)",
	},
	durationPillText: {
		color: "#fff",
		fontSize: 10,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
	},
	selectionButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 14,
		paddingHorizontal: 32,
		borderRadius: 30,
		minWidth: 180,
	},
	selectionButtonUploaded: {
		backgroundColor: "rgba(34, 197, 94, 0.2)",
		borderWidth: 1,
		borderColor: "#22c55e",
	},
	selectionButtonSelected: {
		backgroundColor: "#3b82f6",
	},
	selectionButtonUnselected: {
		backgroundColor: "transparent",
		borderWidth: 2,
		borderColor: "#3b82f6",
	},
	buttonIcon: {
		marginRight: 8,
	},
	selectionButtonText: {
		fontSize: 16,
		fontWeight: "600",
	},
	selectionButtonTextUploaded: {
		color: "#22c55e",
	},
	selectionButtonTextSelected: {
		color: "#fff",
	},
	selectionButtonTextUnselected: {
		color: "#3b82f6",
	},
});
