import Feather from "@expo/vector-icons/Feather";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import type { ReactElement } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	ActivityIndicator,
	Animated,
	Easing,
	type NativeScrollEvent,
	type RefreshControlProps,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { radius, space, theme, type } from "@/constants/theme";
import { getAvatarColor } from "@/lib/colors";
import {
	createVideoThumbnailUri,
	getOrCreatePhotoGridThumbnail,
	usePhotoThumbnailUrl,
	useStorageUrl,
} from "@/lib/storage";
import { formatDuration } from "@/lib/utils";
import type { MergedMediaItem } from "@/types/media";
import { useImageMemoryGuard } from "./useImageMemoryGuard";

const _GRID_GAP = 2;
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
	headerComponent?: ReactElement | null;
	emptyComponent?: ReactElement | null;
	refreshControl?: ReactElement<RefreshControlProps>;
	/** Reports vertical offset so a caller can collapse or reveal its own chrome. */
	onScroll?: (offsetY: number) => void;
}

function GridTile({
	photo,
	index,
	onPhotoPress,
	onRetry,
	onSkip,
	onRemove,
}: {
	photo: MergedMediaItem;
	index: number;
	onPhotoPress: (photo: MergedMediaItem, index: number) => void;
	onRetry?: (id: string) => void;
	onSkip?: (id: string) => void;
	onRemove?: (id: string) => void;
}) {
	const isVideo = photo.media_type === "video";
	const blurhash = (photo as { blurhash?: string | null }).blurhash ?? null;
	const [generatedThumbnailUri, setGeneratedThumbnailUri] = useState<string | null>(null);
	const [pendingPhotoThumbnailUri, setPendingPhotoThumbnailUri] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function resolvePendingVideoThumbnail() {
			if (!isVideo || !photo.isPending || photo.localThumbnailUri || !photo.localUri) {
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

		void resolvePendingVideoThumbnail();

		return () => {
			cancelled = true;
		};
	}, [isVideo, photo.isPending, photo.localThumbnailUri, photo.localUri]);

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

	const isHeic = /\.(heic|heif)$/i.test(photo.storage_path);
	const legacyTransformPath =
		!photo.isPending && !photo.thumbnail_path && !isHeic ? photo.storage_path : null;
	const legacyTransformUrl = usePhotoThumbnailUrl(legacyTransformPath);

	const imageUri = (() => {
		if (photo.isPending) {
			if (isVideo) {
				return photo.localThumbnailUri || generatedThumbnailUri || null;
			}
			return photo.localThumbnailUri || pendingPhotoThumbnailUri || null;
		}

		return signedThumbnailUrl || legacyTransformUrl;
	})();

	// The one authored moment: a photo landing in the feed settles into place.
	// Exponential ease-out from an already-visible default, so a tile that never
	// animates (recycled, cached) still reads as finished.
	const arrival = useRef(new Animated.Value(photo.isPending ? 1 : 0)).current;
	const hasArrived = useRef(false);

	useEffect(() => {
		if (hasArrived.current || !imageUri || photo.isPending) return;
		hasArrived.current = true;
		Animated.timing(arrival, {
			toValue: 1,
			duration: 320,
			easing: Easing.out(Easing.cubic),
			useNativeDriver: true,
		}).start();
	}, [imageUri, photo.isPending, arrival]);

	const isSyncing = photo.isPending && photo.syncStatus === "syncing";
	const isFailed = photo.isPending && photo.syncStatus === "failed";
	const isQueued = photo.isPending && (photo.syncStatus === "pending" || !photo.syncStatus);
	const showPendingOverlay = photo.isPending;
	const uploaderInitial = photo.uploader?.display_name?.charAt(0).toUpperCase();

	return (
		<Animated.View
			style={[
				styles.tileShell,
				{
					opacity: arrival,
					transform: [
						{
							scale: arrival.interpolate({
								inputRange: [0, 1],
								outputRange: [0.94, 1],
							}),
						},
					],
				},
			]}
		>
			<TouchableOpacity
				activeOpacity={0.9}
				style={styles.tile}
				onPress={() => onPhotoPress(photo, index)}
			>
				{imageUri ? (
					<Image
						source={{ uri: imageUri }}
						style={[styles.media, photo.isPending && styles.pendingImage]}
						placeholder={blurhash ? { blurhash } : undefined}
						placeholderContentFit="cover"
						contentFit="cover"
						cachePolicy="disk"
						priority="low"
						recyclingKey={photo.id}
						transition={120}
						allowDownscaling
					/>
				) : blurhash ? (
					<Image
						style={styles.media}
						placeholder={{ blurhash }}
						placeholderContentFit="cover"
						contentFit="cover"
						recyclingKey={photo.id}
					/>
				) : (
					<View style={[styles.media, styles.placeholder]}>
						<Feather name={isVideo ? "video" : "image"} size={22} color={theme.textDisabled} />
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
							<Feather name="play" size={9} color="#fff" />
							<Text style={styles.kindBadgeText}>VID</Text>
						</View>
					)}
				</View>

				{isVideo && !photo.isPending && (
					<View style={styles.videoCenter}>
						<View style={styles.videoPlayButton}>
							<Feather name="play" size={14} color="#fff" />
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
									<Feather name="alert-triangle" size={12} color="#fff" />
									<Text style={styles.pendingText}>Failed</Text>
								</>
							) : (
								<>
									<Feather name="clock" size={12} color="#fff" />
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
									<Feather name="refresh-cw" size={11} color="#fff" />
								</TouchableOpacity>
							)}
							{(isFailed || isQueued || isSyncing) && onSkip && (
								<TouchableOpacity
									style={styles.actionChip}
									onPress={() => onSkip(photo.id)}
									hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
								>
									<Feather name="skip-forward" size={10} color="#fff" />
								</TouchableOpacity>
							)}
							{(isFailed || isQueued || isSyncing) && onRemove && (
								<TouchableOpacity
									style={[styles.actionChip, styles.actionChipDanger]}
									onPress={() => onRemove(photo.id)}
									hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
								>
									<Feather name="trash-2" size={10} color="#fff" />
								</TouchableOpacity>
							)}
						</View>
					</View>
				)}
			</TouchableOpacity>
		</Animated.View>
	);
}

