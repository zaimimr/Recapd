import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import AlbumCard from "@/components/AlbumCard";
import { Button, Pill, Screen, ScreenScroll, SectionHeader } from "@/components/ui";
import { CONTENT_MAX_WIDTH, space, theme, type } from "@/constants/theme";
import { SUBSCRIPTIONS_ENABLED } from "@/lib/billing/config";
import { useAuthStore } from "@/store/authStore";
import { useEventStore } from "@/store/eventStore";
import { useIsPro } from "@/store/subscriptionStore";

export default function HomeScreen() {
	const router = useRouter();
	const user = useAuthStore((state) => state.user);
	const isPro = useIsPro();
	const { events, fetchUserEvents, subscribeToUserEvents } = useEventStore();

	useEffect(() => {
		if (user?.id) {
			fetchUserEvents(user.id);
		}
	}, [user?.id, fetchUserEvents]);

	useFocusEffect(
		useCallback(() => {
			if (user?.id) {
				fetchUserEvents(user.id);
			}
		}, [user?.id, fetchUserEvents])
	);

	useEffect(() => {
		if (user?.id) {
			const unsubscribe = subscribeToUserEvents(user.id);
			return unsubscribe;
		}
	}, [user?.id, subscribeToUserEvents]);

	const activeEvents = useMemo(() => {
		const now = new Date();
		return events
			.filter((event) => {
				const expiresAt = new Date(event.expires_at || "");
				return expiresAt > now;
			})
			.slice(0, 3);
	}, [events]);

	const hasActiveEvents = activeEvents.length > 0;

	return (
		<Screen>
			<View style={styles.masthead}>
				<Text style={styles.wordmark}>
					Recap<Text style={styles.wordmarkDot}>d</Text>
				</Text>
				{SUBSCRIPTIONS_ENABLED && isPro ? <Pill label="PRO" tone="accent" /> : null}
			</View>

			<ScreenScroll center contentContainerStyle={styles.content}>
				<View style={styles.hero}>
					<Text style={styles.heroTitle}>See the night from every angle.</Text>
					<Text style={styles.heroBody}>
						One album for everyone at the party. Nothing lost in the group chat.
					</Text>
				</View>

				{hasActiveEvents ? (
					<View style={styles.section}>
						<SectionHeader
							title="Your albums"
							trailing={events.length > 3 ? <Pill label={`${events.length} total`} /> : null}
						/>
						<View style={styles.cards}>
							{activeEvents.map((event) => (
								<AlbumCard
									key={event.id}
									event={event}
									onPress={() => router.push(`/event/${event.id}`)}
								/>
							))}
						</View>
					</View>
				) : null}

				<View style={styles.section}>
					<SectionHeader
						title={hasActiveEvents ? "Join another album" : "Get the night in one place"}
					/>
					<View style={styles.actions}>
						<Button
							label="Join an album"
							icon="log-in"
							onPress={() => router.push("/event/join")}
							accessibilityHint="Enter a code or scan a QR to join an existing album"
						/>
						<Button
							label="Create an album"
							icon="plus"
							variant="secondary"
							onPress={() => router.push("/event/create")}
							accessibilityHint="Start a new album and invite your guests"
						/>
					</View>
				</View>
			</ScreenScroll>
		</Screen>
	);
}

const styles = StyleSheet.create({
	content: {
		paddingHorizontal: space.lg,
		paddingTop: space.lg,
		gap: space.xxxl,
	},
	masthead: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: space.lg,
		paddingTop: space.sm,
		width: "100%",
		maxWidth: CONTENT_MAX_WIDTH,
		alignSelf: "center",
	},
	hero: {
		gap: space.sm,
	},
	wordmark: {
		fontSize: 22,
		fontWeight: "800",
		letterSpacing: -0.9,
		color: theme.textPrimary,
	},
	wordmarkDot: {
		color: theme.accent,
	},
	heroTitle: {
		...type.display,
		color: theme.textPrimary,
	},
	heroBody: {
		...type.body,
		color: theme.textMuted,
	},
	section: {
		gap: space.lg,
	},
	cards: {
		gap: space.md,
	},
	actions: {
		gap: space.md,
	},
});
