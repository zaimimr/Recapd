import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from "react-native-reanimated";
import { InlineVideoPlayer } from "@/components/video/InlineVideoPlayer";
import { ViewerImage } from "@/components/viewer/ViewerImage";
import { getOriginalUrl } from "@/lib/thumbnails";
import type { GalleryMediaItem } from "@/types/media";

type Props = {
	item: GalleryMediaItem;
	width: number;
	height: number;
	active: boolean;
	onRequestDismiss: () => void;
	onZoomActiveChange?: (zoomed: boolean) => void;
};

const MAX_SCALE = 4;
const MIN_SCALE = 1;
const DOUBLE_TAP_SCALE = 2;
const DISMISS_TRANSLATION = 140;
const DISMISS_VELOCITY = 1100;

export function ZoomPanItem({
	item,
	width,
	height,
	active,
	onRequestDismiss,
	onZoomActiveChange,
}: Props) {
	const scale = useSharedValue(1);
	const savedScale = useSharedValue(1);
	const translateX = useSharedValue(0);
	const translateY = useSharedValue(0);
	const savedTranslateX = useSharedValue(0);
	const savedTranslateY = useSharedValue(0);
	const dismissProgress = useSharedValue(0);

	const reset = useCallback(() => {
		scale.value = withTiming(1);
		savedScale.value = 1;
		translateX.value = withTiming(0);
		translateY.value = withTiming(0);
		savedTranslateX.value = 0;
		savedTranslateY.value = 0;
		onZoomActiveChange?.(false);
	}, [
		scale,
		savedScale,
		translateX,
		translateY,
		savedTranslateX,
		savedTranslateY,
		onZoomActiveChange,
	]);

	useEffect(() => {
		if (!active) reset();
	}, [active, reset]);

	const reportZoom = useCallback(
		(zoomed: boolean) => {
			onZoomActiveChange?.(zoomed);
		},
		[onZoomActiveChange]
	);

	const pinch = Gesture.Pinch()
		.onStart(() => {
			savedScale.value = scale.value;
		})
		.onUpdate((e) => {
			const next = Math.max(MIN_SCALE * 0.7, Math.min(MAX_SCALE * 1.1, savedScale.value * e.scale));
			scale.value = next;
		})
		.onEnd(() => {
			if (scale.value < MIN_SCALE) {
				scale.value = withSpring(MIN_SCALE);
				translateX.value = withSpring(0);
				translateY.value = withSpring(0);
				savedTranslateX.value = 0;
				savedTranslateY.value = 0;
				runOnJS(reportZoom)(false);
			} else if (scale.value > MAX_SCALE) {
				scale.value = withSpring(MAX_SCALE);
				runOnJS(reportZoom)(true);
			} else {
				runOnJS(reportZoom)(scale.value > 1.02);
			}
		});

	const pan = Gesture.Pan()
		.maxPointers(1)
		.onStart(() => {
			savedTranslateX.value = translateX.value;
			savedTranslateY.value = translateY.value;
		})
		.onUpdate((e) => {
			if (scale.value > 1.02) {
				translateX.value = savedTranslateX.value + e.translationX;
				translateY.value = savedTranslateY.value + e.translationY;
			} else if (e.translationY > 0) {
				const damped = e.translationY ** 0.85;
				translateY.value = damped;
				dismissProgress.value = Math.min(1, e.translationY / 320);
				scale.value = Math.max(0.7, 1 - e.translationY / 1600);
			}
		})
		.onEnd((e) => {
			if (scale.value > 1.02) {
				return;
			}
			if (e.translationY > DISMISS_TRANSLATION || e.velocityY > DISMISS_VELOCITY) {
				translateY.value = withTiming(height, { duration: 220 });
				scale.value = withTiming(0.85, { duration: 220 });
				dismissProgress.value = withTiming(1, { duration: 220 });
				runOnJS(onRequestDismiss)();
			} else {
				translateX.value = withSpring(0);
				translateY.value = withSpring(0);
				scale.value = withSpring(1);
				dismissProgress.value = withSpring(0);
			}
		});

	const doubleTap = Gesture.Tap()
		.numberOfTaps(2)
		.maxDuration(280)
		.onEnd(() => {
			if (scale.value > 1.05) {
				scale.value = withSpring(MIN_SCALE);
				translateX.value = withSpring(0);
				translateY.value = withSpring(0);
				savedTranslateX.value = 0;
				savedTranslateY.value = 0;
				runOnJS(reportZoom)(false);
			} else {
				scale.value = withSpring(DOUBLE_TAP_SCALE);
				runOnJS(reportZoom)(true);
			}
		});

	const composed = Gesture.Simultaneous(pinch, Gesture.Race(doubleTap, pan));

	const animatedStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: translateX.value },
			{ translateY: translateY.value },
			{ scale: scale.value },
		],
	}));

	const backdropStyle = useAnimatedStyle(() => ({
		opacity: 1 - dismissProgress.value * 0.9,
	}));

	return (
		<View style={[styles.container, { width, height }]}>
			<Animated.View
				pointerEvents="none"
				style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
			/>
			<GestureDetector gesture={composed}>
				<Animated.View style={[styles.inner, animatedStyle, { width, height }]}>
					{item.is_video ? (
						<VideoBody item={item} width={width} height={height} active={active} />
					) : (
						<ViewerImage item={item} width={width} height={height} />
					)}
				</Animated.View>
			</GestureDetector>
		</View>
	);
}

function VideoBody({
	item,
	width,
	height,
	active,
}: {
	item: GalleryMediaItem;
	width: number;
	height: number;
	active: boolean;
}) {
	const [url, setUrl] = useState<string | null>(null);
	useEffect(() => {
		let cancelled = false;
		getOriginalUrl(item).then((next) => {
			if (!cancelled) setUrl(next);
		});
		return () => {
			cancelled = true;
		};
	}, [item]);
	if (!url) return <ViewerImage item={item} width={width} height={height} />;
	return <InlineVideoPlayer uri={url} width={width} height={height} active={active} />;
}

const styles = StyleSheet.create({
	container: {
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	},
	backdrop: {
		backgroundColor: "#000",
	},
	inner: {
		alignItems: "center",
		justifyContent: "center",
	},
});
