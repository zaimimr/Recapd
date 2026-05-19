import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useEntitlement } from "@/lib/entitlement";
import { UpgradePrompt } from "./UpgradePrompt";

type Props = {
	eventId: string;
	value: boolean;
	onChange: (next: boolean) => void;
};

export function OutsideWindowToggle({ eventId, value, onChange }: Props) {
	const entitlement = useEntitlement(eventId);
	const [promptVisible, setPromptVisible] = useState(false);
	const locked = !entitlement.allowsOutsideWindowUploads;

	return (
		<>
			<Pressable
				style={[styles.row, locked && styles.locked]}
				onPress={() => {
					if (locked) setPromptVisible(true);
				}}
			>
				<View style={styles.text}>
					<View style={styles.titleRow}>
						<Text style={styles.title}>Uploads after the event ends</Text>
						{locked ? (
							<View style={styles.chip}>
								<Ionicons name="lock-closed" size={10} color="#fff" />
								<Text style={styles.chipText}>Pro</Text>
							</View>
						) : null}
					</View>
					<Text style={styles.subtitle}>
						Let guests keep adding photos after the event window closes.
					</Text>
				</View>
				<Switch
					value={!locked && value}
					onValueChange={(next) => {
						if (locked) {
							setPromptVisible(true);
							return;
						}
						onChange(next);
					}}
					disabled={locked}
					trackColor={{ false: "#d4d4d8", true: "#7c3aed" }}
				/>
			</Pressable>
			<UpgradePrompt
				visible={promptVisible}
				reason="outside_window"
				eventId={eventId}
				onClose={() => setPromptVisible(false)}
			/>
		</>
	);
}

const styles = StyleSheet.create({
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		paddingVertical: 14,
		paddingHorizontal: 16,
		backgroundColor: "#fff",
		borderRadius: 14,
	},
	locked: {
		opacity: 0.85,
	},
	text: {
		flex: 1,
	},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 2,
	},
	title: {
		fontSize: 15,
		fontWeight: "600",
		color: "#111827",
	},
	subtitle: {
		fontSize: 12,
		color: "#6b7280",
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 3,
		backgroundColor: "#7c3aed",
		paddingVertical: 2,
		paddingHorizontal: 6,
		borderRadius: 999,
	},
	chipText: {
		color: "#fff",
		fontSize: 10,
		fontWeight: "700",
	},
});
