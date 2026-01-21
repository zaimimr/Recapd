import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import {
  Event,
  EventInsert,
  EventUpdate,
  EventParticipant,
  EventParticipantInsert,
  MediaItemWithUser,
} from '@/types/database';
import { addDays } from 'date-fns';
import {
  PendingUpload,
  generateUploadId,
  processUploadQueue,
  setUploadCallbacks,
} from '@/lib/uploadQueue';
import { LocalPhoto } from '@/lib/mediaLibrary';

export interface EventWithParticipants extends Event {
  participants?: EventParticipant[];
  participant_count?: number;
  userRole?: 'host' | 'guest';
}

export interface ParticipantWithStats {
  userId: string;
  displayName: string;
  role: 'host' | 'guest';
  photoCount: number;
  joinedAt: string;
}

interface EventState {
  events: EventWithParticipants[];
  currentEvent: EventWithParticipants | null;
  mediaItems: MediaItemWithUser[];
  pendingUploads: PendingUpload[];
  isLoading: boolean;
  error: string | null;
  fetchUserEvents: (userId: string) => Promise<void>;
  fetchEventByCode: (joinCode: string) => Promise<EventWithParticipants | null>;
  fetchEventById: (eventId: string) => Promise<EventWithParticipants | null>;
  createEvent: (event: Omit<EventInsert, 'join_code' | 'expires_at'>, userId: string) => Promise<Event | null>;
  updateEvent: (eventId: string, updates: Partial<EventUpdate>) => Promise<boolean>;
  joinEvent: (eventId: string, userId: string, nickname?: string) => Promise<boolean>;
  fetchMediaItems: (eventId: string) => Promise<void>;
  subscribeToMediaItems: (eventId: string) => () => void;
  setCurrentEvent: (event: EventWithParticipants | null) => void;
  clearError: () => void;
  addPendingUploads: (photos: LocalPhoto[], eventId: string, userId: string) => void;
  processPendingUploads: () => Promise<void>;
  retryFailedUpload: (id: string) => void;
  removePendingUpload: (id: string) => void;
  deletePhoto: (mediaItemId: string, eventId: string) => Promise<boolean>;
  fetchParticipantStats: (eventId: string) => Promise<ParticipantWithStats[]>;
  getMergedTimeline: (eventId: string) => (MediaItemWithUser & { isPending?: boolean; localUri?: string; syncStatus?: string })[];
}

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const useEventStore = create<EventState>((set, get) => {
  setUploadCallbacks({
    onComplete: (id, _storagePath) => {
      set((state) => ({
        pendingUploads: state.pendingUploads.filter((u) => u.id !== id),
      }));
    },
    onFailed: (id, error) => {
      set((state) => ({
        pendingUploads: state.pendingUploads.map((u) =>
          u.id === id ? { ...u, status: 'failed' as const, error } : u
        ),
      }));
    },
    onStatusChange: (id, status) => {
      set((state) => ({
        pendingUploads: state.pendingUploads.map((u) =>
          u.id === id ? { ...u, status } : u
        ),
      }));
    },
  });

  return {
  events: [],
  currentEvent: null,
  mediaItems: [],
  pendingUploads: [],
  isLoading: false,
  error: null,

  fetchUserEvents: async (userId: string) => {
    try {
      set({ isLoading: true, error: null });

      const { data: participations, error: partError } = await supabase
        .from('event_participants')
        .select('event_id, role')
        .eq('user_id', userId);

      if (partError) throw partError;

      if (!participations || participations.length === 0) {
        set({ events: [], isLoading: false });
        return;
      }

      const eventIds = participations.map((p) => p.event_id);
      const roleMap = new Map(participations.map((p) => [p.event_id, p.role]));

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

          return {
            ...(event as Event),
            participant_count: count || 0,
            userRole: roleMap.get(event.id) as 'host' | 'guest',
          };
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

  updateEvent: async (eventId: string, updates: Partial<EventUpdate>) => {
    try {
      set({ isLoading: true, error: null });

      const updateData: EventUpdate = { ...updates };
      if (updates.ends_at) {
        updateData.expires_at = addDays(new Date(updates.ends_at), 14).toISOString();
      }

      const { error } = await supabase
        .from('events')
        .update(updateData)
        .eq('id', eventId);

      if (error) throw error;

      await get().fetchEventById(eventId);
      set({ isLoading: false });
      return true;
    } catch (error) {
      console.error('Update event error:', error);
      set({ error: 'Failed to update event', isLoading: false });
      return false;
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
        .select('*, uploader:users!uploaded_by_user_id(display_name)')
        .eq('event_id', eventId)
        .eq('visibility', 'shared')
        .order('captured_at', { ascending: true });

      if (error) throw error;

      set({ mediaItems: (data || []) as MediaItemWithUser[], isLoading: false });
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
        async (payload) => {
          const { mediaItems } = get();

          if (payload.eventType === 'INSERT') {
            const newItem = payload.new as MediaItemWithUser;
            if (newItem.visibility === 'shared') {
              if (newItem.uploaded_by_user_id) {
                const { data: userData } = await supabase
                  .from('users')
                  .select('display_name')
                  .eq('id', newItem.uploaded_by_user_id)
                  .single();
                newItem.uploader = userData;
              }
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
            const updatedItem = payload.new as MediaItemWithUser;
            if (updatedItem.visibility !== 'shared') {
              set({ mediaItems: mediaItems.filter((item) => item.id !== updatedItem.id) });
            } else {
              const existingItem = mediaItems.find((item) => item.id === updatedItem.id);
              updatedItem.uploader = existingItem?.uploader;
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

  addPendingUploads: (photos: LocalPhoto[], eventId: string, userId: string) => {
    const newUploads: PendingUpload[] = photos.map((photo) => ({
      id: generateUploadId(),
      localUri: photo.uri,
      eventId,
      userId,
      capturedAt: new Date(photo.creationTime),
      width: photo.width,
      height: photo.height,
      status: 'pending' as const,
      retryCount: 0,
    }));

    set((state) => ({
      pendingUploads: [...state.pendingUploads, ...newUploads],
    }));

    get().processPendingUploads();
  },

  processPendingUploads: async () => {
    const { pendingUploads } = get();
    await processUploadQueue(
      pendingUploads,
      () => get().pendingUploads,
      (id, updates) => {
        set((state) => ({
          pendingUploads: state.pendingUploads.map((u) =>
            u.id === id ? { ...u, ...updates } : u
          ),
        }));
      }
    );
  },

  retryFailedUpload: (id: string) => {
    set((state) => ({
      pendingUploads: state.pendingUploads.map((u) =>
        u.id === id ? { ...u, status: 'pending' as const } : u
      ),
    }));
    get().processPendingUploads();
  },

  removePendingUpload: (id: string) => {
    set((state) => ({
      pendingUploads: state.pendingUploads.filter((u) => u.id !== id),
    }));
  },

  deletePhoto: async (mediaItemId: string, _eventId: string) => {
    const { mediaItems } = get();
    const photoToDelete = mediaItems.find((m) => m.id === mediaItemId);

    set((state) => ({
      mediaItems: state.mediaItems.filter((m) => m.id !== mediaItemId),
    }));

    const { error } = await supabase
      .from('media_items')
      .update({ visibility: 'deleted', deleted_at: new Date().toISOString() })
      .eq('id', mediaItemId);

    if (error) {
      if (photoToDelete) {
        set((state) => ({
          mediaItems: [...state.mediaItems, photoToDelete].sort(
            (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
          ),
        }));
      }
      return false;
    }
    return true;
  },

  fetchParticipantStats: async (eventId: string) => {
    const { data: participants, error: partError } = await supabase
      .from('event_participants')
      .select('*, user:users(id, display_name)')
      .eq('event_id', eventId);

    if (partError || !participants) return [];

    const { data: photoCounts } = await supabase
      .from('media_items')
      .select('uploaded_by_user_id')
      .eq('event_id', eventId)
      .eq('visibility', 'shared');

    const countMap: Record<string, number> = {};
    photoCounts?.forEach((item) => {
      if (item.uploaded_by_user_id) {
        countMap[item.uploaded_by_user_id] = (countMap[item.uploaded_by_user_id] || 0) + 1;
      }
    });

    return participants.map((p) => ({
      userId: p.user_id,
      displayName: (p.user as { display_name: string })?.display_name || 'Unknown',
      role: p.role as 'host' | 'guest',
      photoCount: countMap[p.user_id] || 0,
      joinedAt: p.joined_at,
    }));
  },

  getMergedTimeline: (eventId: string) => {
    const { mediaItems, pendingUploads } = get();

    const pending = pendingUploads
      .filter((p) => p.eventId === eventId)
      .map((p) => ({
        id: p.id,
        event_id: p.eventId,
        uploaded_by_user_id: p.userId,
        captured_at: p.capturedAt.toISOString(),
        uploaded_at: new Date().toISOString(),
        media_type: 'photo' as const,
        width: p.width,
        height: p.height,
        duration_seconds: null,
        file_size_bytes: null,
        storage_path: '',
        thumbnail_path: null,
        visibility: 'shared' as const,
        deleted_at: null,
        uploader: null,
        isPending: true,
        localUri: p.localUri,
        syncStatus: p.status,
      }));

    return [...mediaItems.map((m) => ({ ...m, isPending: false, localUri: undefined, syncStatus: undefined })), ...pending].sort(
      (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
    );
  },
};
});