const MemoizedGridTile = memo(GridTile);

function SkeletonTile({ syncing }: { syncing: boolean }) {
	const pulse = useRef(new Animated.Value(0.45)).current;

	useEffect(() => {
		const loop = Animated.loop(
			Animated.sequence([
				Animated.timing(pulse, {
					toValue: 1,
					duration: 760,
					easing: Easing.inOut(Easing.quad),
					useNativeDriver: true,
				}),
				Animated.timing(pulse, {
					toValue: 0.45,
					duration: 760,
					easing: Easing.inOut(Easing.quad),
					useNativeDriver: true,
				}),
			])
		);
		loop.start();
		return () => loop.stop();
	}, [pulse]);

	return (
		<View style={styles.tileShell}>
			<View style={styles.tile}>
				<Animated.View style={[StyleSheet.absoluteFill, styles.skeletonFill, { opacity: pulse }]} />
				<View style={styles.skeletonCenter}>
					<ActivityIndicator size="small" color={theme.textMuted} />
				</View>
				<View style={styles.skeletonBadge}>
					{syncing ? (
						<ActivityIndicator size="small" color="#fff" />
					) : (
						<Feather name="clock" size={12} color="#fff" />
					)}
					<Text style={styles.pendingText}>{syncing ? "Uploading" : "Waiting"}</Text>
				</View>
			</View>
		</View>
	);
}

const MemoizedSkeletonTile = memo(SkeletonTile);

export default function MasonryGrid({
	photos,
	onPhotoPress,
	onRetry,
	onSkip,
	onRemove,
	headerComponent,
	emptyComponent,
	refreshControl,
	onScroll,
}: MasonryGridProps) {
	const [gridColumns, setGridColumns] = useState<GridColumns>(3);

	useImageMemoryGuard();

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
		({ item }: { item: (typeof feedItems)[number] }) =>
			item.photo.isSkeleton ? (
				<MemoizedSkeletonTile syncing={item.photo.syncStatus === "syncing"} />
			) : (
				<MemoizedGridTile
					photo={item.photo}
					index={item.index}
					onPhotoPress={onPhotoPress}
					onRetry={onRetry}
					onSkip={onSkip}
					onRemove={onRemove}
				/>
			),
		[onPhotoPress, onRemove, onRetry, onSkip]
	);

	const getItemType = useCallback(
		(item: (typeof feedItems)[number]) =>
			item.photo.isSkeleton ? "skeleton" : item.photo.isPending ? "pending" : "uploaded",
		[]
	);

	const listHeader = (
		<>
			{headerComponent}
			{photos.length > 0 && (
				<View style={styles.controlsRow}>
					<Text style={styles.controlsLabel}>GRID</Text>
					<View style={styles.controlsGroup}>
						{GRID_DENSITY_OPTIONS.map((option) => {
							const isActive = option.columns === gridColumns;
							return (
								<TouchableOpacity
									key={option.columns}
									onPress={() => setGridColumns(option.columns)}
									activeOpacity={0.85}
									accessibilityRole="button"
									accessibilityState={{ selected: isActive }}
									accessibilityLabel={`${option.label} grid`}
									style={[styles.controlButton, isActive && styles.controlButtonActive]}
								>
									<Text
										style={[styles.controlButtonText, isActive && styles.controlButtonTextActive]}
									>
										{option.label}
									</Text>
								</TouchableOpacity>
							);
						})}
					</View>
				</View>
			)}
		</>
	);

	return (
		<FlashList
			key={`grid-${gridColumns}`}
			data={feedItems}
			renderItem={renderItem}
			keyExtractor={(item) => item.id}
			getItemType={getItemType}
			numColumns={gridColumns}
			masonry
			contentContainerStyle={styles.container}
			showsVerticalScrollIndicator={false}
			ListHeaderComponent={listHeader}
			ListEmptyComponent={emptyComponent ?? null}
			refreshControl={refreshControl}
			onScroll={
				onScroll
					? (event: { nativeEvent: NativeScrollEvent }) =>
							onScroll(event.nativeEvent.contentOffset.y)
					: undefined
			}
			scrollEventThrottle={32}
			drawDistance={250}
			maxItemsInRecyclePool={Math.max(gridColumns * 8, 24)}
		/>
	);
}

