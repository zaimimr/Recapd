import { router } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
	normalizePhone,
	sendPhoneOtp,
	signInAnonymously,
	verifyPhoneOtp,
} from "@/lib/auth";
import { useAuthStore } from "@/store/authStore";

type Step = "phone" | "code";

export default function Login() {
	const [step, setStep] = useState<Step>("phone");
	const [phone, setPhone] = useState("");
	const [code, setCode] = useState("");
	const [name, setName] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const setDisplayName = useAuthStore((s) => s.setDisplayName);

	async function handleSendCode() {
		try {
			setError(null);
			setLoading(true);
			const normalized = normalizePhone(phone);
			await sendPhoneOtp(normalized);
			setPhone(normalized);
			setStep("code");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not send code");
		} finally {
			setLoading(false);
		}
	}

	async function handleVerify() {
		try {
			setError(null);
			setLoading(true);
			await verifyPhoneOtp(phone, code.trim());
			if (name.trim()) {
				await setDisplayName(name);
			}
			router.replace("/(tabs)/events");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Code did not work");
		} finally {
			setLoading(false);
		}
	}

	async function handleAnonymous() {
		try {
			setError(null);
			setLoading(true);
			await signInAnonymously();
			if (name.trim()) {
				await setDisplayName(name);
			}
			router.replace("/(tabs)/events");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Could not start guest session");
		} finally {
			setLoading(false);
		}
	}

	return (
		<SafeAreaView style={styles.safe}>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : undefined}
				style={styles.container}
			>
				<Text style={styles.title}>Recapd</Text>
				<Text style={styles.subtitle}>Sign in or join as guest. No email needed.</Text>

				<TextInput
					style={styles.input}
					placeholder="Your name"
					placeholderTextColor="#888"
					value={name}
					onChangeText={setName}
					autoCapitalize="words"
					returnKeyType="next"
				/>

				{step === "phone" ? (
					<>
						<TextInput
							style={styles.input}
							placeholder="Phone, +14155551234"
							placeholderTextColor="#888"
							value={phone}
							onChangeText={setPhone}
							keyboardType="phone-pad"
							autoComplete="tel"
						/>
						<Pressable style={styles.primaryBtn} disabled={loading} onPress={handleSendCode}>
							{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Send code</Text>}
						</Pressable>
					</>
				) : (
					<>
						<TextInput
							style={styles.input}
							placeholder="6-digit code"
							placeholderTextColor="#888"
							value={code}
							onChangeText={setCode}
							keyboardType="number-pad"
							autoComplete="one-time-code"
						/>
						<Pressable style={styles.primaryBtn} disabled={loading} onPress={handleVerify}>
							{loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Verify</Text>}
						</Pressable>
						<Pressable onPress={() => setStep("phone")}>
							<Text style={styles.link}>Use a different number</Text>
						</Pressable>
					</>
				)}

				<View style={styles.divider} />

				<Pressable style={styles.secondaryBtn} disabled={loading} onPress={handleAnonymous}>
					<Text style={styles.secondaryBtnText}>Continue as guest</Text>
				</Pressable>

				{error ? <Text style={styles.error}>{error}</Text> : null}
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1, backgroundColor: "#0f0f17" },
	container: { flex: 1, padding: 24, justifyContent: "center" },
	title: { fontSize: 40, fontWeight: "700", color: "#fff", marginBottom: 8 },
	subtitle: { fontSize: 15, color: "#a0a0b0", marginBottom: 32 },
	input: {
		backgroundColor: "#1c1c2a",
		color: "#fff",
		padding: 16,
		borderRadius: 12,
		marginBottom: 12,
		fontSize: 16,
	},
	primaryBtn: {
		backgroundColor: "#7c3aed",
		padding: 16,
		borderRadius: 12,
		alignItems: "center",
		marginTop: 4,
	},
	primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
	secondaryBtn: {
		padding: 16,
		borderRadius: 12,
		alignItems: "center",
		borderWidth: 1,
		borderColor: "#3a3a4f",
	},
	secondaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "500" },
	divider: { height: 24 },
	link: { color: "#a78bfa", textAlign: "center", marginTop: 12 },
	error: { color: "#f87171", marginTop: 16, textAlign: "center" },
});
