import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
	ActivityIndicator,
	FlatList,
	Pressable,
	RefreshControl,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "@/constants/theme";
import { useAuthStore } from "@/store/authStore";
import { useEventStore } from "@/store/eventStore";
import type { EventRow } from "@/types/database";

export default function EventsTab() {
	const userId = useAuthStore((s) => s.userId);
	const events = useEventStore((s) => s.events);
	const loading = useEventStore((s) => s.loading);
	const loadEvents = useEventStore((s) => s.loadEvents);
	const [refreshing, setRefreshing] = useState(false);

	const refresh = useCallback(async () => {
		if (!userId) return;
		setRefreshing(true);
		try {
			await loadEvents(userId);
		} finally {
			setRefreshing(false);
		}
	}, [userId, loadEvents]);

	useFocusEffect(
		useCallback(() => {
			refresh();
		}, [refresh])
	);

	return (
		<SafeAreaView style={styles.safe}>
			<View style={styles.header}>
				<Text style={styles.title}>Events</Text>
				<View style={styles.headerActions}>
					<Pressable
						style={styles.iconBtn}
						onPress={() => router.push("/event/join")}
						accessibilityLabel="Join with code"
					>
						<Ionicons name="enter-outline" size={22} color={theme.text} />
					</Pressable>
					<Pressable
						style={[styles.iconBtn, styles.iconBtnPrimary]}
						onPress={() => router.push("/event/create")}
						accessibilityLabel="Create event"
					>
						<Ionicons name="add" size={24} color="#fff" />
					</Pressable>
				</View>
			</View>

			{loading && events.length === 0 ? (
				<View style={styles.empty}>
					<ActivityIndicator color={theme.accent} />
				</View>
			) : (
				<FlatList
					data={events}
					keyExtractor={(e) => e.id}
					contentContainerStyle={styles.list}
					refreshControl={<RefreshControl tintColor={theme.accent} refreshing={refreshing} onRefresh={refresh} />}
					ListEmptyComponent={
						<View style={styles.empty}>
							<Text style={styles.emptyTitle}>No events yet</Text>
							<Text style={styles.emptyBody}>Create one or join with a 6-character code.</Text>
						</View>
					}
					renderItem={({ item }) => <EventCard event={item} />}
				/>
			)}
		</SafeAreaView>
	);
}

function EventCard({ event }: { event: EventRow }) {
	const starts = new Date(event.starts_at);
	const dateLabel = starts.toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
	return (
		<Pressable
			style={styles.card}
			onPress={() => router.push({ pathname: "/event/[id]", params: { id: event.id } })}
		>
			<View>
				<Text style={styles.cardTitle}>{event.title}</Text>
				<Text style={styles.cardMeta}>
					{dateLabel}  ·  {event.join_code}
				</Text>
			</View>
			<Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
		</Pressable>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1, backgroundColor: theme.bg },
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingTop: 8,
		paddingBottom: 16,
	},
	headerActions: { flexDirection: "row", gap: 8 },
	title: { fontSize: 32, fontWeight: "700", color: theme.text },
	iconBtn: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: theme.surface,
		alignItems: "center",
		justifyContent: "center",
	},
	iconBtnPrimary: { backgroundColor: theme.accent },
	list: { padding: 16, gap: 12, flexGrow: 1 },
	card: {
		backgroundColor: theme.surface,
		borderRadius: theme.radius,
		padding: 16,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	cardTitle: { color: theme.text, fontSize: 17, fontWeight: "600" },
	cardMeta: { color: theme.textMuted, fontSize: 13, marginTop: 4 },
	empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
	emptyTitle: { color: theme.text, fontSize: 18, fontWeight: "600" },
	emptyBody: { color: theme.textMuted, marginTop: 6, textAlign: "center" },
});
