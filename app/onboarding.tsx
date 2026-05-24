import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { useColorScheme } from "@/components/useColorScheme";
import { useAuthStore } from "@/store/authStore";

export default function OnboardingScreen() {
	const router = useRouter();
	const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
	const createUser = useAuthStore((state) => state.createUser);
	const isLoading = useAuthStore((state) => state.isLoading);
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";

	const [displayName, setDisplayName] = useState("");
	const [error, setError] = useState("");

	async function handleContinue() {
		const trimmedName = displayName.trim();

		if (trimmedName.length < 2) {
			setError("Name must be at least 2 characters");
			return;
		}

		if (trimmedName.length > 30) {
			setError("Name must be 30 characters or less");
			return;
		}

		setError("");
		const user = await createUser(trimmedName);

		if (user) {
			router.replace((returnTo || "/(tabs)") as Href);
		} else {
			setError("Failed to create profile. Please try again.");
		}
	}

	return (
		<KeyboardAvoidingView
			style={[styles.container, isDark && styles.containerDark]}
			behavior={Platform.OS === "ios" ? "padding" : "height"}
		>
			<View style={styles.content}>
				<View style={[styles.hero, isDark && styles.panelDark]}>
					<Text style={[styles.kicker, isDark && styles.textMuted]}>Recapd</Text>
					<Text style={[styles.logo, isDark && styles.textDark]}>
						Tell us what to call you.
					</Text>
					<Text style={[styles.tagline, isDark && styles.textMuted]}>
						Your name shows up on events, uploads, and the shared feed.
					</Text>
				</View>

				<View style={[styles.form, isDark && styles.panelDark]}>
					<Text style={[styles.kicker, isDark && styles.textMuted]}>Profile</Text>
					<Text style={[styles.label, isDark && styles.textDark]}>What should we call you?</Text>
					<TextInput
						style={[styles.input, isDark && styles.inputDark, error ? styles.inputError : null]}
						placeholder="Enter your name"
						placeholderTextColor={isDark ? "#666" : "#999"}
						value={displayName}
						onChangeText={(text) => {
							setDisplayName(text);
							setError("");
						}}
						autoCapitalize="words"
						autoCorrect={false}
						maxLength={30}
						returnKeyType="done"
						onSubmitEditing={handleContinue}
					/>
					{error ? <Text style={styles.errorText}>{error}</Text> : null}
					<Text style={[styles.hint, isDark && styles.textMuted]}>
						This is how you'll appear to others
					</Text>
				</View>

				<TouchableOpacity
					style={[styles.button, (!displayName.trim() || isLoading) && styles.buttonDisabled]}
					onPress={handleContinue}
					disabled={!displayName.trim() || isLoading}
				>
					{isLoading ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text style={styles.buttonText}>Continue</Text>
					)}
				</TouchableOpacity>
			</View>
		</KeyboardAvoidingView>
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
	content: {
		flex: 1,
		padding: 16,
		justifyContent: "center",
		gap: 16,
	},
	hero: {
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		paddingHorizontal: 16,
		paddingVertical: 18,
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
	logo: {
		fontSize: 34,
		fontWeight: "700",
		color: "#111827",
		letterSpacing: -1.1,
		lineHeight: 38,
	},
	tagline: {
		fontSize: 15,
		color: "#6b7280",
		lineHeight: 22,
	},
	form: {
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		paddingHorizontal: 16,
		paddingVertical: 16,
	},
	label: {
		fontSize: 22,
		fontWeight: "700",
		color: "#111827",
		marginBottom: 12,
		letterSpacing: -0.5,
	},
	input: {
		backgroundColor: "#f9fafb",
		borderRadius: 14,
		paddingVertical: 16,
		paddingHorizontal: 20,
		fontSize: 18,
		color: "#111827",
		borderWidth: 1,
		borderColor: "#d1d5db",
	},
	inputDark: {
		backgroundColor: "#151821",
		borderColor: "#242833",
		color: "#fff",
	},
	inputError: {
		borderColor: "#ef4444",
	},
	errorText: {
		color: "#ef4444",
		fontSize: 14,
		marginTop: 8,
	},
	hint: {
		fontSize: 14,
		color: "#6b7280",
		marginTop: 8,
	},
	button: {
		backgroundColor: "#111827",
		paddingVertical: 18,
		borderRadius: 999,
		alignItems: "center",
	},
	buttonDisabled: {
		opacity: 0.5,
	},
	buttonText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "600",
	},
	textDark: {
		color: "#fff",
	},
	textMuted: {
		color: "#888",
	},
});
