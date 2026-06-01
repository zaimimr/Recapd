import FontAwesome from "@expo/vector-icons/FontAwesome";
import { isAfter, isBefore } from "date-fns";
import { useRouter } from "expo-router";
import { useEffect, useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColorScheme } from "@/components/useColorScheme";
import { SUBSCRIPTIONS_ENABLED } from "@/lib/billing/config";
import { formatLocalizedDateTime } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { type EventWithParticipants, useEventStore } from "@/store/eventStore";
import { useIsPro } from "@/store/subscriptionStore";

function getEventStatus(event: EventWithParticipants): {
	label: string;
	color: string;
} {
	const now = new Date();
	const startsAt = new Date(event.starts_at);
	const endsAt = new Date(event.ends_at);

	if (isBefore(now, startsAt)) {
		return { label: "Upcoming", color: "#3b82f6" };
	} else if (isAfter(now, endsAt)) {
		return { label: "Ended", color: "#6b7280" };
	} else {
		return { label: "Live", color: "#22c55e" };
	}
}

export default function HomeScreen() {
	const router = useRouter();
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";
	const user = useAuthStore((state) => state.user);
	const isPro = useIsPro();
	const { events, fetchUserEvents, subscribeToUserEvents } = useEventStore();

	useEffect(() => {
		if (user?.id) {
			fetchUserEvents(user.id);
		}
	}, [user?.id, fetchUserEvents]);

	// Subscribe to real-time updates for user's events
	useEffect(() => {
		if (user?.id) {
			const unsubscribe = subscribeToUserEvents(user.id);
			return unsubscribe;
		}
	}, [user?.id, subscribeToUserEvents]);

	const activeEvents = useMemo(() => {
		const now = new Date();
		return events
			.filter((e) => {
				const expiresAt = new Date(e.expires_at || "");
				return isAfter(expiresAt, now);
			})
			.slice(0, 3);
	}, [events]);
	const hasActiveEvents = activeEvents.length > 0;

	return (
		<ScrollView
			style={[styles.container, isDark && styles.containerDark]}
			contentContainerStyle={styles.contentContainer}
		>
			{!hasActiveEvents && (
				<View style={[styles.header, isDark && styles.panelDark]}>
					<Text style={[styles.kicker, isDark && styles.textMuted]}>Recapd</Text>
					<View style={styles.logoRow}>
						<Text style={[styles.logo, isDark && styles.textDark]}>
							See the night from every angle.
						</Text>
						{SUBSCRIPTIONS_ENABLED && isPro && (
							<View style={styles.proBadge}>
								<Text style={styles.proBadgeText}>PRO</Text>
							</View>
						)}
					</View>
					<Text style={[styles.tagline, isDark && styles.textMuted]}>
						Capture once, collect together, and keep the whole story in one clean feed.
					</Text>
				</View>
			)}

			{hasActiveEvents && (
				<View style={styles.eventsSection}>
					<View style={styles.sectionHeader}>
						<Text style={[styles.kicker, isDark && styles.textMuted]}>Your Events</Text>
						<Text style={[styles.sectionTitle, isDark && styles.textDark]}>Active rooms</Text>
					</View>
					{activeEvents.map((event) => {
						const status = getEventStatus(event);
						return (
							<TouchableOpacity
								key={event.id}
								style={[styles.eventCard, isDark && styles.eventCardDark]}
								onPress={() => router.push(`/event/${event.id}`)}
								accessibilityRole="button"
								accessibilityLabel={`${event.title}, ${formatLocalizedDateTime(
									event.starts_at,
									{ month: "short", day: "numeric" },
									{},
									", "
								)}, ${status.label}`}
								accessibilityHint="Opens event details"
							>
								<View style={styles.eventInfo}>
									<Text style={[styles.eventTitle, isDark && styles.textDark]} numberOfLines={1}>
										{event.title}
									</Text>
									<Text style={[styles.eventDate, isDark && styles.textMuted]}>
										{formatLocalizedDateTime(event.starts_at, { month: "short", day: "numeric" })}
									</Text>
								</View>
								<View style={styles.eventMeta}>
									<View style={[styles.statusBadge, { backgroundColor: `${status.color}20` }]}>
										<View style={[styles.statusDot, { backgroundColor: status.color }]} />
										<Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
									</View>
									<FontAwesome name="chevron-right" size={14} color={isDark ? "#666" : "#999"} />
								</View>
							</TouchableOpacity>
						);
					})}
				</View>
			)}

			<View style={styles.actions}>
				<Text style={[styles.kicker, isDark && styles.textMuted]}>Start</Text>
				<Text style={[styles.actionTitle, isDark && styles.textDark]}>
					{hasActiveEvents
						? "Join another room or start a new one"
						: "Open an event or start a new one"}
				</Text>
				<View style={styles.actionRow}>
					<TouchableOpacity
						style={[styles.button, styles.primaryButton, isDark && styles.primaryButtonDark]}
						onPress={() => router.push("/event/join")}
						accessibilityRole="button"
						accessibilityLabel="Join Event"
						accessibilityHint="Enter a code to join an existing event"
					>
						<FontAwesome name="sign-in" size={14} color={isDark ? "#0a0d12" : "#fff"} />
						<Text style={[styles.primaryButtonText, isDark && styles.primaryButtonTextDark]}>
							Join Event
						</Text>
					</TouchableOpacity>

					<TouchableOpacity
						style={[styles.button, styles.secondaryButton, isDark && styles.secondaryButtonDark]}
						onPress={() => router.push("/event/create")}
						accessibilityRole="button"
						accessibilityLabel="Create Event"
						accessibilityHint="Create a new event to share photos"
					>
						<FontAwesome name="plus" size={14} color={isDark ? "#fff" : "#111827"} />
						<Text style={[styles.secondaryButtonText, isDark && styles.textDark]}>
							Create Event
						</Text>
					</TouchableOpacity>
				</View>
			</View>

			{!hasActiveEvents && (
				<View style={styles.footer}>
					<Text style={[styles.footerText, isDark && styles.textMuted]}>
						Create an event to share photos with your group
					</Text>
				</View>
			)}
		</ScrollView>
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
	contentContainer: {
		padding: 16,
		paddingTop: 20,
		flexGrow: 1,
		gap: 16,
	},
	header: {
		marginTop: 44,
		paddingHorizontal: 16,
		paddingVertical: 18,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		gap: 8,
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
	logoRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 12,
	},
	logo: {
		flex: 1,
		fontSize: 34,
		fontWeight: "700",
		color: "#111827",
		letterSpacing: -1.2,
		lineHeight: 38,
	},
	proBadge: {
		backgroundColor: "#111827",
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 999,
		alignSelf: "flex-start",
	},
	proBadgeText: {
		fontSize: 11,
		fontWeight: "700",
		color: "#fff",
		letterSpacing: 0.8,
	},
	tagline: {
		fontSize: 15,
		color: "#6b7280",
		lineHeight: 22,
	},
	eventsSection: {
		gap: 12,
		marginTop: 28,
	},
	sectionHeader: {
		paddingHorizontal: 2,
		paddingVertical: 2,
		gap: 4,
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: "700",
		color: "#111827",
		letterSpacing: -0.5,
	},
	eventCard: {
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		paddingHorizontal: 16,
		paddingVertical: 14,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	eventCardDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	eventInfo: {
		flex: 1,
		marginRight: 12,
	},
	eventTitle: {
		fontSize: 17,
		fontWeight: "700",
		color: "#111827",
	},
	eventDate: {
		fontSize: 13,
		color: "#6b7280",
		marginTop: 4,
	},
	eventMeta: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	statusBadge: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 9,
		paddingVertical: 5,
		borderRadius: 999,
		gap: 4,
	},
	statusDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
	},
	statusText: {
		fontSize: 12,
		fontWeight: "600",
	},
	actions: {
		flex: 1,
		justifyContent: "center",
		gap: 12,
	},
	actionTitle: {
		fontSize: 20,
		fontWeight: "700",
		color: "#111827",
		letterSpacing: -0.4,
	},
	actionRow: {
		flexDirection: "row",
		gap: 10,
	},
	button: {
		flex: 1,
		paddingVertical: 16,
		paddingHorizontal: 18,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
		flexDirection: "row",
		gap: 8,
	},
	primaryButton: {
		backgroundColor: "#111827",
	},
	primaryButtonDark: {
		backgroundColor: "#ffffff",
	},
	primaryButtonText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "600",
	},
	primaryButtonTextDark: {
		color: "#0a0d12",
	},
	secondaryButton: {
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#d1d5db",
	},
	secondaryButtonDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	secondaryButtonText: {
		color: "#111827",
		fontSize: 16,
		fontWeight: "600",
	},
	footer: {
		alignItems: "center",
		paddingBottom: 28,
		paddingTop: 8,
	},
	footerText: {
		fontSize: 13,
		color: "#6b7280",
		textAlign: "center",
	},
	textDark: {
		color: "#fff",
	},
	textMuted: {
		color: "#888",
	},
});
