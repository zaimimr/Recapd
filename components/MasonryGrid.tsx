import FontAwesome from "@expo/vector-icons/FontAwesome";
import { format } from "date-fns";
import { Image } from "expo-image";
import { memo, useCallback, useMemo } from "react";
import {
	ActivityIndicator,
	Dimensions,
	FlatList,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { getAvatarColor } from "@/lib/colors";
import { getPhotoUrl } from "@/lib/storage";
import { formatDuration } from "@/lib/utils";
import type { MergedMediaItem } from "./MomentCluster";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const NUM_COLUMNS = 2;
const GAP = 8;
const COLUMN_WIDTH = (SCREEN_WIDTH - 48 - GAP) / NUM_COLUMNS;

interface MasonryGridProps {
	photos: MergedMediaItem[];
	onPhotoPress: (photo: MergedMediaItem, index: number) => void;
	onRetry?: (id: string) => void;
	isDark: boolean;
}

function calculatePhotoHeight(photo: MergedMediaItem): number {
	const aspectRatio = photo.width && photo.height ? photo.height / photo.width : 1;
	const height = COLUMN_WIDTH * aspectRatio;
	return Math.min(Math.max(height, 120), 300);
}

// Flatten photos into rows of 2 for FlatList
interface RowItem {
	id: string;
	left: { photo: MergedMediaItem; index: number; height: number } | null;
	right: { photo: MergedMediaItem; index: number; height: number } | null;
	rowHeight: number;
}

function distributePhotosIntoRows(photos: MergedMediaItem[]): RowItem[] {
	const rows: RowItem[] = [];

	for (let i = 0; i < photos.length; i += 2) {
		const leftPhoto = photos[i];
		const rightPhoto = photos[i + 1];

		const leftHeight = calculatePhotoHeight(leftPhoto);
		const rightHeight = rightPhoto ? calculatePhotoHeight(rightPhoto) : 0;
		const rowHeight = Math.max(leftHeight, rightHeight);

		rows.push({
			id: `row-${i}`,
			left: { photo: leftPhoto, index: i, height: leftHeight },
			right: rightPhoto ? { photo: rightPhoto, index: i + 1, height: rightHeight } : null,
			rowHeight,
		});
	}

	return rows;
}

function PhotoCard({
	photo,
	index,
	height,
	onPress,
	onRetry,
	isDark,
}: {
	photo: MergedMediaItem;
	index: number;
	height: number;
	onPress: () => void;
	onRetry?: (id: string) => void;
	isDark: boolean;
}) {
	// For videos, use thumbnail_path if available
	const getImageUri = () => {
		if (photo.isPending && photo.localUri) {
			return photo.localUri;
		}
		// For videos, prefer thumbnail path
		if (photo.media_type === "video" && photo.thumbnail_path) {
			return getPhotoUrl(photo.thumbnail_path);
		}
		// For photos or videos without thumbnail, use storage_path
		// Note: This will fail for videos without thumbnails
		if (photo.media_type === "video") {
			return null; // No thumbnail available for video
		}
		return getPhotoUrl(photo.storage_path);
	};

	const imageUri = getImageUri();

	const isSyncing = photo.isPending && photo.syncStatus === "syncing";
	const isFailed = photo.isPending && photo.syncStatus === "failed";
	const isPendingNotStarted = photo.isPending && photo.syncStatus === "pending";

	return (
		<TouchableOpacity style={[styles.photoCard, { height }]} onPress={onPress} activeOpacity={0.9}>
			{imageUri ? (
				<Image
					source={{ uri: imageUri }}
					style={[styles.photoImage, photo.isPending && styles.pendingImage]}
					key={photo.id}
					contentFit="cover"
					cachePolicy="memory-disk"
					transition={150}
					recyclingKey={photo.id}
				/>
			) : (
				<View style={[styles.photoImage, styles.videoPlaceholder]}>
					<FontAwesome name="video-camera" size={32} color="rgba(255,255,255,0.5)" />
				</View>
			)}

			{/* Upload status overlay */}
			{photo.isPending && (
				<View style={styles.uploadOverlay}>
					<View style={styles.uploadIndicator}>
						{isSyncing && (
							<>
								<ActivityIndicator size="small" color="#fff" />
								<Text style={styles.uploadText}>Uploading...</Text>
							</>
						)}
						{isPendingNotStarted && (
							<>
								<FontAwesome name="clock-o" size={16} color="#fff" />
								<Text style={styles.uploadText}>Waiting...</Text>
							</>
						)}
						{isFailed && (
							<TouchableOpacity
								style={styles.retryButton}
								onPress={() => onRetry?.(photo.id)}
								hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
							>
								<FontAwesome name="refresh" size={14} color="#fff" />
								<Text style={styles.uploadText}>Retry</Text>
							</TouchableOpacity>
						)}
					</View>
				</View>
			)}

			{photo.media_type === "video" && !photo.isPending && (
				<>
					<View style={styles.videoPlayOverlay}>
						<View style={styles.videoPlayButton}>
							<FontAwesome name="play" size={16} color="#fff" style={styles.videoPlayIcon} />
						</View>
					</View>
					{photo.duration_milliseconds != null && photo.duration_milliseconds > 0 && (
						<View style={styles.videoDurationBadge}>
							<Text style={styles.videoDurationText}>
								{formatDuration(photo.duration_milliseconds)}
							</Text>
						</View>
					)}
				</>
			)}

			{photo.uploader?.display_name && !photo.isPending && (
				<View style={styles.photoFooter}>
					<View
						style={[
							styles.avatarBadge,
							{ backgroundColor: getAvatarColor(photo.uploader.display_name) },
						]}
					>
						<Text style={styles.avatarInitial}>
							{photo.uploader.display_name.charAt(0).toUpperCase()}
						</Text>
					</View>
					<Text style={styles.timeText} numberOfLines={1}>
						{format(new Date(photo.captured_at), "h:mm a")}
					</Text>
				</View>
			)}
		</TouchableOpacity>
	);
}

// Memoize PhotoCard to prevent unnecessary re-renders
const MemoizedPhotoCard = memo(PhotoCard);

export default function MasonryGrid({ photos, onPhotoPress, onRetry, isDark }: MasonryGridProps) {
	const rows = useMemo(() => distributePhotosIntoRows(photos), [photos]);

	const renderRow = useCallback(
		({ item }: { item: RowItem }) => (
			<View style={styles.row}>
				{item.left && (
					<MemoizedPhotoCard
						photo={item.left.photo}
						index={item.left.index}
						height={item.left.height}
						onPress={() => onPhotoPress(item.left!.photo, item.left!.index)}
						onRetry={onRetry}
						isDark={isDark}
					/>
				)}
				{item.right && (
					<MemoizedPhotoCard
						photo={item.right.photo}
						index={item.right.index}
						height={item.right.height}
						onPress={() => onPhotoPress(item.right!.photo, item.right!.index)}
						onRetry={onRetry}
						isDark={isDark}
					/>
				)}
				{!item.right && <View style={styles.emptyCell} />}
			</View>
		),
		[onPhotoPress, onRetry, isDark]
	);

	if (photos.length === 0) return null;

	return (
		<FlatList
			data={rows}
			renderItem={renderRow}
			keyExtractor={(item) => item.id}
			initialNumToRender={6}
			maxToRenderPerBatch={4}
			windowSize={5}
			removeClippedSubviews
			showsVerticalScrollIndicator={false}
			contentContainerStyle={styles.container}
			scrollEnabled={false} // Parent ScrollView handles scrolling
		/>
	);
}

const styles = StyleSheet.create({
	container: {
		paddingBottom: GAP,
	},
	row: {
		flexDirection: "row",
		gap: GAP,
		marginBottom: GAP,
	},
	emptyCell: {
		flex: 1,
	},
	photoCard: {
		flex: 1,
		borderRadius: 12,
		overflow: "hidden",
		backgroundColor: "#1a1a1a",
	},
	photoImage: {
		width: "100%",
		height: "100%",
	},
	pendingImage: {
		opacity: 0.6,
	},
	uploadOverlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(0, 0, 0, 0.4)",
		justifyContent: "center",
		alignItems: "center",
	},
	uploadIndicator: {
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: 6,
		backgroundColor: "rgba(0, 0, 0, 0.6)",
		paddingVertical: 10,
		paddingHorizontal: 14,
		borderRadius: 12,
	},
	uploadText: {
		color: "#fff",
		fontSize: 11,
		fontWeight: "600",
	},
	retryButton: {
		flexDirection: "column",
		alignItems: "center",
		gap: 4,
	},
	photoFooter: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		flexDirection: "row",
		alignItems: "center",
		padding: 8,
		gap: 6,
		backgroundColor: "rgba(0, 0, 0, 0.4)",
	},
	avatarBadge: {
		width: 22,
		height: 22,
		borderRadius: 11,
		justifyContent: "center",
		alignItems: "center",
	},
	avatarInitial: {
		color: "#fff",
		fontSize: 10,
		fontWeight: "700",
	},
	timeText: {
		color: "rgba(255, 255, 255, 0.9)",
		fontSize: 11,
		fontWeight: "500",
	},
	videoPlayOverlay: {
		...StyleSheet.absoluteFillObject,
		justifyContent: "center",
		alignItems: "center",
	},
	videoPlayButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		justifyContent: "center",
		alignItems: "center",
	},
	videoPlayIcon: {
		marginLeft: 3,
	},
	videoDurationBadge: {
		position: "absolute",
		top: 8,
		right: 8,
		backgroundColor: "rgba(0, 0, 0, 0.7)",
		paddingHorizontal: 5,
		paddingVertical: 2,
		borderRadius: 4,
	},
	videoDurationText: {
		color: "#fff",
		fontSize: 10,
		fontWeight: "600",
	},
	videoPlaceholder: {
		width: "100%",
		height: "100%",
		backgroundColor: "#1a1a2e",
		justifyContent: "center",
		alignItems: "center",
	},
});
