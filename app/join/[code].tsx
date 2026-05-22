import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	KeyboardAvoidingView,
	Platform,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { useColorScheme } from "@/components/useColorScheme";
import { logger } from "@/lib/logger";
import { formatLocalizedDate, formatLocalizedTimeRange } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useEventStore } from "@/store/eventStore";
import type { Event } from "@/types/database";

interface EventPreview extends Event {
	participant_count?: number;
}

export default function JoinByCodeScreen() {
	const router = useRouter();
	const { code: rawCode } = useLocalSearchParams<{ code: string }>();
	const code =
		rawCode
			?.toUpperCase()
			.replace(/[^A-Z0-9]/g, "")
			.slice(0, 6) || "";

	const user = useAuthStore((state) => state.user);
	const createUser = useAuthStore((state) => state.createUser);
	const authLoading = useAuthStore((state) => state.isLoading);
	const { fetchEventByCode, joinEvent, isLoading, error, clearError } = useEventStore();
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";

	const [eventPreview, setEventPreview] = useState<EventPreview | null>(null);
	const [displayName, setDisplayName] = useState("");
	const [nameError, setNameError] = useState("");
	const [lookupDone, setLookupDone] = useState(false);

	// Auto-lookup event on mount
	useEffect(() => {
		async function lookupEvent() {
			if (code.length === 6 && !lookupDone) {
				clearError();
				try {
					const event = await fetchEventByCode(code);
					setLookupDone(true);
					if (event) {
						setEventPreview(event);
					}
				} catch (error) {
					logger.error("Event lookup failed", error, { code });
					setLookupDone(true);
				}
			}
		}
		lookupEvent();
	}, [code, lookupDone, clearError, fetchEventByCode]);

	async function handleJoin() {
		if (!eventPreview) return;

		let currentUser = user;

		if (!currentUser) {
			const trimmedName = displayName.trim();

			if (trimmedName.length < 2) {
				setNameError("Name must be at least 2 characters");
				return;
			}

			if (trimmedName.length > 30) {
				setNameError("Name must be 30 characters or less");
				return;
			}

			setNameError("");
			currentUser = await createUser(trimmedName);

			if (!currentUser) {
				Alert.alert("Error", "Failed to create profile. Please try again.");
				return;
			}
		}

		const success = await joinEvent(eventPreview.id, currentUser.id);

		if (success) {
			router.replace(`/event/${eventPreview.id}`);
		} else {
			Alert.alert("Error", "Failed to join event. Please try again.");
		}
	}

	function handleEnterDifferentCode() {
		router.replace("/event/join");
	}

	const isJoining = isLoading || authLoading;
	const canJoin = user || displayName.trim().length >= 2;

	// Loading state
	if (isLoading && !lookupDone) {
		return (
			<>
				<Stack.Screen options={{ title: "Join Event" }} />
				<View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
					<ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
					<Text style={[styles.loadingText, isDark && styles.textMuted]}>Looking up event...</Text>
				</View>
			</>
		);
	}

	// Error state - event not found
	if (lookupDone && !eventPreview) {
		return (
			<>
				<Stack.Screen options={{ title: "Join Event" }} />
				<View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
					<Text style={[styles.errorTitle, isDark && styles.textDark]}>Event Not Found</Text>
					<Text style={[styles.errorMessage, isDark && styles.textMuted]}>
						{error || `No event found with code "${code}"`}
					</Text>
					<TouchableOpacity style={styles.button} onPress={handleEnterDifferentCode}>
						<Text style={styles.buttonText}>Enter Different Code</Text>
					</TouchableOpacity>
				</View>
			</>
		);
	}

	// Preview and join state
	if (eventPreview) {
		return (
			<>
				<Stack.Screen options={{ title: "Join Event" }} />
				<KeyboardAvoidingView
					style={[styles.container, isDark && styles.containerDark]}
					behavior={Platform.OS === "ios" ? "padding" : "height"}
				>
					<View style={styles.content}>
						<View style={[styles.previewCard, isDark && styles.previewCardDark]}>
							<Text style={[styles.kicker, isDark && styles.textMuted]}>Join</Text>
							<Text style={[styles.previewTitle, isDark && styles.textDark]}>
								{eventPreview.title}
							</Text>
							<Text style={[styles.previewDate, isDark && styles.textMuted]}>
								{formatLocalizedDate(eventPreview.starts_at, {
									weekday: "long",
									month: "long",
									day: "numeric",
									year: "numeric",
								})}
							</Text>
							<Text style={[styles.previewTime, isDark && styles.textMuted]}>
								{formatLocalizedTimeRange(eventPreview.starts_at, eventPreview.ends_at)}
							</Text>
							<View style={styles.previewStats}>
								<Text style={[styles.previewParticipants, isDark && styles.textMuted]}>
									{eventPreview.participant_count || 0} participant
									{eventPreview.participant_count !== 1 ? "s" : ""}
								</Text>
							</View>
						</View>

						{!user && (
							<View style={[styles.nameSection, isDark && styles.previewCardDark]}>
								<Text style={[styles.nameLabel, isDark && styles.textDark]}>
									What should we call you?
								</Text>
								<TextInput
									style={[
										styles.nameInput,
										isDark && styles.nameInputDark,
										nameError ? styles.inputError : null,
									]}
									placeholder="Enter your name"
									placeholderTextColor={isDark ? "#666" : "#999"}
									value={displayName}
									onChangeText={(text) => {
										setDisplayName(text);
										setNameError("");
									}}
									autoCapitalize="words"
									autoCorrect={false}
									maxLength={30}
								/>
								{nameError ? <Text style={styles.errorText}>{nameError}</Text> : null}
								<Text style={[styles.nameHint, isDark && styles.textMuted]}>
									This is how you'll appear to others
								</Text>
							</View>
						)}

						<View style={styles.actions}>
							<TouchableOpacity
								style={[styles.button, (!canJoin || isJoining) && styles.buttonDisabled]}
								onPress={handleJoin}
								disabled={!canJoin || isJoining}
							>
								{isJoining ? (
									<ActivityIndicator color="#fff" />
								) : (
									<Text style={styles.buttonText}>Join Event</Text>
								)}
							</TouchableOpacity>

							<TouchableOpacity style={styles.backButton} onPress={handleEnterDifferentCode}>
								<Text style={[styles.backButtonText, isDark && styles.textDark]}>
									Enter Different Code
								</Text>
							</TouchableOpacity>
						</View>
					</View>
				</KeyboardAvoidingView>
			</>
		);
	}

	// Fallback
	return (
		<>
			<Stack.Screen options={{ title: "Join Event" }} />
			<View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
				<ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
			</View>
		</>
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
		padding: 24,
	},
	content: {
		flex: 1,
		padding: 16,
		justifyContent: "center",
		gap: 14,
	},
	loadingText: {
		fontSize: 16,
		color: "#666",
		marginTop: 16,
	},
	errorTitle: {
		fontSize: 24,
		fontWeight: "700",
		color: "#000",
		marginBottom: 12,
	},
	errorMessage: {
		fontSize: 16,
		color: "#666",
		textAlign: "center",
		marginBottom: 32,
	},
	previewCard: {
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		padding: 20,
		alignItems: "center",
	},
	previewCardDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	kicker: {
		fontSize: 11,
		fontWeight: "700",
		letterSpacing: 1.2,
		textTransform: "uppercase",
		color: "#6b7280",
		marginBottom: 8,
	},
	previewTitle: {
		fontSize: 24,
		fontWeight: "700",
		color: "#111827",
		marginBottom: 12,
		textAlign: "center",
		letterSpacing: -0.7,
	},
	previewDate: {
		fontSize: 16,
		color: "#6b7280",
		marginBottom: 4,
	},
	previewTime: {
		fontSize: 16,
		color: "#6b7280",
		marginBottom: 16,
	},
	previewStats: {
		paddingTop: 16,
		borderTopWidth: 1,
		borderTopColor: "#e5e7eb",
		width: "100%",
		alignItems: "center",
	},
	previewParticipants: {
		fontSize: 14,
		color: "#6b7280",
	},
	nameSection: {
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		padding: 16,
	},
	nameLabel: {
		fontSize: 12,
		fontWeight: "700",
		color: "#111827",
		marginBottom: 10,
		textTransform: "uppercase",
		letterSpacing: 1,
	},
	nameInput: {
		backgroundColor: "#f9fafb",
		borderRadius: 14,
		paddingVertical: 16,
		paddingHorizontal: 20,
		fontSize: 18,
		color: "#111827",
		borderWidth: 2,
		borderColor: "#e5e7eb",
	},
	nameInputDark: {
		backgroundColor: "#151821",
		borderColor: "#242833",
		color: "#fff",
	},
	inputError: {
		borderColor: "#ef4444",
	},
	nameHint: {
		fontSize: 14,
		color: "#6b7280",
		marginTop: 8,
	},
	errorText: {
		color: "#ef4444",
		fontSize: 14,
		textAlign: "center",
		marginTop: 12,
	},
	actions: {
		gap: 12,
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
	backButton: {
		paddingVertical: 16,
		alignItems: "center",
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#d1d5db",
		borderRadius: 999,
	},
	backButtonText: {
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
