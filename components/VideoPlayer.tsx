import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useVideoPlaybackUri } from "@/lib/storage";
import type { MergedMediaItem } from "./MomentCluster";

interface VideoPlayerProps {
	media: MergedMediaItem;
	thumbnailUri?: string;
	autoPlay?: boolean;
	isActive?: boolean;
	nativeControls?: boolean;
	allowTapToggle?: boolean;
}

export default function VideoPlayer({
	media,
	thumbnailUri,
	autoPlay = false,
	isActive = true,
	nativeControls = true,
	allowTapToggle = false,
}: VideoPlayerProps) {
	const [showPoster, setShowPoster] = useState(Boolean(thumbnailUri));
	const [showPlayOverlay, setShowPlayOverlay] = useState(!autoPlay);
	const [isPlaying, setIsPlaying] = useState(autoPlay);
	const videoUri = useVideoPlaybackUri(media);

	if (!videoUri) {
		return <View style={styles.container} />;
	}

	return (
		<VideoPlayerContent
			key={videoUri}
			videoUri={videoUri}
			thumbnailUri={thumbnailUri}
			autoPlay={autoPlay}
			isActive={isActive}
			nativeControls={nativeControls}
			allowTapToggle={allowTapToggle}
			showPoster={showPoster}
			showPlayOverlay={showPlayOverlay}
			isPlaying={isPlaying}
			setShowPoster={setShowPoster}
			setShowPlayOverlay={setShowPlayOverlay}
			setIsPlaying={setIsPlaying}
		/>
	);
}

interface VideoPlayerContentProps {
	videoUri: string;
	thumbnailUri?: string;
	autoPlay: boolean;
	isActive: boolean;
	nativeControls: boolean;
	allowTapToggle: boolean;
	showPoster: boolean;
	showPlayOverlay: boolean;
	isPlaying: boolean;
	setShowPoster: Dispatch<SetStateAction<boolean>>;
	setShowPlayOverlay: Dispatch<SetStateAction<boolean>>;
	setIsPlaying: Dispatch<SetStateAction<boolean>>;
}

function VideoPlayerContent({
	videoUri,
	thumbnailUri,
	autoPlay,
	isActive,
	nativeControls,
	allowTapToggle,
	showPoster,
	showPlayOverlay,
	isPlaying,
	setShowPoster,
	setShowPlayOverlay,
	setIsPlaying,
}: VideoPlayerContentProps) {
	const player = useVideoPlayer(videoUri, (player) => {
		player.loop = false;
		if (autoPlay && isActive) {
			player.play();
		}
	});

	useEffect(() => {
		setShowPoster(Boolean(thumbnailUri));
		setShowPlayOverlay(!autoPlay);
		setIsPlaying(autoPlay && isActive);
	}, [autoPlay, isActive, setIsPlaying, setShowPlayOverlay, setShowPoster, thumbnailUri]);

	const handleStartPlayback = useCallback(() => {
		setShowPoster(false);
		setShowPlayOverlay(false);
		setIsPlaying(true);
		player.play();
	}, [player, setIsPlaying, setShowPlayOverlay, setShowPoster]);

	const handleTogglePlayback = useCallback(() => {
		if (!allowTapToggle) return;

		if (isPlaying) {
			player.pause();
			setIsPlaying(false);
			setShowPlayOverlay(true);
			return;
		}

		handleStartPlayback();
	}, [allowTapToggle, handleStartPlayback, isPlaying, player, setIsPlaying, setShowPlayOverlay]);

	useEffect(() => {
		if (isActive) return;

		player.pause();
		setIsPlaying(false);
		setShowPlayOverlay(true);
	}, [isActive, player, setIsPlaying, setShowPlayOverlay]);

	useEffect(() => {
		if (!isActive || !autoPlay) return;

		player.currentTime = 0;
		setShowPoster(false);
		setShowPlayOverlay(false);
		setIsPlaying(true);
		player.play();
	}, [autoPlay, isActive, player, setIsPlaying, setShowPlayOverlay, setShowPoster]);

	return (
		<View style={styles.container}>
			{showPoster && thumbnailUri && (
				<Image
					source={{ uri: thumbnailUri }}
					style={styles.thumbnail}
					contentFit="cover"
					pointerEvents="none"
				/>
			)}
			<VideoView
				player={player}
				style={styles.video}
				contentFit="contain"
				nativeControls={nativeControls}
				allowsVideoFrameAnalysis={false}
				fullscreenOptions={{ enable: true }}
				onFirstFrameRender={() => setShowPoster(false)}
			/>
			{allowTapToggle && <Pressable style={styles.tapSurface} onPress={handleTogglePlayback} />}
			{showPlayOverlay && (
				<Pressable style={styles.playOverlay} onPress={handleStartPlayback}>
					<View style={styles.playButton}>
						<FontAwesome name="play" size={18} color="#fff" style={styles.playIcon} />
					</View>
				</Pressable>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "#000",
	},
	thumbnail: {
		...StyleSheet.absoluteFillObject,
	},
	video: {
		...StyleSheet.absoluteFillObject,
	},
	tapSurface: {
		...StyleSheet.absoluteFillObject,
	},
	playOverlay: {
		...StyleSheet.absoluteFillObject,
		justifyContent: "center",
		alignItems: "center",
	},
	playButton: {
		width: 58,
		height: 58,
		borderRadius: 29,
		backgroundColor: "rgba(0, 0, 0, 0.58)",
		justifyContent: "center",
		alignItems: "center",
	},
	playIcon: {
		marginLeft: 3,
	},
});
