import { format } from "date-fns";
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
					console.error("Event lookup failed:", error);
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
							<Text style={[styles.previewTitle, isDark && styles.textDark]}>
								{eventPreview.title}
							</Text>
							<Text style={[styles.previewDate, isDark && styles.textMuted]}>
								{format(new Date(eventPreview.starts_at), "EEEE, MMMM d, yyyy")}
							</Text>
							<Text style={[styles.previewTime, isDark && styles.textMuted]}>
								{format(new Date(eventPreview.starts_at), "h:mm a")} -{" "}
								{format(new Date(eventPreview.ends_at), "h:mm a")}
							</Text>
							<View style={styles.previewStats}>
								<Text style={[styles.previewParticipants, isDark && styles.textMuted]}>
									{eventPreview.participant_count || 0} participant
									{eventPreview.participant_count !== 1 ? "s" : ""}
								</Text>
							</View>
						</View>

						{!user && (
							<View style={styles.nameSection}>
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
		backgroundColor: "#fff",
	},
	containerDark: {
		backgroundColor: "#000",
	},
	centered: {
		justifyContent: "center",
		alignItems: "center",
		padding: 24,
	},
	content: {
		flex: 1,
		padding: 24,
		justifyContent: "center",
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
		backgroundColor: "#f5f5f5",
		borderRadius: 20,
		padding: 24,
		alignItems: "center",
		marginBottom: 24,
	},
	previewCardDark: {
		backgroundColor: "#1a1a1a",
	},
	previewTitle: {
		fontSize: 24,
		fontWeight: "700",
		color: "#000",
		marginBottom: 12,
		textAlign: "center",
	},
	previewDate: {
		fontSize: 16,
		color: "#666",
		marginBottom: 4,
	},
	previewTime: {
		fontSize: 16,
		color: "#666",
		marginBottom: 16,
	},
	previewStats: {
		paddingTop: 16,
		borderTopWidth: 1,
		borderTopColor: "#e5e5e5",
		width: "100%",
		alignItems: "center",
	},
	previewParticipants: {
		fontSize: 14,
		color: "#666",
	},
	nameSection: {
		marginBottom: 24,
	},
	nameLabel: {
		fontSize: 16,
		fontWeight: "600",
		color: "#000",
		marginBottom: 8,
	},
	nameInput: {
		backgroundColor: "#f5f5f5",
		borderRadius: 14,
		paddingVertical: 16,
		paddingHorizontal: 20,
		fontSize: 18,
		color: "#000",
		borderWidth: 2,
		borderColor: "transparent",
	},
	nameInputDark: {
		backgroundColor: "#1a1a1a",
		color: "#fff",
	},
	inputError: {
		borderColor: "#ef4444",
	},
	nameHint: {
		fontSize: 14,
		color: "#666",
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
		backgroundColor: "#000",
		paddingVertical: 18,
		borderRadius: 14,
		alignItems: "center",
	},
	buttonDisabled: {
		opacity: 0.5,
	},
	buttonText: {
		color: "#fff",
		fontSize: 18,
		fontWeight: "600",
	},
	backButton: {
		paddingVertical: 16,
		alignItems: "center",
	},
	backButtonText: {
		color: "#000",
		fontSize: 16,
		fontWeight: "500",
	},
	textDark: {
		color: "#fff",
	},
	textMuted: {
		color: "#888",
	},
});
