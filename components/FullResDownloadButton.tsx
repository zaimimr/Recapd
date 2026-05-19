import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { useEntitlement } from "@/lib/entitlement";
import { UpgradePrompt } from "./UpgradePrompt";

type Props = {
	eventId: string;
	onDownload: () => Promise<void> | void;
};

export function FullResDownloadButton({ eventId, onDownload }: Props) {
	const entitlement = useEntitlement();
	const [promptVisible, setPromptVisible] = useState(false);
	const [busy, setBusy] = useState(false);
	const locked = !entitlement.allowsFullResDownload(eventId);

	const handle = async () => {
		if (locked) {
			setPromptVisible(true);
			return;
		}
		setBusy(true);
		try {
			await onDownload();
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<Pressable style={[styles.btn, locked && styles.locked]} onPress={handle} disabled={busy}>
				{busy ? (
					<ActivityIndicator color="#0f172a" />
				) : (
					<Ionicons name={locked ? "lock-closed" : "download"} size={18} color="#0f172a" />
				)}
				<Text style={styles.label}>
					{locked ? "Download originals (Pro)" : "Download all originals"}
				</Text>
			</Pressable>
			<UpgradePrompt
				visible={promptVisible}
				reason="full_res_download"
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
		backgroundColor: "#f3f4f6",
		borderRadius: 12,
		alignSelf: "flex-start",
	},
	locked: {
		backgroundColor: "#fef3c7",
	},
	label: {
		fontSize: 14,
		fontWeight: "600",
		color: "#0f172a",
	},
});
