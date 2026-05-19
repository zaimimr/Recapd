import { StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";

type Props = {
	label: string | null;
	visible: boolean;
};

export function StickyDatePill({ label, visible }: Props) {
	const style = useAnimatedStyle(() => ({
		opacity: withTiming(visible && label ? 1 : 0, { duration: 180 }),
		transform: [{ translateY: withTiming(visible && label ? 0 : -6, { duration: 200 }) }],
	}));
	return (
		<Animated.View pointerEvents="none" style={[styles.wrapper, style]}>
			<View style={styles.pill}>
				<Text numberOfLines={1} style={styles.label}>
					{label ?? ""}
				</Text>
			</View>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	wrapper: {
		position: "absolute",
		top: 8,
		left: 0,
		right: 0,
		alignItems: "center",
		zIndex: 20,
	},
	pill: {
		paddingHorizontal: 14,
		paddingVertical: 7,
		borderRadius: 999,
		backgroundColor: "rgba(0,0,0,0.72)",
		shadowColor: "#000",
		shadowOpacity: 0.35,
		shadowOffset: { width: 0, height: 4 },
		shadowRadius: 12,
		elevation: 6,
	},
	label: {
		color: "#fff",
		fontSize: 13,
		fontWeight: "600",
		letterSpacing: 0.2,
	},
});
