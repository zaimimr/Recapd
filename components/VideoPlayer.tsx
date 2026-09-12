import { useEvent, useEventListener } from "expo";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Icon from "@/components/ui/Icon";
import { useVideoPlaybackUri } from "@/lib/storage";
import type { MergedMediaItem } from "@/types/media";

interface VideoPlayerProps {
	media: MergedMediaItem;
	thumbnailUri?: string;
	autoPlay?: boolean;
	isActive?: boolean;
	nativeControls?: boolean;
	allowTapToggle?: boolean;
	muted?: boolean;
	loop?: boolean;
	onSurfaceTap?: () => void;
}

export default function VideoPlayer({
	media,
	thumbnailUri,
	autoPlay = false,
	isActive = true,
	nativeControls = true,
	allowTapToggle = false,
	muted = false,
	loop = false,
	onSurfaceTap,
}: VideoPlayerProps) {
	const videoUri = useVideoPlaybackUri(media);

	if (!videoUri) {
		return (
			<View style={styles.container}>
				{thumbnailUri && (
					<Image source={{ uri: thumbnailUri }} style={styles.thumbnail} contentFit="cover" />
				)}
				<View style={styles.centerOverlay} pointerEvents="none">
					<ActivityIndicator size="large" color="#fff" />
				</View>
			</View>
		);
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
			muted={muted}
			loop={loop}
			onSurfaceTap={onSurfaceTap}
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
	muted: boolean;
	loop: boolean;
	onSurfaceTap?: () => void;
}

function VideoPlayerContent({
	videoUri,
	thumbnailUri,
	autoPlay,
	isActive,
	nativeControls,
	allowTapToggle,
	muted,
	loop,
	onSurfaceTap,
}: VideoPlayerContentProps) {
	const player = useVideoPlayer(videoUri, (p) => {
		p.loop = loop;
		p.muted = muted;
		p.timeUpdateEventInterval = 0.25;
		p.bufferOptions = {
			preferredForwardBufferDuration: 5,
			minBufferForPlayback: 1,
			waitsToMinimizeStalling: false,
		};
		if (autoPlay && isActive) {
			p.play();
		}
	});

	const [hasRenderedFrame, setHasRenderedFrame] = useState(false);
	const [progress, setProgress] = useState(0);

	const { status } = useEvent(player, "statusChange", { status: player.status });
	const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });

	useEventListener(player, "timeUpdate", ({ currentTime }) => {
		const duration = player.duration;
		setProgress(duration > 0 ? Math.min(1, currentTime / duration) : 0);
	});

	useEffect(() => {
		if (isActive) {
			if (autoPlay) {
				player.currentTime = 0;
				player.play();
			}
			return;
		}
		player.pause();
	}, [isActive, autoPlay, player]);

	useEffect(() => {
		player.muted = muted;
	}, [muted, player]);

	useEffect(() => {
		player.loop = loop;
	}, [loop, player]);

	const isError = status === "error";
	const isLoading = !isError && status !== "readyToPlay";
	const isBuffering = status === "loading" && isPlaying;
	const showPoster = Boolean(thumbnailUri) && !hasRenderedFrame;
	const showPlayButton = !isError && !isLoading && !isPlaying;
	const showSpinner = isLoading || isBuffering;

	const handlePlayPause = useCallback(() => {
		if (isError) {
			player.replay();
			player.play();
			return;
		}
		if (isPlaying) {
			player.pause();
		} else {
			player.play();
		}
	}, [isError, isPlaying, player]);

	const handleSurfaceTap = useCallback(() => {
		onSurfaceTap?.();
		handlePlayPause();
	}, [onSurfaceTap, handlePlayPause]);

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
				onFirstFrameRender={() => setHasRenderedFrame(true)}
			/>

			{!nativeControls && allowTapToggle && (
				<Pressable style={styles.tapSurface} onPress={handleSurfaceTap} />
			)}

			{showSpinner && (
				<View style={styles.centerOverlay} pointerEvents="none">
					<ActivityIndicator size="large" color="#fff" />
				</View>
			)}

			{!nativeControls && showPlayButton && (
				<Pressable style={styles.centerOverlay} onPress={handleSurfaceTap}>
					<View style={styles.playButton}>
						<Icon name="play" size={18} color="#fff" style={styles.playIcon} />
					</View>
				</Pressable>
			)}

			{isError && (
				<Pressable style={styles.centerOverlay} onPress={handlePlayPause}>
					<View style={styles.errorBox}>
						<Icon name="alert-triangle" size={20} color="#fff" />
						<Text style={styles.errorText}>Couldn't play video</Text>
						<Text style={styles.errorRetry}>Tap to retry</Text>
					</View>
				</Pressable>
			)}

			{!nativeControls && !isError && (
				<View style={styles.progressTrack} pointerEvents="none">
					<View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
				</View>
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
	centerOverlay: {
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
	errorBox: {
		alignItems: "center",
		paddingHorizontal: 24,
		paddingVertical: 18,
		borderRadius: 14,
		backgroundColor: "rgba(0, 0, 0, 0.7)",
	},
	errorText: {
		color: "#fff",
		fontSize: 15,
		fontWeight: "600",
		marginTop: 10,
	},
	errorRetry: {
		color: "rgba(255, 255, 255, 0.7)",
		fontSize: 13,
		marginTop: 4,
	},
	progressTrack: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: 3,
		backgroundColor: "rgba(255, 255, 255, 0.2)",
	},
	progressFill: {
		height: 3,
		backgroundColor: "#fff",
	},
});
