import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { Button, Field, Screen, SectionHeader } from "@/components/ui";
import { space, theme, type } from "@/constants/theme";
import { useAuthStore } from "@/store/authStore";

export default function OnboardingScreen() {
	const router = useRouter();
	const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
	const createUser = useAuthStore((state) => state.createUser);
	const isLoading = useAuthStore((state) => state.isLoading);

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
		<Screen edges="both">
			<KeyboardAvoidingView
				style={styles.flex}
				behavior={Platform.OS === "ios" ? "padding" : "height"}
			>
				<View style={styles.content}>
					<View style={styles.brand}>
						<Text style={styles.wordmark}>
							Recap<Text style={styles.wordmarkDot}>d</Text>
						</Text>
					</View>

					<SectionHeader eyebrow="One quick thing" title="Tell us what to call you." />
					<Text style={styles.lede}>
						Your name shows up on the photos you add. No email, no password, nothing else.
					</Text>

					<Field
						placeholder="Your first name"
						value={displayName}
						onChangeText={(text) => {
							setDisplayName(text);
							setError("");
						}}
						error={error || null}
						autoCapitalize="words"
						autoCorrect={false}
						maxLength={30}
						returnKeyType="done"
						onSubmitEditing={handleContinue}
						accessibilityLabel="Your name"
						containerStyle={styles.field}
					/>

					<Button
						label="Continue"
						loading={isLoading}
						disabled={!displayName.trim()}
						onPress={handleContinue}
					/>
				</View>
			</KeyboardAvoidingView>
		</Screen>
	);
}

const styles = StyleSheet.create({
	flex: {
		flex: 1,
	},
	content: {
		flex: 1,
		justifyContent: "center",
		paddingHorizontal: space.xl,
		gap: space.lg,
	},
	brand: {
		marginBottom: space.sm,
	},
	wordmark: {
		fontSize: 26,
		fontWeight: "800",
		letterSpacing: -1,
		color: theme.textPrimary,
	},
	wordmarkDot: {
		color: theme.accent,
	},
	lede: {
		...type.body,
		color: theme.textMuted,
		marginTop: -space.sm,
	},
	field: {
		marginTop: space.xs,
	},
});
