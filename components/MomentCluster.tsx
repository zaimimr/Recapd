import FontAwesome from "@expo/vector-icons/FontAwesome";
import Ionicons from "@expo/vector-icons/Ionicons";
import { format } from "date-fns";
import {
	ActivityIndicator,
	Dimensions,
	Image,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { getAvatarColor } from "@/lib/colors";
import { getPhotoUrl } from "@/lib/storage";
import { formatDuration } from "@/lib/utils";
import type { MediaItemWithUser } from "@/types/database";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CLUSTER_PHOTO_HEIGHT = 200;
const CLUSTER_THRESHOLD_MS = 60000;

export interface MergedMediaItem extends MediaItemWithUser {
	isPending?: boolean;
	localUri?: string;
	syncStatus?: string;
}

export interface Cluster {
	time: string;
	photos: MergedMediaItem[];
}

interface MomentClusterProps {
	photos: MergedMediaItem[];
	onPhotoPress: (photo: MergedMediaItem, index: number, allPhotos: MergedMediaItem[]) => void;
	onRetry?: (id: string) => void;
	isDark: boolean;
}

interface ClusterRowProps {
	cluster: Cluster;
	clusterIndex: number;
	globalStartIndex: number;
	allPhotos: MergedMediaItem[];
	onPhotoPress: (photo: MergedMediaItem, index: number, allPhotos: MergedMediaItem[]) => void;
	onRetry?: (id: string) => void;
	isDark: boolean;
}

export function clusterPhotos(photos: MergedMediaItem[]): Cluster[] {
	if (!photos.length) return [];

	const sorted = [...photos].sort(
		(a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
	);

	const clusters: Cluster[] = [];
	let current: MergedMediaItem[] = [sorted[0]];

	for (let i = 1; i < sorted.length; i++) {
		const prevTime = new Date(sorted[i - 1].captured_at).getTime();
		const currTime = new Date(sorted[i].captured_at).getTime();

		if (currTime - prevTime <= CLUSTER_THRESHOLD_MS) {
			current.push(sorted[i]);
		} else {
			clusters.push({ time: current[0].captured_at, photos: current });
			current = [sorted[i]];
		}
	}

	clusters.push({ time: current[0].captured_at, photos: current });
	return clusters;
}

function ClusterRow({
	cluster,
	globalStartIndex,
	allPhotos,
	onPhotoPress,
	onRetry,
	isDark,
}: ClusterRowProps) {
	const isSinglePhoto = cluster.photos.length === 1;

	return (
		<View style={styles.clusterContainer}>
			<Text style={[styles.clusterTime, isDark && styles.textMuted]}>
				{format(new Date(cluster.time), "h:mm a")}
			</Text>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.clusterScroll}
				scrollEnabled={!isSinglePhoto}
			>
				{cluster.photos.map((photo, idx) => {
					const globalIndex = globalStartIndex + idx;
					const aspectRatio = photo.width && photo.height ? photo.width / photo.height : 1;
					const photoWidth = isSinglePhoto
						? SCREEN_WIDTH - 48
						: Math.min(CLUSTER_PHOTO_HEIGHT * aspectRatio, SCREEN_WIDTH * 0.7);

					// For videos, use thumbnail_path if available
					const getImageUri = () => {
						if (photo.isPending && photo.localUri) {
							return photo.localUri;
						}
						if (photo.media_type === "video") {
							// Only return thumbnail if available, otherwise null
							return photo.thumbnail_path ? getPhotoUrl(photo.thumbnail_path) : null;
						}
						return getPhotoUrl(photo.storage_path);
					};

					const imageUri = getImageUri();

					const isSyncing = photo.isPending && photo.syncStatus === "syncing";
					const isFailed = photo.isPending && photo.syncStatus === "failed";

					return (
						<TouchableOpacity
							key={photo.id}
							style={[
								styles.clusterPhoto,
								{
									width: photoWidth,
									height: CLUSTER_PHOTO_HEIGHT,
									backgroundColor: photo.dominant_color || "#1a1a1a",
								},
							]}
							onPress={() => onPhotoPress(photo, globalIndex, allPhotos)}
							activeOpacity={0.9}
						>
							{imageUri ? (
								<Image
									source={{ uri: imageUri }}
									style={[styles.clusterImage, photo.isPending && styles.pendingImage]}
									resizeMode="cover"
									blurRadius={photo.isPending && photo.syncStatus !== "failed" ? 2 : 0}
								/>
							) : (
								<View style={styles.videoPlaceholder}>
									<Ionicons name="videocam" size={32} color="#666" />
								</View>
							)}

							{photo.isPending && (
								<View style={styles.syncOverlay}>
									{isSyncing && (
										<View style={styles.syncBadge}>
											<ActivityIndicator size="small" color="#fff" />
										</View>
									)}
									{isFailed && (
										<TouchableOpacity style={styles.retryBadge} onPress={() => onRetry?.(photo.id)}>
											<FontAwesome name="refresh" size={16} color="#fff" />
											<Text style={styles.retryText}>Retry</Text>
										</TouchableOpacity>
									)}
								</View>
							)}

							{photo.media_type === "video" && !photo.isPending && (
								<>
									<View style={styles.videoPlayOverlay}>
										<View style={styles.videoPlayButton}>
											<FontAwesome
												name="play"
												size={20}
												color="#fff"
												style={styles.videoPlayIcon}
											/>
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
								<View
									style={[
										styles.avatarBadge,
										{
											backgroundColor: getAvatarColor(photo.uploader.display_name),
										},
									]}
								>
									<Text style={styles.avatarInitial}>
										{photo.uploader.display_name.charAt(0).toUpperCase()}
									</Text>
								</View>
							)}
						</TouchableOpacity>
					);
				})}
			</ScrollView>
		</View>
	);
}

export default function MomentCluster({
	photos,
	onPhotoPress,
	onRetry,
	isDark,
}: MomentClusterProps) {
	const clusters = clusterPhotos(photos);
	let globalIndex = 0;

	return (
		<View style={styles.container}>
			{clusters.map((cluster, clusterIdx) => {
				const startIndex = globalIndex;
				globalIndex += cluster.photos.length;
				return (
					<ClusterRow
						key={`cluster-${clusterIdx}-${cluster.time}`}
						cluster={cluster}
						clusterIndex={clusterIdx}
						globalStartIndex={startIndex}
						allPhotos={photos}
						onPhotoPress={onPhotoPress}
						onRetry={onRetry}
						isDark={isDark}
					/>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		gap: 24,
	},
	clusterContainer: {
		gap: 8,
	},
	clusterTime: {
		fontSize: 14,
		fontWeight: "600",
		color: "#666",
		paddingHorizontal: 0,
	},
	clusterScroll: {
		gap: 8,
	},
	clusterPhoto: {
		borderRadius: 12,
		overflow: "hidden",
	},
	clusterImage: {
		width: "100%",
		height: "100%",
	},
	pendingImage: {
		opacity: 0.8,
	},
	syncOverlay: {
		...StyleSheet.absoluteFillObject,
		justifyContent: "center",
		alignItems: "center",
	},
	syncBadge: {
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		padding: 12,
		borderRadius: 24,
	},
	retryBadge: {
		backgroundColor: "#ef4444",
		paddingVertical: 8,
		paddingHorizontal: 16,
		borderRadius: 20,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	retryText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "600",
	},
	avatarBadge: {
		position: "absolute",
		bottom: 8,
		left: 8,
		width: 28,
		height: 28,
		borderRadius: 14,
		justifyContent: "center",
		alignItems: "center",
		borderWidth: 2,
		borderColor: "#fff",
	},
	avatarInitial: {
		color: "#fff",
		fontSize: 12,
		fontWeight: "700",
	},
	textMuted: {
		color: "#888",
	},
	videoPlayOverlay: {
		...StyleSheet.absoluteFillObject,
		justifyContent: "center",
		alignItems: "center",
	},
	videoPlayButton: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		justifyContent: "center",
		alignItems: "center",
	},
	videoPlayIcon: {
		marginLeft: 4,
	},
	videoDurationBadge: {
		position: "absolute",
		top: 8,
		right: 8,
		backgroundColor: "rgba(0, 0, 0, 0.7)",
		paddingHorizontal: 6,
		paddingVertical: 3,
		borderRadius: 4,
	},
	videoDurationText: {
		color: "#fff",
		fontSize: 12,
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
