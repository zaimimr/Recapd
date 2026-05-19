import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

type Props = {
	uri: string;
	width: number;
	height: number;
	active: boolean;
	muted?: boolean;
	onToggleMute?: (next: boolean) => void;
};

function formatTime(seconds: number) {
	if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
	const total = Math.floor(seconds);
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
}

export function InlineVideoPlayer({
	uri,
	width,
	height,
	active,
	muted = true,
	onToggleMute,
}: Props) {
	const [showChrome, setShowChrome] = useState(true);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [isMuted, setIsMuted] = useState(muted);
	const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const player = useVideoPlayer(uri, (p) => {
		p.loop = false;
		p.muted = muted;
		p.timeUpdateEventInterval = 0.25;
	});

	useEffect(() => {
		if (active) {
			player.play();
			setIsPlaying(true);
		} else {
			player.pause();
			setIsPlaying(false);
		}
	}, [active, player]);

	useEffect(() => {
		const sub = player.addListener("playingChange", ({ isPlaying: playing }) => {
			setIsPlaying(playing);
		});
		const timeSub = player.addListener("timeUpdate", ({ currentTime: t }) => {
			setCurrentTime(t);
		});
		const statusSub = player.addListener("statusChange", () => {
			if (player.duration && Number.isFinite(player.duration)) setDuration(player.duration);
		});
		return () => {
			sub.remove();
			timeSub.remove();
			statusSub.remove();
		};
	}, [player]);

	useEffect(() => {
		if (!showChrome || !isPlaying) return;
		if (idleTimer.current) clearTimeout(idleTimer.current);
		idleTimer.current = setTimeout(() => setShowChrome(false), 2000);
		return () => {
			if (idleTimer.current) clearTimeout(idleTimer.current);
		};
	}, [showChrome, isPlaying, currentTime]);

	const chromeOpacity = useSharedValue(1);
	useEffect(() => {
		chromeOpacity.value = withTiming(showChrome ? 1 : 0, { duration: 220 });
	}, [showChrome, chromeOpacity]);
	const chromeStyle = useAnimatedStyle(() => ({ opacity: chromeOpacity.value }));

	const togglePlay = () => {
		if (isPlaying) player.pause();
		else player.play();
		setShowChrome(true);
	};

	const toggleMute = () => {
		const next = !isMuted;
		player.muted = next;
		setIsMuted(next);
		onToggleMute?.(next);
		setShowChrome(true);
	};

	const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

	return (
		<Pressable onPress={() => setShowChrome((s) => !s)} style={[styles.root, { width, height }]}>
			<VideoView
				player={player}
				style={StyleSheet.absoluteFill}
				nativeControls={false}
				contentFit="contain"
			/>
			<Animated.View
				pointerEvents={showChrome ? "auto" : "none"}
				style={[styles.chrome, chromeStyle]}
			>
				<Pressable onPress={togglePlay} hitSlop={12} style={styles.centerButton}>
					<Ionicons name={isPlaying ? "pause" : "play"} size={28} color="#fff" />
				</Pressable>
				<View style={styles.bottomBar}>
					<Text style={styles.time}>{formatTime(currentTime)}</Text>
					<View style={styles.track}>
						<View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
					</View>
					<Text style={styles.time}>{formatTime(duration)}</Text>
					<Pressable onPress={toggleMute} hitSlop={10} style={styles.muteButton}>
						<Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={18} color="#fff" />
					</Pressable>
				</View>
			</Animated.View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	root: {
		backgroundColor: "#000",
		overflow: "hidden",
		position: "relative",
	},
	chrome: {
		...StyleSheet.absoluteFillObject,
		justifyContent: "space-between",
	},
	centerButton: {
		alignSelf: "center",
		marginTop: "auto",
		marginBottom: "auto",
		width: 64,
		height: 64,
		borderRadius: 32,
		backgroundColor: "rgba(0,0,0,0.45)",
		alignItems: "center",
		justifyContent: "center",
	},
	bottomBar: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 14,
		paddingVertical: 12,
		paddingBottom: 20,
		backgroundColor: "rgba(0,0,0,0.35)",
	},
	time: {
		color: "#fff",
		fontSize: 12,
		fontVariant: ["tabular-nums"],
		minWidth: 36,
	},
	track: {
		flex: 1,
		height: 3,
		backgroundColor: "rgba(255,255,255,0.3)",
		borderRadius: 2,
		overflow: "hidden",
	},
	trackFill: {
		height: "100%",
		backgroundColor: "#fff",
	},
	muteButton: {
		paddingHorizontal: 6,
		paddingVertical: 4,
	},
});
