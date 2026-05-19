import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useEntitlement } from "@/lib/entitlement";
import { UpgradePrompt } from "./UpgradePrompt";

type Props = {
	eventId: string;
	onLaunch: () => void;
};

export function LiveSlideshowButton({ eventId, onLaunch }: Props) {
	const entitlement = useEntitlement(eventId);
	const [promptVisible, setPromptVisible] = useState(false);
	const locked = !entitlement.allowsLiveSlideshow;

	return (
		<>
			<Pressable
				style={[styles.btn, locked && styles.btnLocked]}
				onPress={() => (locked ? setPromptVisible(true) : onLaunch())}
			>
				<Ionicons name={locked ? "lock-closed" : "tv"} size={18} color="#fff" />
				<Text style={styles.label}>Live slideshow</Text>
				{locked ? <Text style={styles.chip}>Pro</Text> : null}
			</Pressable>
			<UpgradePrompt
				visible={promptVisible}
				reason="live_slideshow"
				eventId={eventId}
				onClose={() => setPromptVisible(false)}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	btn: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingVertical: 12,
		paddingHorizontal: 16,
		backgroundColor: "#0f172a",
		borderRadius: 12,
		alignSelf: "flex-start",
	},
	btnLocked: { opacity: 0.85 },
	label: {
		color: "#fff",
		fontWeight: "600",
		fontSize: 14,
	},
	chip: {
		color: "#fff",
		fontSize: 10,
		fontWeight: "700",
		backgroundColor: "#7c3aed",
		paddingHorizontal: 6,
		paddingVertical: 1,
		borderRadius: 999,
		overflow: "hidden",
	},
});
