import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "@/constants/theme";
import { useEntitlement } from "@/lib/entitlement";
import { useAuthStore } from "@/store/authStore";

export default function SettingsTab() {
	const userId = useAuthStore((s) => s.userId);
	const displayName = useAuthStore((s) => s.displayName) ?? "";
	const isAnonymous = useAuthStore((s) => s.isAnonymous);
	const setDisplayName = useAuthStore((s) => s.setDisplayName);
	const signOut = useAuthStore((s) => s.signOut);
	const entitlement = useEntitlement();
	const [name, setName] = useState(displayName);
	const [saving, setSaving] = useState(false);

	async function saveName() {
		try {
			setSaving(true);
			await setDisplayName(name);
		} catch (e) {
			Alert.alert("Could not save", e instanceof Error ? e.message : "Try again");
		} finally {
			setSaving(false);
		}
	}

	async function handleSignOut() {
		Alert.alert("Sign out?", "You'll need to sign back in to see your events.", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Sign out",
				style: "destructive",
				onPress: async () => {
					await signOut();
					router.replace("/auth/login");
				},
			},
		]);
	}

	return (
		<SafeAreaView style={styles.safe}>
			<View style={styles.header}>
				<Text style={styles.title}>Settings</Text>
			</View>

			<View style={styles.section}>
				<Text style={styles.label}>Display name</Text>
				<TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={theme.textSubtle} />
				<Pressable style={styles.btn} disabled={saving || !name.trim()} onPress={saveName}>
					<Text style={styles.btnText}>{saving ? "Saving..." : "Save"}</Text>
				</Pressable>
			</View>

			<View style={styles.section}>
				<Text style={styles.label}>Account</Text>
				<Text style={styles.body}>
					{isAnonymous ? "Guest session" : "Phone account"}
				</Text>
				<Text style={styles.bodySubtle} numberOfLines={1}>{userId}</Text>
			</View>

			<View style={styles.section}>
				<Text style={styles.label}>Plan</Text>
				<Text style={styles.body}>{entitlement === "pro" ? "Pro" : "Free"}</Text>
			</View>

			<Pressable style={styles.dangerBtn} onPress={handleSignOut}>
				<Text style={styles.dangerText}>Sign out</Text>
			</Pressable>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1, backgroundColor: theme.bg, padding: 20 },
	header: { paddingVertical: 8 },
	title: { fontSize: 32, fontWeight: "700", color: theme.text },
	section: {
		backgroundColor: theme.surface,
		borderRadius: theme.radius,
		padding: 16,
		marginTop: 16,
	},
	label: { color: theme.textMuted, fontSize: 13, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
	body: { color: theme.text, fontSize: 16 },
	bodySubtle: { color: theme.textSubtle, fontSize: 12, marginTop: 4 },
	input: {
		backgroundColor: theme.surfaceAlt,
		color: theme.text,
		padding: 12,
		borderRadius: 8,
		fontSize: 16,
		marginBottom: 12,
	},
	btn: {
		backgroundColor: theme.accent,
		padding: 12,
		borderRadius: 8,
		alignItems: "center",
	},
	btnText: { color: "#fff", fontWeight: "600" },
	dangerBtn: { marginTop: 32, padding: 16, alignItems: "center" },
	dangerText: { color: theme.danger, fontSize: 16, fontWeight: "600" },
});
