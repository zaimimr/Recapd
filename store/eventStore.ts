import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import {
  Event,
  EventInsert,
  EventParticipant,
  EventParticipantInsert,
  MediaItem,
} from '@/types/database';
import { addDays } from 'date-fns';

interface EventWithParticipants extends Event {
  participants?: EventParticipant[];
  participant_count?: number;
}

interface EventState {
  events: EventWithParticipants[];
  currentEvent: EventWithParticipants | null;
  mediaItems: MediaItem[];
  isLoading: boolean;
  error: string | null;
  fetchUserEvents: (userId: string) => Promise<void>;
  fetchEventByCode: (joinCode: string) => Promise<EventWithParticipants | null>;
  fetchEventById: (eventId: string) => Promise<EventWithParticipants | null>;
  createEvent: (event: Omit<EventInsert, 'join_code' | 'expires_at'>, userId: string) => Promise<Event | null>;
  joinEvent: (eventId: string, userId: string, nickname?: string) => Promise<boolean>;
  fetchMediaItems: (eventId: string) => Promise<void>;
  subscribeToMediaItems: (eventId: string) => () => void;
  setCurrentEvent: (event: EventWithParticipants | null) => void;
  clearError: () => void;
}

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  currentEvent: null,
  mediaItems: [],
  isLoading: false,
  error: null,

  fetchUserEvents: async (userId: string) => {
    try {
      set({ isLoading: true, error: null });

      const { data: participations, error: partError } = await supabase
        .from('event_participants')
        .select('event_id')
        .eq('user_id', userId);

      if (partError) throw partError;

      if (!participations || participations.length === 0) {
        set({ events: [], isLoading: false });
        return;
      }

      const eventIds = participations.map((p) => p.event_id);

      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .in('id', eventIds)
        .order('starts_at', { ascending: false });

      if (eventsError) throw eventsError;

      const eventsWithCounts = await Promise.all(
        (events || []).map(async (event) => {
          const { count } = await supabase
            .from('event_participants')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', event.id);

          return { ...(event as Event), participant_count: count || 0 };
        })
      );

      set({ events: eventsWithCounts, isLoading: false });
    } catch (error) {
      console.error('Fetch events error:', error);
      set({ error: 'Failed to load events', isLoading: false });
    }
  },

  fetchEventByCode: async (joinCode: string) => {
    try {
      set({ isLoading: true, error: null });

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('join_code', joinCode.toUpperCase())
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          set({ error: 'Event not found', isLoading: false });
          return null;
        }
        throw error;
      }

      const { count } = await supabase
        .from('event_participants')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', data.id);

      const eventWithCount: EventWithParticipants = {
        ...(data as Event),
        participant_count: count || 0,
      };
      set({ isLoading: false });
      return eventWithCount;
    } catch (error) {
      console.error('Fetch event by code error:', error);
      set({ error: 'Failed to find event', isLoading: false });
      return null;
    }
  },

  fetchEventById: async (eventId: string) => {
    try {
      set({ isLoading: true, error: null });

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (error) throw error;

      const { data: participants } = await supabase
        .from('event_participants')
        .select('*')
        .eq('event_id', eventId);

      const eventWithParticipants: EventWithParticipants = {
        ...(data as Event),
        participants: (participants || []) as EventParticipant[],
        participant_count: participants?.length || 0,
      };

      set({ currentEvent: eventWithParticipants, isLoading: false });
      return eventWithParticipants;
    } catch (error) {
      console.error('Fetch event by id error:', error);
      set({ error: 'Failed to load event', isLoading: false });
      return null;
    }
  },

  createEvent: async (eventData, userId) => {
    try {
      set({ isLoading: true, error: null });

      const joinCode = generateJoinCode();
      const expiresAt = addDays(new Date(eventData.ends_at), 14).toISOString();

      const insertData: EventInsert = {
        ...eventData,
        join_code: joinCode,
        expires_at: expiresAt,
        created_by_user_id: userId,
      };

      const { data, error } = await supabase
        .from('events')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      const participantData: EventParticipantInsert = {
        event_id: data.id,
        user_id: userId,
        role: 'host',
      };

      await supabase.from('event_participants').insert(participantData);

      set({ isLoading: false });
      return data as Event;
    } catch (error) {
      console.error('Create event error:', error);
      set({ error: 'Failed to create event', isLoading: false });
      return null;
    }
  },

  joinEvent: async (eventId: string, userId: string, nickname?: string) => {
    try {
      set({ isLoading: true, error: null });

      const { data: existing } = await supabase
        .from('event_participants')
        .select('id')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .single();

      if (existing) {
        set({ isLoading: false });
        return true;
      }

      const participantData: EventParticipantInsert = {
        event_id: eventId,
        user_id: userId,
        role: 'guest',
        nickname,
      };

      const { error } = await supabase.from('event_participants').insert(participantData);

      if (error) throw error;

      set({ isLoading: false });
      return true;
    } catch (error) {
      console.error('Join event error:', error);
      set({ error: 'Failed to join event', isLoading: false });
      return false;
    }
  },

  fetchMediaItems: async (eventId: string) => {
    try {
      set({ isLoading: true, error: null });

      const { data, error } = await supabase
        .from('media_items')
        .select('*')
        .eq('event_id', eventId)
        .eq('visibility', 'shared')
        .order('captured_at', { ascending: true });

      if (error) throw error;

      set({ mediaItems: (data || []) as MediaItem[], isLoading: false });
    } catch (error) {
      console.error('Fetch media items error:', error);
      set({ error: 'Failed to load photos', isLoading: false });
    }
  },

  subscribeToMediaItems: (eventId: string) => {
    const channel = supabase
      .channel(`media_items:${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'media_items',
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          const { mediaItems } = get();

          if (payload.eventType === 'INSERT') {
            const newItem = payload.new as MediaItem;
            if (newItem.visibility === 'shared') {
              set({
                mediaItems: [...mediaItems, newItem].sort(
                  (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
                ),
              });
            }
          } else if (payload.eventType === 'DELETE') {
            const oldItem = payload.old as { id: string };
            set({ mediaItems: mediaItems.filter((item) => item.id !== oldItem.id) });
          } else if (payload.eventType === 'UPDATE') {
            const updatedItem = payload.new as MediaItem;
            if (updatedItem.visibility !== 'shared') {
              set({ mediaItems: mediaItems.filter((item) => item.id !== updatedItem.id) });
            } else {
              set({
                mediaItems: mediaItems.map((item) =>
                  item.id === updatedItem.id ? updatedItem : item
                ),
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  setCurrentEvent: (event) => {
    set({ currentEvent: event });
  },

  clearError: () => {
    set({ error: null });
  },
}));
