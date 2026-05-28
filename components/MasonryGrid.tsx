import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Image } from "expo-image";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	StyleSheet,
	Text,
	TouchableOpacity,
	useWindowDimensions,
	View,
} from "react-native";
import { getAvatarColor } from "@/lib/colors";
import {
	createVideoThumbnailUri,
	getOrCreatePhotoGridThumbnail,
	usePhotoThumbnailUrl,
	useStorageUrl,
} from "@/lib/storage";
import { formatDuration } from "@/lib/utils";
import type { MergedMediaItem } from "./MomentCluster";

const GRID_GAP = 2;
const GRID_PADDING = 2;
const GRID_DENSITY_OPTIONS = [
	{ columns: 2, label: "Large" },
	{ columns: 3, label: "Default" },
	{ columns: 4, label: "Dense" },
] as const;

type GridColumns = (typeof GRID_DENSITY_OPTIONS)[number]["columns"];

interface MasonryGridProps {
	photos: MergedMediaItem[];
	onPhotoPress: (photo: MergedMediaItem, index: number) => void;
	onRetry?: (id: string) => void;
	onSkip?: (id: string) => void;
	onRemove?: (id: string) => void;
	isDark: boolean;
}

function GridTile({
	photo,
	index,
	tileSize,
	isDark,
	onPhotoPress,
	onRetry,
	onSkip,
	onRemove,
}: {
	photo: MergedMediaItem;
	index: number;
	tileSize: number;
	isDark: boolean;
	onPhotoPress: (photo: MergedMediaItem, index: number) => void;
	onRetry?: (id: string) => void;
	onSkip?: (id: string) => void;
	onRemove?: (id: string) => void;
}) {
	const isVideo = photo.media_type === "video";
	const [generatedThumbnailUri, setGeneratedThumbnailUri] = useState<string | null>(null);
	const [pendingPhotoThumbnailUri, setPendingPhotoThumbnailUri] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function resolveVideoThumbnail() {
			if (!isVideo || photo.thumbnail_path || photo.localThumbnailUri || !photo.localUri) {
				setGeneratedThumbnailUri(null);
				return;
			}

			try {
				const uri = await createVideoThumbnailUri(photo.localUri, 0);
				if (!cancelled) {
					setGeneratedThumbnailUri(uri);
				}
			} catch {
				if (!cancelled) {
					setGeneratedThumbnailUri(null);
				}
			}
		}

		void resolveVideoThumbnail();

		return () => {
			cancelled = true;
		};
	}, [isVideo, photo.localThumbnailUri, photo.localUri, photo.thumbnail_path]);

	useEffect(() => {
		let cancelled = false;

		async function resolvePendingPhotoThumbnail() {
			if (isVideo || !photo.isPending || photo.localThumbnailUri || !photo.localUri) {
				setPendingPhotoThumbnailUri(null);
				return;
			}

			const uri = await getOrCreatePhotoGridThumbnail(photo.id, photo.localUri);
			if (!cancelled) {
				setPendingPhotoThumbnailUri(uri);
			}
		}

		void resolvePendingPhotoThumbnail();

		return () => {
			cancelled = true;
		};
	}, [isVideo, photo.isPending, photo.localThumbnailUri, photo.localUri, photo.id]);

	const signedThumbnailUrl = useStorageUrl(photo.isPending ? null : photo.thumbnail_path);
	const signedPhotoUrl = usePhotoThumbnailUrl(photo.isPending ? null : photo.storage_path);

	const imageUri = (() => {
		if (photo.isPending) {
			if (isVideo) {
				return photo.localThumbnailUri || generatedThumbnailUri || null;
			}
			return photo.localThumbnailUri || pendingPhotoThumbnailUri || null;
		}

		if (isVideo) {
			return photo.localThumbnailUri || signedThumbnailUrl || generatedThumbnailUri;
		}

		return signedThumbnailUrl || signedPhotoUrl;
	})();

	const isSyncing = photo.isPending && photo.syncStatus === "syncing";
	const isFailed = photo.isPending && photo.syncStatus === "failed";
	const isQueued = photo.isPending && (photo.syncStatus === "pending" || !photo.syncStatus);
	const showPendingOverlay = photo.isPending;
	const uploaderInitial = photo.uploader?.display_name?.charAt(0).toUpperCase();

	return (
		<View style={[styles.tileShell, { width: tileSize }]}>
			<TouchableOpacity
				activeOpacity={0.9}
				style={[styles.tile, { width: tileSize }, isDark ? styles.tileDark : styles.tileLight]}
				onPress={() => onPhotoPress(photo, index)}
			>
				{imageUri ? (
					<Image
						source={{ uri: imageUri }}
						style={[styles.media, photo.isPending && styles.pendingImage]}
						contentFit="cover"
						cachePolicy="disk"
						priority="low"
						recyclingKey={photo.id}
						allowDownscaling
					/>
				) : (
					<View style={[styles.media, styles.placeholder]}>
						<FontAwesome
							name={isVideo ? "video-camera" : "image"}
							size={24}
							color={isDark ? "#5f6570" : "#9ca3af"}
						/>
					</View>
				)}

				<View style={styles.topRow}>
					{uploaderInitial && !photo.isPending ? (
						<View
							style={[
								styles.avatarBadge,
								{ backgroundColor: getAvatarColor(photo.uploader?.display_name || "R") },
							]}
						>
							<Text style={styles.avatarText}>{uploaderInitial}</Text>
						</View>
					) : (
						<View />
					)}
					{isVideo && (
						<View style={styles.kindBadge}>
							<FontAwesome name="play" size={9} color="#fff" style={styles.playGlyph} />
							<Text style={styles.kindBadgeText}>VID</Text>
						</View>
					)}
				</View>

				{isVideo && !photo.isPending && (
					<View style={styles.videoCenter}>
						<View style={styles.videoPlayButton}>
							<FontAwesome name="play" size={14} color="#fff" style={styles.playGlyph} />
						</View>
					</View>
				)}

				{photo.duration_milliseconds != null && photo.duration_milliseconds > 0 && (
					<View style={styles.durationBadge}>
						<Text style={styles.durationText}>{formatDuration(photo.duration_milliseconds)}</Text>
					</View>
				)}

				{showPendingOverlay && (
					<View style={styles.pendingOverlay}>
						<View style={styles.pendingBadge}>
							{isSyncing ? (
								<>
									<ActivityIndicator size="small" color="#fff" />
									<Text style={styles.pendingText}>Uploading</Text>
								</>
							) : isFailed ? (
								<>
									<FontAwesome name="warning" size={12} color="#fff" />
									<Text style={styles.pendingText}>Failed</Text>
								</>
							) : (
								<>
									<FontAwesome name="clock-o" size={12} color="#fff" />
									<Text style={styles.pendingText}>{isQueued ? "Queued" : "Pending"}</Text>
								</>
							)}
						</View>

						<View style={styles.pendingActions}>
							{isFailed && onRetry && (
								<TouchableOpacity
									style={[styles.actionChip, styles.actionChipPrimary]}
									onPress={() => onRetry(photo.id)}
									hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
								>
									<FontAwesome name="refresh" size={11} color="#fff" />
								</TouchableOpacity>
							)}
							{(isFailed || isQueued || isSyncing) && onSkip && (
								<TouchableOpacity
									style={styles.actionChip}
									onPress={() => onSkip(photo.id)}
									hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
								>
									<FontAwesome name="forward" size={10} color="#fff" />
								</TouchableOpacity>
							)}
							{(isFailed || isQueued || isSyncing) && onRemove && (
								<TouchableOpacity
									style={[styles.actionChip, styles.actionChipDanger]}
									onPress={() => onRemove(photo.id)}
									hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
								>
									<FontAwesome name="trash" size={10} color="#fff" />
								</TouchableOpacity>
							)}
						</View>
					</View>
				)}
			</TouchableOpacity>
		</View>
	);
}

