import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { Button, Field, Screen, ScreenScroll, SectionHeader } from "@/components/ui";
import Icon, { type IconName } from "@/components/ui/Icon";
import { CONTENT_MAX_WIDTH, radius, space, theme, type } from "@/constants/theme";
import { markNotificationPromptSeen } from "@/lib/notificationPrompt";
import {
	openSystemSettings,
	type PermissionOutcome,
	requestNotificationAccess,
	requestPhotoAccess,
} from "@/lib/permissions";
import { useAuthStore } from "@/store/authStore";

type WizardStep = "name" | "photos" | "notifications";

const STEP_ORDER: WizardStep[] = ["name", "photos", "notifications"];

export default function OnboardingScreen() {
	const router = useRouter();
	const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
	const user = useAuthStore((state) => state.user);
	const createUser = useAuthStore((state) => state.createUser);
	const isLoading = useAuthStore((state) => state.isLoading);

	const [step, setStep] = useState<WizardStep>(user ? "photos" : "name");
	const [displayName, setDisplayName] = useState("");
	const [error, setError] = useState("");
	const [isRequesting, setIsRequesting] = useState(false);

	const stepNumber = STEP_ORDER.indexOf(step) + 1;

	function finish() {
		router.replace((returnTo || "/(tabs)") as Href);
	}

	async function handleCreateProfile() {
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
		const created = await createUser(trimmedName);

		if (created) {
			setStep("photos");
		} else {
			setError("Failed to create profile. Please try again.");
		}
	}

	function handlePermissionOutcome(outcome: PermissionOutcome, onSettings: string) {
		if (outcome === "needs_settings") {
			Alert.alert("Permission is off", onSettings, [
				{ text: "Not now", style: "cancel" },
				{ text: "Open Settings", onPress: openSystemSettings },
			]);
		}
	}

	async function handleAllowPhotos() {
		setIsRequesting(true);
		const outcome = await requestPhotoAccess();
		setIsRequesting(false);

		if (outcome === "limited") {
			Alert.alert(
				"Limited Access",
				"For the best experience, please allow access to all photos. Go to Settings > Recapd > Photos and select 'All Photos'.",
				[
					{ text: "Maybe Later", style: "cancel" },
					{ text: "Open Settings", onPress: openSystemSettings },
				]
			);
		} else {
			handlePermissionOutcome(
				outcome,
				"Photo access is turned off for Recapd. You can turn it on in Settings."
			);
		}

		setStep("notifications");
	}

	async function handleAllowNotifications() {
		setIsRequesting(true);
		const outcome = await requestNotificationAccess();
		await markNotificationPromptSeen();
		setIsRequesting(false);

		handlePermissionOutcome(
			outcome,
			"Notifications are turned off for Recapd. You can turn them on in Settings."
		);

		finish();
	}

	async function handleSkipNotifications() {
		await markNotificationPromptSeen();
		finish();
	}

	return (
		<Screen edges="both">
			<KeyboardAvoidingView
				style={styles.flex}
				behavior={Platform.OS === "ios" ? "padding" : "height"}
			>
				<ScreenScroll center contentContainerStyle={styles.content}>
					<View style={styles.brand}>
						<Text style={styles.wordmark}>
							Recap<Text style={styles.wordmarkDot}>d</Text>
						</Text>
					</View>

					<Text style={styles.stepCount}>
						Step {stepNumber} of {STEP_ORDER.length}
					</Text>

					{step === "name" ? (
						<>
							<SectionHeader title="Tell us what to call you." />
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
								onSubmitEditing={handleCreateProfile}
								accessibilityLabel="Your name"
								containerStyle={styles.field}
							/>

							<Button
								label="Continue"
								loading={isLoading}
								disabled={!displayName.trim()}
								onPress={handleCreateProfile}
							/>
						</>
					) : null}

					{step === "photos" ? (
						<>
							<StepIcon name="image" />
							<SectionHeader title="Let Recapd find your photos." />
							<Text style={styles.lede}>
								Recapd looks for the photos you took during an album's time window, so you can add
								them in one tap. Nothing leaves your phone until you share it.
							</Text>

							<Button
								label="Allow photo access"
								icon="image"
								loading={isRequesting}
								onPress={handleAllowPhotos}
								style={styles.action}
							/>
							<Button
								label="Not now"
								variant="ghost"
								size="md"
								disabled={isRequesting}
								onPress={() => setStep("notifications")}
							/>
						</>
					) : null}

					{step === "notifications" ? (
						<>
							<StepIcon name="bell" />
							<SectionHeader title="Get a nudge when it matters." />
							<Text style={styles.lede}>
								We remind you to add your photos while the night is fresh, and tell you when the
								album is about to be deleted. That is it.
							</Text>

							<Button
								label="Turn on reminders"
								icon="bell"
								loading={isRequesting}
								onPress={handleAllowNotifications}
								style={styles.action}
							/>
							<Button
								label="Not now"
								variant="ghost"
								size="md"
								disabled={isRequesting}
								onPress={handleSkipNotifications}
							/>
						</>
					) : null}
				</ScreenScroll>
			</KeyboardAvoidingView>
		</Screen>
	);
}

function StepIcon({ name }: { name: IconName }) {
	return (
		<View style={styles.stepIcon}>
			<Icon name={name} size={24} color={theme.accent} />
		</View>
	);
}

const styles = StyleSheet.create({
	flex: {
		flex: 1,
	},
	content: {
		paddingHorizontal: space.xl,
		maxWidth: CONTENT_MAX_WIDTH,
		width: "100%",
		alignSelf: "center",
		gap: space.md,
	},
	brand: {
		marginBottom: space.lg,
	},
	wordmark: {
		...type.display,
		color: theme.textPrimary,
	},
	wordmarkDot: {
		color: theme.accent,
	},
	stepCount: {
		...type.caption,
		color: theme.textMuted,
		textTransform: "uppercase",
		letterSpacing: 1,
	},
	lede: {
		...type.body,
		color: theme.textMuted,
		marginBottom: space.lg,
	},
	field: {
		marginBottom: space.md,
	},
	action: {
		marginBottom: space.sm,
	},
	stepIcon: {
		width: 52,
		height: 52,
		borderRadius: radius.lg,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: theme.cardElevated,
		marginBottom: space.sm,
	},
});
