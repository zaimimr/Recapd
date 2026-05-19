import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useEntitlement } from "@/lib/entitlement";
import { UpgradePrompt } from "./UpgradePrompt";

type Props = {
	eventId: string;
	onInvite: () => void;
};

export function MultiHostInviteButton({ eventId, onInvite }: Props) {
	const entitlement = useEntitlement();
	const [promptVisible, setPromptVisible] = useState(false);
	const locked = !entitlement.allowsMultiHost;

	return (
		<>
			<Pressable
				style={[styles.btn, locked && styles.locked]}
				onPress={() => (locked ? setPromptVisible(true) : onInvite())}
			>
				<Ionicons name="people-outline" size={18} color={locked ? "#7c3aed" : "#0f172a"} />
				<Text style={[styles.label, locked && styles.labelLocked]}>Invite a co-host</Text>
				{locked ? <Text style={styles.chip}>Pro</Text> : null}
			</Pressable>
			<UpgradePrompt
				visible={promptVisible}
				reason="multi_host"
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
		paddingHorizontal: 14,
		backgroundColor: "#f3f4f6",
		borderRadius: 12,
		alignSelf: "flex-start",
	},
	locked: {
		backgroundColor: "#faf5ff",
	},
	label: {
		fontSize: 14,
		fontWeight: "600",
		color: "#0f172a",
	},
	labelLocked: {
		color: "#5b21b6",
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