const styles = StyleSheet.create({
	controlsRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: space.lg,
		paddingBottom: space.md,
	},
	controlsLabel: {
		...type.eyebrow,
		color: theme.textMuted,
	},
	controlsGroup: {
		flexDirection: "row",
		backgroundColor: theme.cardElevated,
		borderRadius: radius.pill,
		borderWidth: 1,
		borderColor: theme.border,
		padding: 3,
		gap: 2,
	},
	controlButton: {
		paddingHorizontal: 13,
		paddingVertical: 6,
		borderRadius: radius.pill,
	},
	controlButtonActive: {
		backgroundColor: theme.accentSurfaceStrong,
	},
	controlButtonText: {
		fontSize: 12,
		fontWeight: "700",
		color: theme.textMuted,
	},
	controlButtonTextActive: {
		color: theme.accentSoft,
	},

	container: {
		paddingBottom: space.huge,
	},
	tileShell: {
		padding: GRID_PADDING,
	},
	tile: {
		flex: 1,
		overflow: "hidden",
		borderRadius: radius.sm,
		backgroundColor: theme.cardElevated,
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
		opacity: 0.4,
	},
	skeletonFill: {
		backgroundColor: theme.cardElevated,
	},
	skeletonCenter: {
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
	},
	skeletonBadge: {
		position: "absolute",
		left: 6,
		bottom: 6,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 7,
		paddingVertical: 4,
		borderRadius: radius.pill,
		backgroundColor: "rgba(0,0,0,0.6)",
	},

	topRow: {
		position: "absolute",
		top: 5,
		left: 5,
		right: 5,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	avatarBadge: {
		width: 18,
		height: 18,
		borderRadius: 9,
		alignItems: "center",
		justifyContent: "center",
	},
	avatarText: {
		fontSize: 9,
		fontWeight: "800",
		color: "#FFFFFF",
	},
	kindBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		paddingHorizontal: 6,
		paddingVertical: 3,
		borderRadius: radius.pill,
		backgroundColor: "rgba(0,0,0,0.6)",
	},
	kindBadgeText: {
		fontSize: 8.5,
		fontWeight: "800",
		letterSpacing: 0.4,
		color: "#FFFFFF",
	},

	videoCenter: {
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
	},
	videoPlayButton: {
		width: 38,
		height: 38,
		borderRadius: 19,
		backgroundColor: "rgba(0,0,0,0.45)",
		alignItems: "center",
		justifyContent: "center",
		paddingLeft: 2,
	},
	durationBadge: {
		position: "absolute",
		right: 5,
		bottom: 5,
		paddingHorizontal: 6,
		paddingVertical: 3,
		borderRadius: radius.pill,
		backgroundColor: "rgba(0,0,0,0.6)",
	},
	durationText: {
		fontSize: 9.5,
		fontWeight: "700",
		color: "#FFFFFF",
	},

	pendingOverlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(7,7,12,0.55)",
		alignItems: "center",
		justifyContent: "center",
		gap: space.sm,
	},
	pendingBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		paddingHorizontal: 9,
		paddingVertical: 5,
		borderRadius: radius.pill,
		backgroundColor: "rgba(0,0,0,0.55)",
	},
	pendingText: {
		fontSize: 10.5,
		fontWeight: "700",
		color: "#FFFFFF",
	},
	pendingActions: {
		flexDirection: "row",
		gap: 6,
	},
	actionChip: {
		width: 28,
		height: 28,
		borderRadius: 14,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(255,255,255,0.16)",
	},
	actionChipPrimary: {
		backgroundColor: theme.accent,
	},
	actionChipDanger: {
		backgroundColor: theme.danger,
	},
});
