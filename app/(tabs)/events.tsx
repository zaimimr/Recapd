import { useColorScheme } from "@/components/useColorScheme";
import { useAuthStore } from "@/store/authStore";
import { EventWithParticipants, useEventStore } from "@/store/eventStore";
import { Event } from "@/types/database";
import { format, isFuture, isPast, isWithinInterval } from "date-fns";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

function getEventStatus(event: Event): { label: string; color: string } {
  const now = new Date();
  const startsAt = new Date(event.starts_at);
  const endsAt = new Date(event.ends_at);

  if (event.status === "expired") {
    return { label: "Expired", color: "#999" };
  }
  if (isPast(endsAt)) {
    return { label: "Ended", color: "#666" };
  }
  if (isWithinInterval(now, { start: startsAt, end: endsAt })) {
    return { label: "Live", color: "#22c55e" };
  }
  if (isFuture(startsAt)) {
    return { label: "Upcoming", color: "#3b82f6" };
  }
  return { label: "Unknown", color: "#999" };
}

function EventCard({
  event,
  onPress,
  isDark,
}: {
  event: EventWithParticipants;
  onPress: () => void;
  isDark: boolean;
}) {
  const status = getEventStatus(event);
  const isHost = event.userRole === "host";

  return (
    <TouchableOpacity
      style={[styles.card, isDark && styles.cardDark]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.eventTitle, isDark && styles.textDark]}
            numberOfLines={1}
          >
            {event.title}
          </Text>
          {isHost && (
            <View style={styles.hostBadge}>
              <Text style={styles.hostBadgeText}>Host</Text>
            </View>
          )}
        </View>
        <View
          style={[styles.statusBadge, { backgroundColor: status.color + "20" }]}
        >
          <Text style={[styles.statusText, { color: status.color }]}>
            {status.label}
          </Text>
        </View>
      </View>
      <Text style={[styles.eventDate, isDark && styles.textMuted]}>
        {format(new Date(event.starts_at), "MMM d, yyyy")} •{" "}
        {format(new Date(event.starts_at), "h:mm a")} -{" "}
        {format(new Date(event.ends_at), "h:mm a")}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={[styles.participantCount, isDark && styles.textMuted]}>
          {event.participant_count || 0} participant
          {event.participant_count !== 1 ? "s" : ""}
        </Text>
        <Text style={[styles.joinCode, isDark && styles.textMuted]}>
          Code: {event.join_code}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function EventsScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const createUser = useAuthStore((state) => state.createUser);
  const { events, isLoading, fetchUserEvents, subscribeToUserEvents } =
    useEventStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  async function handleCreateProfile() {
    const trimmedName = displayName.trim();
    if (trimmedName.length < 2) return;
    setIsCreating(true);
    await createUser(trimmedName);
    setIsCreating(false);
  }

  const loadEvents = useCallback(() => {
    if (user?.id) {
      fetchUserEvents(user.id);
    }
  }, [user?.id, fetchUserEvents]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadEvents();
    setIsRefreshing(false);
  }, [loadEvents]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Subscribe to real-time updates for user's events
  useEffect(() => {
    if (user?.id) {
      const unsubscribe = subscribeToUserEvents(user.id);
      return unsubscribe;
    }
  }, [user?.id, subscribeToUserEvents]);

  if (!user) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          isDark && styles.containerDark,
        ]}
      >
        <Text style={[styles.welcomeTitle, isDark && styles.textDark]}>
          What should we call you?
        </Text>
        <TextInput
          style={[styles.nameInput, isDark && styles.nameInputDark]}
          placeholder="Enter your name"
          placeholderTextColor={isDark ? "#666" : "#999"}
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={30}
          returnKeyType="done"
          onSubmitEditing={handleCreateProfile}
        />
        <TouchableOpacity
          style={[
            styles.continueButton,
            (displayName.trim().length < 2 || isCreating) && styles.buttonDisabled,
          ]}
          onPress={handleCreateProfile}
          disabled={displayName.trim().length < 2 || isCreating}
        >
          {isCreating ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.continueButtonText}>Continue</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <EventCard
            event={item}
            isDark={isDark}
            onPress={() => router.push(`/event/${item.id}`)}
          />
        )}
        contentContainerStyle={[
          styles.listContent,
          events.length === 0 && styles.emptyContainer,
        ]}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
          ) : (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
                No Events Yet
              </Text>
              <Text style={[styles.emptyText, isDark && styles.textMuted]}>
                Join an event or create your own to get started
              </Text>
              <View style={styles.emptyActions}>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => router.push("/event/join")}
                >
                  <Text style={styles.emptyButtonText}>Join Event</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.emptyButton, styles.emptyButtonSecondary]}
                  onPress={() => router.push("/event/create")}
                >
                  <Text
                    style={[
                      styles.emptyButtonText,
                      styles.emptyButtonTextSecondary,
                    ]}
                  >
                    Create Event
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )
        }
      />
    </View>
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
  listContent: {
    padding: 16,
    gap: 12,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  card: {
    backgroundColor: "#f5f5f5",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardDark: {
    backgroundColor: "#1a1a1a",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
    gap: 8,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
    flexShrink: 1,
  },
  hostBadge: {
    backgroundColor: "#7c3aed",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  hostBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  eventDate: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  participantCount: {
    fontSize: 13,
    color: "#666",
  },
  joinCode: {
    fontSize: 13,
    color: "#666",
    fontFamily: "SpaceMono",
  },
  emptyState: {
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#000",
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  emptyActions: {
    gap: 12,
    width: "100%",
    maxWidth: 280,
  },
  emptyButton: {
    backgroundColor: "#000",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
  },
  emptyButtonSecondary: {
    backgroundColor: "#f5f5f5",
  },
  emptyButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyButtonTextSecondary: {
    color: "#000",
  },
  textDark: {
    color: "#fff",
  },
  textMuted: {
    color: "#888",
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "600",
    color: "#000",
    marginBottom: 24,
    textAlign: "center",
  },
  nameInput: {
    backgroundColor: "#f5f5f5",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    fontSize: 18,
    color: "#000",
    width: "100%",
    maxWidth: 320,
    marginBottom: 16,
  },
  nameInputDark: {
    backgroundColor: "#1a1a1a",
    color: "#fff",
  },
  continueButton: {
    backgroundColor: "#000",
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 14,
    alignItems: "center",
    minWidth: 200,
  },
  continueButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
