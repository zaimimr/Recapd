import FontAwesome from "@expo/vector-icons/FontAwesome";
import { format, isAfter, isBefore } from "date-fns";
import { useRouter } from "expo-router";
import { useEffect, useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColorScheme } from "@/components/useColorScheme";
import { SUBSCRIPTIONS_ENABLED } from "@/lib/subscription";
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

	return (
		<ScrollView
			style={[styles.container, isDark && styles.containerDark]}
			contentContainerStyle={styles.contentContainer}
		>
			<View style={styles.header}>
				<View style={styles.logoRow}>
					<Text style={[styles.logo, isDark && styles.textDark]}>Recapd</Text>
					{SUBSCRIPTIONS_ENABLED && isPro && (
						<View style={styles.proBadge}>
							<Text style={styles.proBadgeText}>PRO</Text>
						</View>
					)}
				</View>
				<Text style={[styles.tagline, isDark && styles.textMuted]}>
					See the night from everyone's eyes
				</Text>
			</View>

			{activeEvents.length > 0 && (
				<View style={styles.eventsSection}>
					<Text style={[styles.sectionTitle, isDark && styles.textDark]}>Your Events</Text>
					{activeEvents.map((event) => {
						const status = getEventStatus(event);
						return (
							<TouchableOpacity
								key={event.id}
								style={[styles.eventCard, isDark && styles.eventCardDark]}
								onPress={() => router.push(`/event/${event.id}`)}
							>
								<View style={styles.eventInfo}>
									<Text style={[styles.eventTitle, isDark && styles.textDark]} numberOfLines={1}>
										{event.title}
									</Text>
									<Text style={[styles.eventDate, isDark && styles.textMuted]}>
										{format(new Date(event.starts_at), "MMM d, h:mm a")}
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
				<TouchableOpacity
					style={[styles.button, styles.primaryButton]}
					onPress={() => router.push("/event/join")}
				>
					<Text style={styles.primaryButtonText}>Join Event</Text>
				</TouchableOpacity>

				<TouchableOpacity
					style={[styles.button, styles.secondaryButton, isDark && styles.secondaryButtonDark]}
					onPress={() => router.push("/event/create")}
				>
					<Text style={[styles.secondaryButtonText, isDark && styles.textDark]}>Create Event</Text>
				</TouchableOpacity>
			</View>

			<View style={styles.footer}>
				<Text style={[styles.footerText, isDark && styles.textMuted]}>
					Create an event to share photos with your group
				</Text>
			</View>
		</ScrollView>
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
	contentContainer: {
		padding: 24,
		flexGrow: 1,
	},
	header: {
		marginTop: 60,
		alignItems: "center",
	},
	logoRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	logo: {
		fontSize: 42,
		fontWeight: "700",
		color: "#000",
		letterSpacing: -1,
	},
	proBadge: {
		backgroundColor: "#f59e0b",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 6,
	},
	proBadgeText: {
		fontSize: 12,
		fontWeight: "700",
		color: "#fff",
	},
	tagline: {
		fontSize: 16,
		color: "#666",
		marginTop: 8,
	},
	eventsSection: {
		marginTop: 32,
		gap: 12,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "600",
		color: "#000",
		marginBottom: 4,
	},
	eventCard: {
		backgroundColor: "#f5f5f5",
		borderRadius: 12,
		padding: 16,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	eventCardDark: {
		backgroundColor: "#1a1a1a",
	},
	eventInfo: {
		flex: 1,
		marginRight: 12,
	},
	eventTitle: {
		fontSize: 16,
		fontWeight: "600",
		color: "#000",
	},
	eventDate: {
		fontSize: 13,
		color: "#666",
		marginTop: 2,
	},
	eventMeta: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	statusBadge: {
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 6,
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
		gap: 16,
	},
	button: {
		paddingVertical: 18,
		paddingHorizontal: 32,
		borderRadius: 14,
		alignItems: "center",
	},
	primaryButton: {
		backgroundColor: "#000",
	},
	primaryButtonText: {
		color: "#fff",
		fontSize: 18,
		fontWeight: "600",
	},
	secondaryButton: {
		backgroundColor: "#f5f5f5",
	},
	secondaryButtonDark: {
		backgroundColor: "#1a1a1a",
	},
	secondaryButtonText: {
		color: "#000",
		fontSize: 18,
		fontWeight: "600",
	},
	footer: {
		alignItems: "center",
		paddingBottom: 40,
	},
	footerText: {
		fontSize: 14,
		color: "#999",
		textAlign: "center",
	},
	textDark: {
		color: "#fff",
	},
	textMuted: {
		color: "#888",
	},
});
