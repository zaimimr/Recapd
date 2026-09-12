import { useRouter } from "expo-router";
import { useEffect, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import AlbumCard from "@/components/AlbumCard";
import { Button, Pill, Screen, ScreenScroll, SectionHeader } from "@/components/ui";
import { space, theme, type } from "@/constants/theme";
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
			<ScreenScroll center contentContainerStyle={styles.content}>
				<View style={styles.hero}>
					<View style={styles.heroTop}>
						<Text style={styles.wordmark}>
							Recap<Text style={styles.wordmarkDot}>d</Text>
						</Text>
						{SUBSCRIPTIONS_ENABLED && isPro ? <Pill label="PRO" tone="accent" /> : null}
					</View>
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
	hero: {
		gap: space.sm,
		paddingTop: space.sm,
	},
	heroTop: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
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
		marginTop: space.sm,
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
