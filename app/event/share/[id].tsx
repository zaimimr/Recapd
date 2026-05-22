import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Share,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useColorScheme } from "@/components/useColorScheme";
import { formatLocalizedDate, formatLocalizedTimeRange } from "@/lib/utils";
import { useEventStore } from "@/store/eventStore";

export default function ShareEventScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const { fetchEventById, currentEvent, isLoading } = useEventStore();
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";

	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (id) {
			fetchEventById(id);
		}
	}, [id, fetchEventById]);

	async function handleCopyCode() {
		if (currentEvent?.join_code) {
			await Clipboard.setStringAsync(currentEvent.join_code);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	}

	async function handleShare() {
		if (!currentEvent) return;

		const message = `${currentEvent.title}\n${formatLocalizedDate(currentEvent.starts_at, {
			weekday: "short",
			month: "short",
			day: "numeric",
		})} · ${formatLocalizedTimeRange(currentEvent.starts_at, currentEvent.ends_at, " – ")}\n\nJoin code: ${currentEvent.join_code}\nJoin the event here: https://recapd.app/join/${currentEvent.join_code}`;

		try {
			await Share.share({
				message,
				title: currentEvent.title,
			});
		} catch {
			Alert.alert("Error", "Failed to share");
		}
	}

	function handleDone() {
		router.replace(`/event/${id}`);
	}

	if (isLoading || !currentEvent) {
		return (
			<View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
				<ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
			</View>
		);
	}

	// Deep link for QR code (opens app directly if installed)
	const deepLink = `recapd://join/${currentEvent.join_code}`;
	// Web URL for sharing (has smart redirect to app or store)
	const _shareUrl = `https://recapd.app/join/${currentEvent.join_code}`;

	return (
		<View style={[styles.container, isDark && styles.containerDark]}>
			<View style={styles.content}>
				<View style={[styles.header, isDark && styles.panelDark]}>
					<Text style={[styles.kicker, isDark && styles.textMuted]}>Invite</Text>
					<Text style={[styles.title, isDark && styles.textDark]}>{currentEvent.title}</Text>
					<Text style={[styles.subtitle, isDark && styles.textMuted]}>
						{formatLocalizedDate(currentEvent.starts_at, {
							weekday: "short",
							month: "short",
							day: "numeric",
						})}{" "}
						• {formatLocalizedTimeRange(currentEvent.starts_at, currentEvent.ends_at)}
					</Text>
				</View>

				<View style={[styles.qrContainer, isDark && styles.panelDark]}>
					<View style={styles.qrWrapper}>
						<QRCode value={deepLink} size={200} backgroundColor="#fff" color="#000" />
					</View>
				</View>

				<View style={[styles.codeSection, isDark && styles.panelDark]}>
					<Text style={[styles.kicker, isDark && styles.textMuted]}>Join Code</Text>
					<TouchableOpacity style={styles.codeButton} onPress={handleCopyCode}>
						<Text style={[styles.codeText, isDark && styles.textDark]}>
							{currentEvent.join_code}
						</Text>
						<Text style={styles.copyHint}>{copied ? "Copied!" : "Tap to copy"}</Text>
					</TouchableOpacity>
				</View>

				<View style={styles.actions}>
					<TouchableOpacity style={styles.shareButton} onPress={handleShare}>
						<Text style={styles.shareButtonText}>Share Invite</Text>
					</TouchableOpacity>

					<TouchableOpacity
						style={[styles.doneButton, isDark && styles.doneButtonDark]}
						onPress={handleDone}
					>
						<Text style={[styles.doneButtonText, isDark && styles.textDark]}>Done</Text>
					</TouchableOpacity>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#f3f4f6",
	},
	containerDark: {
		backgroundColor: "#05070b",
	},
	centered: {
		justifyContent: "center",
		alignItems: "center",
	},
	content: {
		flex: 1,
		padding: 16,
		alignItems: "center",
		gap: 14,
	},
	header: {
		alignItems: "center",
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		paddingHorizontal: 16,
		paddingVertical: 16,
		width: "100%",
		gap: 6,
	},
	panelDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	kicker: {
		fontSize: 11,
		fontWeight: "700",
		letterSpacing: 1.2,
		textTransform: "uppercase",
		color: "#6b7280",
	},
	title: {
		fontSize: 24,
		fontWeight: "700",
		color: "#111827",
		textAlign: "center",
		letterSpacing: -0.6,
	},
	subtitle: {
		fontSize: 14,
		color: "#6b7280",
		textAlign: "center",
	},
	qrContainer: {
		width: "100%",
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		paddingVertical: 20,
		alignItems: "center",
	},
	qrWrapper: {
		backgroundColor: "#fff",
		padding: 16,
		borderRadius: 0,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 12,
		elevation: 5,
	},
	codeSection: {
		alignItems: "center",
		width: "100%",
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		paddingVertical: 18,
		gap: 10,
	},
	codeLabel: {
		fontSize: 14,
		color: "#666",
		marginBottom: 8,
	},
	codeButton: {
		alignItems: "center",
	},
	codeText: {
		fontSize: 36,
		fontWeight: "700",
		fontFamily: "SpaceMono",
		color: "#111827",
		letterSpacing: 4,
	},
	copyHint: {
		fontSize: 14,
		color: "#6b7280",
		marginTop: 4,
		fontWeight: "600",
	},
	actions: {
		width: "100%",
		gap: 12,
		marginTop: "auto",
		paddingBottom: 24,
	},
	shareButton: {
		backgroundColor: "#111827",
		paddingVertical: 18,
		borderRadius: 999,
		alignItems: "center",
	},
	shareButtonText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "600",
	},
	doneButton: {
		paddingVertical: 16,
		alignItems: "center",
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#d1d5db",
		borderRadius: 999,
	},
	doneButtonDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	doneButtonText: {
		color: "#111827",
		fontSize: 15,
		fontWeight: "600",
	},
	textDark: {
		color: "#fff",
	},
	textMuted: {
		color: "#888",
	},
});