const MemoizedGridTile = memo(GridTile);

export default function MasonryGrid({
	photos,
	onPhotoPress,
	onRetry,
	onSkip,
	onRemove,
	isDark,
}: MasonryGridProps) {
	const { width: screenWidth } = useWindowDimensions();
	const [gridColumns, setGridColumns] = useState<GridColumns>(3);
	const tileSize = useMemo(
		() => Math.floor((screenWidth - GRID_PADDING * 2 - GRID_GAP * (gridColumns - 1)) / gridColumns),
		[screenWidth, gridColumns]
	);

	const feedItems = useMemo(
		() =>
			photos.map((photo, index) => ({
				id: photo.id,
				photo,
				index,
			})),
		[photos]
	);

	const renderItem = useCallback(
		({ item }: { item: (typeof feedItems)[number] }) => (
			<MemoizedGridTile
				photo={item.photo}
				index={item.index}
				tileSize={tileSize}
				isDark={isDark}
				onPhotoPress={onPhotoPress}
				onRetry={onRetry}
				onSkip={onSkip}
				onRemove={onRemove}
			/>
		),
		[isDark, onPhotoPress, onRemove, onRetry, onSkip, tileSize]
	);

	if (photos.length === 0) {
		return null;
	}

	return (
		<View>
			<View style={styles.controlsRow}>
				<Text style={[styles.controlsLabel, isDark && styles.controlsLabelDark]}>Grid size</Text>
				<View style={[styles.controlsGroup, isDark && styles.controlsGroupDark]}>
					{GRID_DENSITY_OPTIONS.map((option) => {
						const isActive = option.columns === gridColumns;
						return (
							<TouchableOpacity
								key={option.columns}
								onPress={() => setGridColumns(option.columns)}
								activeOpacity={0.85}
								style={[
									styles.controlButton,
									isActive && styles.controlButtonActive,
									isDark && styles.controlButtonDark,
									isDark && isActive && styles.controlButtonActiveDark,
								]}
							>
								<Text
									style={[
										styles.controlButtonText,
										isDark && styles.controlButtonTextDark,
										isActive && styles.controlButtonTextActive,
										isDark && isActive && styles.controlButtonTextActiveDark,
									]}
								>
									{option.label}
								</Text>
							</TouchableOpacity>
						);
					})}
				</View>
			</View>

			<FlatList
				key={`grid-${gridColumns}`}
				data={feedItems}
				renderItem={renderItem}
				keyExtractor={(item) => item.id}
				numColumns={gridColumns}
				columnWrapperStyle={styles.row}
				contentContainerStyle={styles.container}
				showsVerticalScrollIndicator={false}
				scrollEnabled={false}
				initialNumToRender={9}
				maxToRenderPerBatch={6}
				windowSize={3}
				removeClippedSubviews
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	controlsRow: {
		paddingHorizontal: 16,
		paddingBottom: 12,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},
	controlsLabel: {
		fontSize: 12,
		fontWeight: "700",
		letterSpacing: 0.8,
		textTransform: "uppercase",
		color: "#6b7280",
	},
	controlsLabelDark: {
		color: "#8b93a7",
	},
	controlsGroup: {
		flexDirection: "row",
		alignItems: "center",
		padding: 4,
		borderRadius: 999,
		backgroundColor: "#e5e7eb",
	},
	controlsGroupDark: {
		backgroundColor: "#161b24",
	},
	controlButton: {
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 999,
	},
	controlButtonDark: {
		backgroundColor: "transparent",
	},
	controlButtonActive: {
		backgroundColor: "#fff",
	},
	controlButtonActiveDark: {
		backgroundColor: "#2a3242",
	},
	controlButtonText: {
		fontSize: 12,
		fontWeight: "700",
		color: "#4b5563",
	},
	controlButtonTextDark: {
		color: "#9ca3af",
	},
	controlButtonTextActive: {
		color: "#111827",
	},
	controlButtonTextActiveDark: {
		color: "#fff",
	},
	container: {
		paddingHorizontal: GRID_PADDING,
		paddingBottom: 24,
	},
	row: {
		gap: GRID_GAP,
		marginBottom: GRID_GAP,
	},
	tileShell: {},
	tile: {
		aspectRatio: 1,
		overflow: "hidden",
		position: "relative",
	},
	tileLight: {
		backgroundColor: "#d1d5db",
	},
	tileDark: {
		backgroundColor: "#131720",
	},
	media: {
		width: "100%",
		height: "100%",
	},
	placeholder: {
		alignItems: "center",
		justifyContent: "center",
	},
	pendingImage: {
		opacity: 0.68,
	},
	topRow: {
		position: "absolute",
		top: 7,
		left: 7,
		right: 7,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	avatarBadge: {
		width: 22,
		height: 22,
		borderRadius: 11,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarText: {
		color: "#fff",
		fontSize: 11,
		fontWeight: "700",
	},
	kindBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 6,
		paddingVertical: 4,
		backgroundColor: "rgba(15, 23, 42, 0.72)",
		borderRadius: 999,
	},
	kindBadgeText: {
		color: "#fff",
		fontSize: 9,
		fontWeight: "700",
		letterSpacing: 0.5,
	},
	videoCenter: {
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
	},
	videoPlayButton: {
		width: 34,
		height: 34,
		borderRadius: 17,
		backgroundColor: "rgba(0, 0, 0, 0.52)",
		alignItems: "center",
		justifyContent: "center",
	},
	playGlyph: {
		marginLeft: 2,
	},
	durationBadge: {
		position: "absolute",
		right: 7,
		bottom: 7,
		paddingHorizontal: 6,
		paddingVertical: 4,
		backgroundColor: "rgba(0, 0, 0, 0.72)",
		borderRadius: 999,
	},
	durationText: {
		color: "#fff",
		fontSize: 10,
		fontWeight: "700",
	},
	pendingOverlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(3, 7, 18, 0.42)",
		padding: 8,
		justifyContent: "space-between",
	},
	pendingBadge: {
		alignSelf: "flex-start",
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingHorizontal: 8,
		paddingVertical: 6,
		backgroundColor: "rgba(0, 0, 0, 0.56)",
		borderRadius: 999,
	},
	pendingText: {
		color: "#fff",
		fontSize: 10,
		fontWeight: "700",
	},
	pendingActions: {
		flexDirection: "row",
		alignSelf: "flex-end",
		gap: 6,
	},
	actionChip: {
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0, 0, 0, 0.58)",
	},
	actionChipPrimary: {
		backgroundColor: "rgba(37, 99, 235, 0.88)",
	},
	actionChipDanger: {
		backgroundColor: "rgba(190, 24, 93, 0.86)",
	},
});
