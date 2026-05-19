import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
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
import { signInAnonymously } from "@/lib/auth";
import { isValidJoinCode, normalizeJoinCode } from "@/lib/invite";
import { useAuthStore } from "@/store/authStore";
import { useEventStore } from "@/store/eventStore";

export default function JoinByLink() {
	const { code: rawCode } = useLocalSearchParams<{ code: string }>();
	const code = normalizeJoinCode(rawCode ?? "");
	const status = useAuthStore((s) => s.status);
	const existingName = useAuthStore((s) => s.displayName) ?? "";
	const joinByCode = useEventStore((s) => s.joinByCode);
	const [name, setName] = useState(existingName);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!isValidJoinCode(code)) {
			setError("That join code does not look right.");
		}
	}, [code]);

	async function join() {
		if (!name.trim()) {
			Alert.alert("Add your name", "So the host knows whose photos these are.");
			return;
		}
		try {
			setBusy(true);
			setError(null);
			if (status !== "signed_in") {
				await signInAnonymously();
			}
			const event = await joinByCode(code, name);
			router.replace({ pathname: "/event/[id]", params: { id: event.id } });
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not join");
		} finally {
			setBusy(false);
		}
	}

	return (
		<SafeAreaView style={styles.safe}>
			<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.body}>
				<Text style={styles.title}>Join event</Text>
				<Text style={styles.subtitle}>Code</Text>
				<Text style={styles.code}>{code || "------"}</Text>

				<TextInput
					style={styles.input}
					placeholder="Your name"
					placeholderTextColor={theme.textSubtle}
					value={name}
					onChangeText={setName}
					autoCapitalize="words"
				/>

				<Pressable
					style={[styles.primaryBtn, (!isValidJoinCode(code) || busy) && styles.primaryBtnDisabled]}
					disabled={!isValidJoinCode(code) || busy}
					onPress={join}
				>
					{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Join as guest</Text>}
				</Pressable>

				{error ? <Text style={styles.error}>{error}</Text> : null}

				<View style={{ flex: 1 }} />
				<Pressable onPress={() => router.replace("/auth/login")}>
					<Text style={styles.link}>Use a phone number instead</Text>
				</Pressable>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1, backgroundColor: theme.bg },
	body: { flex: 1, padding: 24, gap: 12 },
	title: { color: theme.text, fontSize: 32, fontWeight: "700", marginTop: 24 },
	subtitle: { color: theme.textMuted, fontSize: 13, textTransform: "uppercase", letterSpacing: 1, marginTop: 16 },
	code: { color: theme.text, fontSize: 40, fontWeight: "700", letterSpacing: 6 },
	input: {
		backgroundColor: theme.surface,
		color: theme.text,
		padding: 16,
		borderRadius: theme.radius,
		fontSize: 16,
		marginTop: 12,
	},
	primaryBtn: {
		backgroundColor: theme.accent,
		padding: 16,
		borderRadius: theme.radius,
		alignItems: "center",
	},
	primaryBtnDisabled: { opacity: 0.5 },
	primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
	error: { color: theme.danger, textAlign: "center", marginTop: 12 },
	link: { color: theme.accentSoft, textAlign: "center", padding: 16 },
});
