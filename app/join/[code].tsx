import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	KeyboardAvoidingView,
	Platform,
	StyleSheet,
	Text,
	View,
} from "react-native";
import {
	Button,
	Card,
	EmptyState,
	Eyebrow,
	Field,
	NavBar,
	Pill,
	Screen,
	ScreenScroll,
} from "@/components/ui";
import { space, theme, type } from "@/constants/theme";
import { logger } from "@/lib/logger";
import { formatLocalizedDate, formatLocalizedTimeRange } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { EVENT_NOT_FOUND_ERROR, useEventStore } from "@/store/eventStore";
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

	// Looking up the code from the deep link.
	if (isLoading && !lookupDone) {
		return (
			<Screen style={styles.centered}>
				<ActivityIndicator size="large" color={theme.accent} />
				<Text style={styles.loadingText}>Looking up the album…</Text>
			</Screen>
		);
	}

	// The code does not resolve to a live album.
	if (lookupDone && !eventPreview) {
		return (
			<Screen edges="both">
				<NavBar title="Join album" onBack={handleEnterDifferentCode} />
				<EmptyState
					icon="alert-circle"
					title="No album with that code"
					body={
						error && error !== EVENT_NOT_FOUND_ERROR
							? error
							: `Nothing matches "${code}". It may have expired, or the code was mistyped.`
					}
					action={<Button label="Enter a different code" onPress={handleEnterDifferentCode} />}
				/>
			</Screen>
		);
	}

	if (eventPreview) {
		return (
			<Screen edges="both">
				<NavBar title="Join album" onBack={handleEnterDifferentCode} />
				<KeyboardAvoidingView
					style={styles.flex}
					behavior={Platform.OS === "ios" ? "padding" : "height"}
				>
					<ScreenScroll contentContainerStyle={styles.content}>
						<Card>
							<Eyebrow>You're invited to</Eyebrow>
							<Text style={styles.previewTitle}>{eventPreview.title}</Text>
							<Text style={styles.previewMeta}>
								{formatLocalizedDate(eventPreview.starts_at, {
									weekday: "long",
									month: "long",
									day: "numeric",
								})}
								{"\n"}
								{formatLocalizedTimeRange(eventPreview.starts_at, eventPreview.ends_at)}
							</Text>
							<View style={styles.previewPills}>
								<Pill
									label={`${eventPreview.participant_count || 0} ${
										eventPreview.participant_count === 1 ? "guest" : "guests"
									}`}
									icon="users"
								/>
							</View>
						</Card>

						{!user ? (
							<Field
								label="What should we call you?"
								placeholder="Your first name"
								value={displayName}
								onChangeText={(text) => {
									setDisplayName(text);
									setNameError("");
								}}
								error={nameError || null}
								hint="This is how you show up on the photos you add."
								autoCapitalize="words"
								autoCorrect={false}
								maxLength={30}
								returnKeyType="go"
								onSubmitEditing={handleJoin}
							/>
						) : null}

						<Button
							label="Join the album"
							icon="log-in"
							loading={isJoining}
							disabled={!canJoin}
							onPress={handleJoin}
						/>
						<Button
							label="Use a different code"
							variant="ghost"
							size="md"
							onPress={handleEnterDifferentCode}
						/>
					</ScreenScroll>
				</KeyboardAvoidingView>
			</Screen>
		);
	}

	return (
		<Screen style={styles.centered}>
			<ActivityIndicator size="large" color={theme.accent} />
		</Screen>
	);
}

const styles = StyleSheet.create({
	flex: {
		flex: 1,
	},
	centered: {
		alignItems: "center",
		justifyContent: "center",
		gap: space.lg,
	},
	loadingText: {
		...type.body,
		color: theme.textMuted,
	},
	content: {
		paddingHorizontal: space.lg,
		paddingTop: space.sm,
		paddingBottom: space.xxl,
		gap: space.lg,
	},
	previewTitle: {
		...type.title,
		color: theme.textPrimary,
		marginTop: space.sm,
	},
	previewMeta: {
		...type.body,
		color: theme.textMuted,
		marginTop: space.sm,
		lineHeight: 22,
	},
	previewPills: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 6,
		marginTop: space.lg,
	},
});
