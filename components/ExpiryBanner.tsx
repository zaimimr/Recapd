import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { EXPIRY_WARNING_DAYS, FREE_MEDIA_TTL_DAYS } from "@/lib/billing/config";
import { daysUntilExpiry, useEntitlement } from "@/lib/entitlement";
import { UpgradePrompt } from "./UpgradePrompt";

type Props = {
	eventId: string;
	eventCreatedAt: Date | string;
	onExport?: () => void;
};

export function ExpiryBanner({ eventId, eventCreatedAt, onExport }: Props) {
	const entitlement = useEntitlement(eventId);
	const [promptVisible, setPromptVisible] = useState(false);

	const createdAt = useMemo(
		() => (eventCreatedAt instanceof Date ? eventCreatedAt : new Date(eventCreatedAt)),
		[eventCreatedAt]
	);

	if (entitlement.isPro) return null;

	const daysLeft = daysUntilExpiry(createdAt, FREE_MEDIA_TTL_DAYS);
	if (daysLeft > EXPIRY_WARNING_DAYS) return null;

	const expired = daysLeft <= 0;

	return (
		<>
			<View style={[styles.banner, expired ? styles.expired : styles.warn]}>
				<Ionicons name="time-outline" size={18} color={expired ? "#fff" : "#9a3412"} />
				<View style={styles.text}>
					<Text style={[styles.title, expired && styles.textInverse]}>
						{expired
							? "This event has expired"
							: `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
					</Text>
					<Text style={[styles.subtitle, expired && styles.textInverse]}>
						Extend storage with Pro, or export the originals before they're gone.
					</Text>
				</View>
				<View style={styles.actions}>
					<Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => setPromptVisible(true)}>
						<Text style={styles.btnPrimaryText}>Extend</Text>
					</Pressable>
					{onExport ? (
						<Pressable style={styles.btn} onPress={onExport}>
							<Text style={styles.btnText}>Export</Text>
						</Pressable>
					) : null}
				</View>
			</View>
			<UpgradePrompt
				visible={promptVisible}
				reason="media_ttl"
				eventId={eventId}
				onClose={() => setPromptVisible(false)}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	banner: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 12,
		paddingHorizontal: 14,
		borderRadius: 14,
		marginHorizontal: 16,
		marginVertical: 8,
	},
	warn: {
		backgroundColor: "#ffedd5",
	},
	expired: {
		backgroundColor: "#dc2626",
	},
	text: {
		flex: 1,
	},
	title: {
		fontSize: 14,
		fontWeight: "700",
		color: "#9a3412",
		marginBottom: 2,
	},
	subtitle: {
		fontSize: 12,
		color: "#9a3412",
		lineHeight: 16,
	},
	textInverse: {
		color: "#fff",
	},
	actions: {
		gap: 6,
	},
	btn: {
		paddingVertical: 6,
		paddingHorizontal: 10,
		borderRadius: 8,
		alignItems: "center",
	},
	btnPrimary: {
		backgroundColor: "#7c3aed",
	},
	btnPrimaryText: {
		color: "#fff",
		fontSize: 12,
		fontWeight: "700",
	},
	btnText: {
		color: "#1f2937",
		fontSize: 12,
		fontWeight: "600",
	},
});
