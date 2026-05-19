import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FREE_GUEST_CAP } from "@/lib/billing/config";
import { useEntitlement } from "@/lib/entitlement";
import { UpgradePrompt } from "./UpgradePrompt";

type Props = {
	eventId: string;
	guestCount: number;
};

export function ParticipantLimitBanner({ eventId, guestCount }: Props) {
	const entitlement = useEntitlement();
	const [promptVisible, setPromptVisible] = useState(false);

	if (entitlement.hasProForEvent(eventId)) return null;

	const remaining = FREE_GUEST_CAP - guestCount;
	const isFull = remaining <= 0;
	const isWarning = remaining <= 3;

	if (!isWarning && !isFull) {
		return (
			<View style={styles.container}>
				<Text style={styles.subtle}>
					{guestCount} / {FREE_GUEST_CAP} guests
				</Text>
			</View>
		);
	}

	return (
		<>
			<Pressable
				style={[styles.container, isFull ? styles.full : styles.warning]}
				onPress={() => setPromptVisible(true)}
			>
				<Ionicons
					name={isFull ? "lock-closed" : "alert-circle"}
					size={18}
					color={isFull ? "#fff" : "#92400e"}
				/>
				<Text style={[styles.text, isFull && styles.textFull]}>
					{isFull
						? `Guest limit reached (${FREE_GUEST_CAP}). Tap to unlock.`
						: `${remaining} guest spot${remaining === 1 ? "" : "s"} left. Tap to lift the cap.`}
				</Text>
			</Pressable>
			<UpgradePrompt
				visible={promptVisible}
				reason="guest_cap"
				eventId={eventId}
				onClose={() => setPromptVisible(false)}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		paddingVertical: 10,
		paddingHorizontal: 14,
		borderRadius: 12,
		marginHorizontal: 16,
		marginTop: 8,
	},
	subtle: {
		fontSize: 13,
		color: "#71717a",
	},
	warning: {
		backgroundColor: "#fef3c7",
	},
	full: {
		backgroundColor: "#7c3aed",
	},
	text: {
		fontSize: 13,
		color: "#92400e",
		fontWeight: "600",
		flexShrink: 1,
	},
	textFull: {
		color: "#fff",
	},
});
