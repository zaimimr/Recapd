import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useState } from "react";
import {
	Alert,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "@/constants/theme";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/invite";
import { useAuthStore } from "@/store/authStore";
import { useEventStore } from "@/store/eventStore";

type Mode = "code" | "scan";

export default function JoinEvent() {
	const [mode, setMode] = useState<Mode>("code");
	const [code, setCode] = useState("");
	const [name, setName] = useState(useAuthStore.getState().displayName ?? "");
	const [submitting, setSubmitting] = useState(false);
	const [permission, requestPermission] = useCameraPermissions();
	const joinByCode = useEventStore((s) => s.joinByCode);

	async function submit(nextCode?: string) {
		const candidate = normalizeJoinCode(nextCode ?? code);
		if (!isValidJoinCode(candidate)) {
			Alert.alert("Check the code", "Codes are 6 characters, letters and numbers.");
			return;
		}
		if (!name.trim()) {
			Alert.alert("Add your name", "Hosts and other guests will see this.");
			return;
		}
		try {
			setSubmitting(true);
			const event = await joinByCode(candidate, name);
			router.replace({ pathname: "/event/[id]", params: { id: event.id } });
		} catch (e) {
			Alert.alert("Could not join", e instanceof Error ? e.message : "Try again");
		} finally {
			setSubmitting(false);
		}
	}

	async function startScan() {
		if (!permission?.granted) {
			const next = await requestPermission();
			if (!next.granted) {
				Alert.alert("Camera off", "Allow camera access to scan a QR code.");
				return;
			}
		}
		setMode("scan");
	}

	return (
		<SafeAreaView style={styles.safe}>
			<View style={styles.header}>
				<Pressable onPress={() => router.back()} style={{ padding: 8 }}>
					<Ionicons name="close" size={24} color={theme.text} />
				</Pressable>
				<Text style={styles.title}>Join event</Text>
				<View style={{ width: 40 }} />
			</View>

			{mode === "code" ? (
				<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.body}>
					<TextInput
						style={styles.input}
						placeholder="Your name"
						placeholderTextColor={theme.textSubtle}
						value={name}
						onChangeText={setName}
						autoCapitalize="words"
					/>
					<TextInput
						style={[styles.input, styles.codeInput]}
						placeholder="6-char code"
						placeholderTextColor={theme.textSubtle}
						value={code}
						onChangeText={(t) => setCode(normalizeJoinCode(t))}
						autoCapitalize="characters"
						autoCorrect={false}
						maxLength={6}
					/>
					<Pressable style={styles.primaryBtn} disabled={submitting} onPress={() => submit()}>
						<Text style={styles.primaryBtnText}>{submitting ? "Joining..." : "Join"}</Text>
					</Pressable>
					<Pressable style={styles.secondaryBtn} onPress={startScan}>
						<Ionicons name="qr-code-outline" size={20} color={theme.text} />
						<Text style={styles.secondaryBtnText}>Scan QR instead</Text>
					</Pressable>
				</KeyboardAvoidingView>
			) : (
				<View style={styles.scanWrap}>
					<CameraView
						style={StyleSheet.absoluteFill}
						barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
						onBarcodeScanned={({ data }) => {
							if (submitting) return;
							const extracted = extractCode(data);
							if (extracted) {
								setCode(extracted);
								setMode("code");
								submit(extracted);
							}
						}}
					/>
					<View style={styles.scanOverlay}>
						<Text style={styles.scanHint}>Point at the host's QR</Text>
						<Pressable style={styles.secondaryBtn} onPress={() => setMode("code")}>
							<Text style={styles.secondaryBtnText}>Enter code instead</Text>
						</Pressable>
					</View>
				</View>
			)}
		</SafeAreaView>
	);
}

function extractCode(input: string): string | null {
	try {
		const url = new URL(input);
		const parts = url.pathname.split("/").filter(Boolean);
		const last = parts[parts.length - 1];
		const normalized = normalizeJoinCode(last ?? "");
		if (isValidJoinCode(normalized)) return normalized;
	} catch {}
	const normalized = normalizeJoinCode(input);
	return isValidJoinCode(normalized) ? normalized : null;
}

const styles = StyleSheet.create({
	safe: { flex: 1, backgroundColor: theme.bg },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: theme.border,
	},
	title: { color: theme.text, fontSize: 17, fontWeight: "600" },
	body: { flex: 1, padding: 20, gap: 12 },
	input: {
		backgroundColor: theme.surface,
		color: theme.text,
		padding: 16,
		borderRadius: theme.radius,
		fontSize: 16,
	},
	codeInput: { fontSize: 24, letterSpacing: 6, textAlign: "center", fontWeight: "700" },
	primaryBtn: {
		backgroundColor: theme.accent,
		padding: 16,
		borderRadius: theme.radius,
		alignItems: "center",
		marginTop: 4,
	},
	primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
	secondaryBtn: {
		flexDirection: "row",
		gap: 8,
		padding: 14,
		borderRadius: theme.radius,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 1,
		borderColor: theme.border,
		marginTop: 8,
	},
	secondaryBtnText: { color: theme.text, fontSize: 15 },
	scanWrap: { flex: 1, backgroundColor: "#000" },
	scanOverlay: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		padding: 20,
		gap: 12,
		alignItems: "center",
	},
	scanHint: { color: "#fff", fontSize: 16, fontWeight: "500" },
});
