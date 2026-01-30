import { useVideoPlayer, VideoView } from "expo-video";
import { Dimensions, StyleSheet, View } from "react-native";
import { getMediaUrl } from "@/lib/storage";
import type { MergedMediaItem } from "./MomentCluster";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface VideoPlayerProps {
	media: MergedMediaItem;
}

export default function VideoPlayer({ media }: VideoPlayerProps) {
	const videoUri =
		media.isPending && media.localUri ? media.localUri : getMediaUrl(media.storage_path);

	const player = useVideoPlayer(videoUri, (player) => {
		player.loop = false;
	});

	return (
		<View style={styles.container}>
			<VideoView player={player} style={styles.video} contentFit="contain" nativeControls />
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		width: SCREEN_WIDTH,
		height: SCREEN_HEIGHT,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "#000",
	},
	video: {
		width: SCREEN_WIDTH,
		height: SCREEN_HEIGHT * 0.75,
	},
});
