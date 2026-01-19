import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect, useCallback } from 'react';
import { format, isPast, isFuture, isWithinInterval } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { useEventStore } from '@/store/eventStore';
import { useColorScheme } from '@/components/useColorScheme';
import { Event } from '@/types/database';

interface EventWithCount extends Event {
  participant_count?: number;
}

function getEventStatus(event: Event): { label: string; color: string } {
  const now = new Date();
  const startsAt = new Date(event.starts_at);
  const endsAt = new Date(event.ends_at);

  if (event.status === 'expired') {
    return { label: 'Expired', color: '#999' };
  }
  if (isPast(endsAt)) {
    return { label: 'Ended', color: '#666' };
  }
  if (isWithinInterval(now, { start: startsAt, end: endsAt })) {
    return { label: 'Live', color: '#22c55e' };
  }
  if (isFuture(startsAt)) {
    return { label: 'Upcoming', color: '#3b82f6' };
  }
  return { label: 'Unknown', color: '#999' };
}

function EventCard({ event, onPress, isDark }: { event: EventWithCount; onPress: () => void; isDark: boolean }) {
  const status = getEventStatus(event);

  return (
    <TouchableOpacity
      style={[styles.card, isDark && styles.cardDark]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.eventTitle, isDark && styles.textDark]} numberOfLines={1}>
          {event.title}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: status.color + '20' }]}>
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>
      <Text style={[styles.eventDate, isDark && styles.textMuted]}>
        {format(new Date(event.starts_at), 'MMM d, yyyy')} • {format(new Date(event.starts_at), 'h:mm a')} - {format(new Date(event.ends_at), 'h:mm a')}
      </Text>
      <View style={styles.cardFooter}>
        <Text style={[styles.participantCount, isDark && styles.textMuted]}>
          {event.participant_count || 0} participant{event.participant_count !== 1 ? 's' : ''}
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
  const { events, isLoading, fetchUserEvents } = useEventStore();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const loadEvents = useCallback(() => {
    if (user?.id) {
      fetchUserEvents(user.id);
    }
  }, [user?.id, fetchUserEvents]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  if (!user) {
    return (
      <View style={[styles.container, styles.centered, isDark && styles.containerDark]}>
        <Text style={[styles.emptyText, isDark && styles.textMuted]}>
          Please sign in to view your events
        </Text>
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
        contentContainerStyle={events.length === 0 ? styles.emptyContainer : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={loadEvents} />
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
          ) : (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, isDark && styles.textDark]}>No Events Yet</Text>
              <Text style={[styles.emptyText, isDark && styles.textMuted]}>
                Join an event or create your own to get started
              </Text>
              <View style={styles.emptyActions}>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => router.push('/event/join')}
                >
                  <Text style={styles.emptyButtonText}>Join Event</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.emptyButton, styles.emptyButtonSecondary]}
                  onPress={() => router.push('/event/create')}
                >
                  <Text style={[styles.emptyButtonText, styles.emptyButtonTextSecondary]}>
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
    backgroundColor: '#fff',
  },
  containerDark: {
    backgroundColor: '#000',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    backgroundColor: '#f5f5f5',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardDark: {
    backgroundColor: '#1a1a1a',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    marginRight: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  eventDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  participantCount: {
    fontSize: 13,
    color: '#666',
  },
  joinCode: {
    fontSize: 13,
    color: '#666',
    fontFamily: 'SpaceMono',
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyActions: {
    gap: 12,
    width: '100%',
    maxWidth: 280,
  },
  emptyButton: {
    backgroundColor: '#000',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyButtonSecondary: {
    backgroundColor: '#f5f5f5',
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyButtonTextSecondary: {
    color: '#000',
  },
  textDark: {
    color: '#fff',
  },
  textMuted: {
    color: '#888',
  },
});
