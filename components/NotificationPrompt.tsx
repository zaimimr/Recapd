import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import {
	getPermissionState,
	type PermissionState,
	persistPushToken,
	registerForPushNotifications,
	requestSystemPermission,
} from "../lib/notifications";

type Reason = "initial" | "post_first_upload";

type Props = {
	visible: boolean;
	reason?: Reason;
	onResolved: (state: PermissionState) => void;
	onDismiss: () => void;
};

const COPY: Record<Reason, { title: string; body: string; cta: string }> = {
	initial: {
		title: "Don't miss a moment",
		body: "Recapd will ping you when the event ends so you can drop the photos that didn't get shared in the chat.",
		cta: "Turn on reminders",
	},
	post_first_upload: {
		title: "One more thing",
		body: "Turn on reminders so we can bug you tomorrow to add the rest of your photos. No spam, just the one nudge.",
		cta: "Sounds good",
	},
};

export function NotificationPrompt({ visible, reason = "initial", onResolved, onDismiss }: Props) {
	const [busy, setBusy] = useState(false);
	const copy = COPY[reason];

	useEffect(() => {
		if (!visible) setBusy(false);
	}, [visible]);

	const handleAccept = async () => {
		setBusy(true);
		const current = await getPermissionState();
		const next = current === "granted" ? "granted" : await requestSystemPermission();
		if (next === "granted") {
			const token = await registerForPushNotifications();
			if (token) await persistPushToken(token);
		}
		onResolved(next);
		setBusy(false);
	};

	const handleSkip = () => {
		onDismiss();
	};

	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={handleSkip}>
			<View style={styles.backdrop}>
				<View style={styles.sheet}>
					<View style={styles.bell}>
						<Text style={styles.bellGlyph}>🔔</Text>
					</View>
					<Text style={styles.title}>{copy.title}</Text>
					<Text style={styles.body}>{copy.body}</Text>
					<Pressable
						style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
						onPress={handleAccept}
						disabled={busy}
						accessibilityRole="button"
					>
						<Text style={styles.primaryText}>{busy ? "Setting up..." : copy.cta}</Text>
					</Pressable>
					<Pressable style={styles.secondary} onPress={handleSkip} accessibilityRole="button">
						<Text style={styles.secondaryText}>Not now</Text>
					</Pressable>
				</View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: "rgba(10, 10, 22, 0.65)",
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 24,
	},
	sheet: {
		width: "100%",
		maxWidth: 360,
		backgroundColor: "#1a1a2e",
		borderRadius: 24,
		padding: 24,
		alignItems: "center",
	},
	bell: {
		width: 56,
		height: 56,
		borderRadius: 28,
		backgroundColor: "rgba(124, 58, 237, 0.18)",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 16,
	},
	bellGlyph: { fontSize: 28 },
	title: {
		fontSize: 20,
		fontWeight: "700",
		color: "#fafafa",
		textAlign: "center",
		marginBottom: 8,
	},
	body: {
		fontSize: 15,
		lineHeight: 21,
		color: "#c7c7d9",
		textAlign: "center",
		marginBottom: 20,
	},
	primary: {
		alignSelf: "stretch",
		backgroundColor: "#7c3aed",
		paddingVertical: 14,
		borderRadius: 14,
		alignItems: "center",
	},
	primaryPressed: { opacity: 0.85 },
	primaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
	secondary: {
		alignSelf: "stretch",
		paddingVertical: 12,
		marginTop: 6,
		alignItems: "center",
	},
	secondaryText: { color: "#9999aa", fontSize: 14, fontWeight: "500" },
});

export default NotificationPrompt;
