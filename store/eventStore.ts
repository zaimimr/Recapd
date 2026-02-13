import AsyncStorage from "@react-native-async-storage/async-storage";
import { addDays } from "date-fns";
import { create } from "zustand";
import { safeDate } from "@/lib/dateUtils";
import type { LocalPhoto } from "@/lib/mediaLibrary";
import { sendParticipantLimitNotification } from "@/lib/notifications";
import { SUBSCRIPTIONS_ENABLED } from "@/lib/subscription";
import { supabase } from "@/lib/supabase";
import {
	generateUploadId,
	type PendingUpload,
	processUploadQueue,
	setUploadCallbacks,
} from "@/lib/uploadQueue";
import type {
	Event,
	EventInsert,
	EventParticipant,
	EventParticipantInsert,
	EventUpdate,
	MediaItemWithUser,
} from "@/types/database";
import { FREE_PARTICIPANT_LIMIT } from "@/types/subscription";

const PENDING_UPLOADS_KEY = "recapd_pending_uploads";

async function persistPendingUploads(uploads: PendingUpload[]) {
	await AsyncStorage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(uploads));
}

async function loadPendingUploads(): Promise<PendingUpload[]> {
	const data = await AsyncStorage.getItem(PENDING_UPLOADS_KEY);
	if (!data) return [];
	try {
		const uploads = JSON.parse(data);
		return uploads.map((u: PendingUpload & { capturedAt: string }) => ({
			...u,
			capturedAt: safeDate(u.capturedAt),
			status: u.status === "syncing" ? "pending" : u.status,
		}));
	} catch {
		console.error("Corrupted pending uploads data, clearing");
		await AsyncStorage.removeItem(PENDING_UPLOADS_KEY);
		return [];
	}
}

export interface EventWithParticipants extends Event {
	participants?: EventParticipant[];
	participant_count?: number;
	userRole?: "host" | "guest";
	hostIsPro?: boolean;
	hostDisplayName?: string;
}

export interface ParticipantWithStats {
	userId: string;
	displayName: string;
	role: "host" | "guest";
	photoCount: number;
	joinedAt: string;
	noPhotosToUpload: boolean;
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
	createEvent: (
		event: Omit<EventInsert, "join_code" | "expires_at">,
		userId: string
	) => Promise<Event | null>;
	updateEvent: (eventId: string, updates: Partial<EventUpdate>) => Promise<boolean>;
	joinEvent: (eventId: string, userId: string, nickname?: string) => Promise<boolean>;
	fetchMediaItems: (eventId: string) => Promise<void>;
	subscribeToMediaItems: (eventId: string) => () => void;
	subscribeToParticipants: (eventId: string) => () => void;
	subscribeToEvent: (eventId: string) => () => void;
	subscribeToUserEvents: (userId: string) => () => void;
	setCurrentEvent: (event: EventWithParticipants | null) => void;
	clearError: () => void;
	addPendingUploads: (
		photos: LocalPhoto[],
		eventId: string,
		userId: string
	) => Promise<{ added: number; skipped: number }>;
	processPendingUploads: () => Promise<void>;
	retryFailedUpload: (id: string) => void;
	removePendingUpload: (id: string) => void;
	deletePhoto: (mediaItemId: string, eventId: string) => Promise<boolean>;
	deleteEvent: (eventId: string, userId: string) => Promise<boolean>;
	fetchParticipantStats: (eventId: string) => Promise<ParticipantWithStats[]>;
	getMergedTimeline: (eventId: string) => (MediaItemWithUser & {
		isPending?: boolean;
		localUri?: string;
		syncStatus?: string;
	})[];
	initializePendingUploads: () => Promise<void>;
	getUploadedPhotoIdsForEvent: (
		eventId: string,
		userId: string,
		localPhotos: LocalPhoto[]
	) => Promise<Set<string>>;
	markNoPhotosToUpload: (eventId: string, userId: string) => Promise<boolean>;
	getNoPhotosToUpload: (eventId: string, userId: string) => Promise<boolean>;
	leaveEvent: (
		eventId: string,
		userId: string
	) => Promise<{ success: boolean; isLastHost?: boolean }>;
	removeParticipant: (
		eventId: string,
		targetUserId: string,
		hostUserId: string
	) => Promise<boolean>;
}

function generateJoinCode(): string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
	let code = "";
	for (let i = 0; i < 6; i++) {
		code += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return code;
}

export const useEventStore = create<EventState>((set, get) => {
	setUploadCallbacks({
		onComplete: async (id, _storagePath) => {
			const completedUpload = get().pendingUploads.find((u) => u.id === id);
			const newUploads = get().pendingUploads.filter((u) => u.id !== id);
			set({ pendingUploads: newUploads });
			await persistPendingUploads(newUploads);
			if (completedUpload) {
				try {
					await get().fetchMediaItems(completedUpload.eventId);
				} catch (error) {
					console.error("Failed to refresh media items after upload:", error);
				}
			}
		},
		onFailed: async (id, error) => {
			const newUploads = get().pendingUploads.map((u) =>
				u.id === id ? { ...u, status: "failed" as const, error } : u
			);
			set({ pendingUploads: newUploads });
			await persistPendingUploads(newUploads);
		},
		onStatusChange: async (id, status) => {
			const newUploads = get().pendingUploads.map((u) => (u.id === id ? { ...u, status } : u));
			set({ pendingUploads: newUploads });
			await persistPendingUploads(newUploads);
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
					.from("event_participants")
					.select("event_id, role")
					.eq("user_id", userId);

				if (partError) throw partError;

				if (!participations || participations.length === 0) {
					set({ events: [], isLoading: false });
					return;
				}

				const eventIds = participations.map((p) => p.event_id);
				const roleMap = new Map(participations.map((p) => [p.event_id, p.role]));

				const { data: events, error: eventsError } = await supabase
					.from("events")
					.select("*")
					.in("id", eventIds)
					.order("starts_at", { ascending: false });

				if (eventsError) throw eventsError;

				const eventsWithCounts = await Promise.all(
					(events || []).map(async (event) => {
						const { count } = await supabase
							.from("event_participants")
							.select("*", { count: "exact", head: true })
							.eq("event_id", event.id);

						return {
							...(event as Event),
							participant_count: count || 0,
							userRole: roleMap.get(event.id) as "host" | "guest",
						};
					})
				);

				set({ events: eventsWithCounts, isLoading: false });
			} catch (error) {
				console.error("Fetch events error:", error);
				set({ error: "Failed to load events", isLoading: false });
			}
		},

		fetchEventByCode: async (joinCode: string) => {
			try {
				set({ isLoading: true, error: null });

				const { data, error } = await supabase
					.from("events")
					.select("*")
					.eq("join_code", joinCode.toUpperCase())
					.single();

				if (error) {
					if (error.code === "PGRST116") {
						set({ error: "Event not found", isLoading: false });
						return null;
					}
					throw error;
				}

				const { count } = await supabase
					.from("event_participants")
					.select("*", { count: "exact", head: true })
					.eq("event_id", data.id);

				const { data: participants } = await supabase
					.from("event_participants")
					.select("role, user_id")
					.eq("event_id", data.id);

				const host = participants?.find((p) => p.role === "host");
				let hostIsPro = false;

				if (host) {
					const { data: hostUser } = await supabase
						.from("users")
						.select("subscription_tier")
						.eq("id", host.user_id)
						.single();

					if (hostUser) {
						hostIsPro = hostUser.subscription_tier === "pro";
					}
				}

				const eventWithCount: EventWithParticipants = {
					...(data as Event),
					participant_count: count || 0,
					hostIsPro,
				};
				set({ isLoading: false });
				return eventWithCount;
			} catch (error) {
				console.error("Fetch event by code error:", error);
				set({ error: "Failed to find event", isLoading: false });
				return null;
			}
		},

		fetchEventById: async (eventId: string) => {
			try {
				set({ isLoading: true, error: null });

				const { data, error } = await supabase
					.from("events")
					.select("*")
					.eq("id", eventId)
					.single();

				if (error) throw error;

				const { data: participants } = await supabase
					.from("event_participants")
					.select("*")
					.eq("event_id", eventId);

				const host = participants?.find((p) => p.role === "host");
				let hostIsPro = false;
				let hostDisplayName = "the host";

				if (host) {
					const { data: hostUser } = await supabase
						.from("users")
						.select("subscription_tier, display_name")
						.eq("id", host.user_id)
						.single();

					if (hostUser) {
						hostIsPro = hostUser.subscription_tier === "pro";
						hostDisplayName = hostUser.display_name || "the host";
					}
				}

				const eventWithParticipants: EventWithParticipants = {
					...(data as Event),
					participants: (participants || []) as EventParticipant[],
					participant_count: participants?.length || 0,
					hostIsPro,
					hostDisplayName,
				};

				set({ currentEvent: eventWithParticipants, isLoading: false });
				return eventWithParticipants;
			} catch (error) {
				console.error("Fetch event by id error:", error);
				set({ error: "Failed to load event", isLoading: false });
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

				const { data, error } = await supabase.from("events").insert(insertData).select().single();

				if (error) throw error;

				const participantData: EventParticipantInsert = {
					event_id: data.id,
					user_id: userId,
					role: "host",
				};

				await supabase.from("event_participants").insert(participantData);

				set({ isLoading: false });
				return data as Event;
			} catch (error) {
				console.error("Create event error:", error);
				set({ error: "Failed to create event", isLoading: false });
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

				const { error } = await supabase.from("events").update(updateData).eq("id", eventId);

				if (error) throw error;

				await get().fetchEventById(eventId);
				set({ isLoading: false });
				return true;
			} catch (error) {
				console.error("Update event error:", error);
				set({ error: "Failed to update event", isLoading: false });
				return false;
			}
		},

		joinEvent: async (eventId: string, userId: string, nickname?: string) => {
			try {
				set({ isLoading: true, error: null });

				const { data: existing, error: existingError } = await supabase
					.from("event_participants")
					.select("id")
					.eq("event_id", eventId)
					.eq("user_id", userId)
					.single();

				if (existing) {
					set({ isLoading: false });
					return true;
				}

				if (existingError && existingError.code !== "PGRST116") {
					throw existingError;
				}

				if (SUBSCRIPTIONS_ENABLED) {
					const { count: currentCount } = await supabase
						.from("event_participants")
						.select("*", { count: "exact", head: true })
						.eq("event_id", eventId);

					const { data: eventData } = await supabase
						.from("events")
						.select("created_by_user_id")
						.eq("id", eventId)
						.single();

					if (eventData?.created_by_user_id) {
						const { data: hostUser } = await supabase
							.from("users")
							.select("subscription_tier")
							.eq("id", eventData.created_by_user_id)
							.single();

						if (
							(currentCount || 0) >= FREE_PARTICIPANT_LIMIT &&
							hostUser?.subscription_tier !== "pro"
						) {
							set({ error: "Event is full", isLoading: false });
							return false;
						}
					}
				}

				const participantData: EventParticipantInsert = {
					event_id: eventId,
					user_id: userId,
					role: "guest",
					nickname,
				};

				const { error } = await supabase.from("event_participants").insert(participantData);

				if (error) throw error;

				const { count } = await supabase
					.from("event_participants")
					.select("*", { count: "exact", head: true })
					.eq("event_id", eventId);

				if (count === FREE_PARTICIPANT_LIMIT) {
					const { data: event } = await supabase
						.from("events")
						.select("title, created_by_user_id")
						.eq("id", eventId)
						.single();

					if (event?.created_by_user_id) {
						const { data: hostUser } = await supabase
							.from("users")
							.select("subscription_tier")
							.eq("id", event.created_by_user_id)
							.single();

						if (hostUser?.subscription_tier !== "pro") {
							sendParticipantLimitNotification(eventId, event.title, event.created_by_user_id);
						}
					}
				}

				set({ isLoading: false });
				return true;
			} catch (error) {
				console.error("Join event error:", error);
				set({ error: "Failed to join event", isLoading: false });
				return false;
			}
		},

		fetchMediaItems: async (eventId: string) => {
			try {
				set({ isLoading: true, error: null });

				const { data, error } = await supabase
					.from("media_items")
					.select("*, uploader:users!uploaded_by_user_id(display_name)")
					.eq("event_id", eventId)
					.eq("visibility", "shared")
					.order("captured_at", { ascending: true });

				if (error) throw error;

				set({
					mediaItems: (data || []) as MediaItemWithUser[],
					isLoading: false,
				});
			} catch (error) {
				console.error("Fetch media items error:", error);
				set({ error: "Failed to load photos", isLoading: false });
			}
		},

		subscribeToMediaItems: (eventId: string) => {
			const channel = supabase
				.channel(`media_items:${eventId}`)
				.on(
					"postgres_changes",
					{
						event: "*",
						schema: "public",
						table: "media_items",
						filter: `event_id=eq.${eventId}`,
					},
					async (payload) => {
						const { mediaItems } = get();

						if (payload.eventType === "INSERT") {
							const newItem = payload.new as MediaItemWithUser;
							if (newItem.visibility === "shared") {
								if (newItem.uploaded_by_user_id) {
									const { data: userData } = await supabase
										.from("users")
										.select("display_name")
										.eq("id", newItem.uploaded_by_user_id)
										.single();
									newItem.uploader = userData ?? { display_name: "Unknown" };
								}
								set({
									mediaItems: [...mediaItems, newItem].sort(
										(a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
									),
								});
							}
						} else if (payload.eventType === "DELETE") {
							const oldItem = payload.old as { id: string };
							set({
								mediaItems: mediaItems.filter((item) => item.id !== oldItem.id),
							});
						} else if (payload.eventType === "UPDATE") {
							const updatedItem = payload.new as MediaItemWithUser;
							if (updatedItem.visibility !== "shared") {
								set({
									mediaItems: mediaItems.filter((item) => item.id !== updatedItem.id),
								});
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

		subscribeToParticipants: (eventId: string) => {
			const channel = supabase
				.channel(`participants:${eventId}`)
				.on(
					"postgres_changes",
					{
						event: "*",
						schema: "public",
						table: "event_participants",
						filter: `event_id=eq.${eventId}`,
					},
					async (payload) => {
						const { currentEvent } = get();
						if (!currentEvent || currentEvent.id !== eventId) return;

						if (payload.eventType === "INSERT") {
							const newParticipant = payload.new as EventParticipant;
							const { data: userData } = await supabase
								.from("users")
								.select("display_name")
								.eq("id", newParticipant.user_id)
								.single();

							if (!userData) return;

							const participantWithUser = {
								...newParticipant,
								user: userData,
							};

							set({
								currentEvent: {
									...currentEvent,
									participants: [...(currentEvent.participants || []), participantWithUser],
									participant_count: (currentEvent.participant_count || 0) + 1,
								},
							});
						} else if (payload.eventType === "DELETE") {
							const oldParticipant = payload.old as { user_id: string };
							set({
								currentEvent: {
									...currentEvent,
									participants: (currentEvent.participants || []).filter(
										(p) => p.user_id !== oldParticipant.user_id
									),
									participant_count: Math.max(0, (currentEvent.participant_count || 1) - 1),
								},
							});
						}
					}
				)
				.subscribe();

			return () => {
				supabase.removeChannel(channel);
			};
		},

		subscribeToEvent: (eventId: string) => {
			const channel = supabase
				.channel(`event:${eventId}`)
				.on(
					"postgres_changes",
					{
						event: "UPDATE",
						schema: "public",
						table: "events",
						filter: `id=eq.${eventId}`,
					},
					(payload) => {
						const { currentEvent } = get();
						if (!currentEvent || currentEvent.id !== eventId) return;

						const updatedEvent = payload.new as Event;
						set({
							currentEvent: {
								...currentEvent,
								...updatedEvent,
							},
						});

						// Also update in the events list
						set((state) => ({
							events: state.events.map((e) => (e.id === eventId ? { ...e, ...updatedEvent } : e)),
						}));
					}
				)
				.on(
					"postgres_changes",
					{
						event: "DELETE",
						schema: "public",
						table: "events",
						filter: `id=eq.${eventId}`,
					},
					() => {
						const { currentEvent } = get();
						if (currentEvent?.id === eventId) {
							set({ currentEvent: null });
						}
						set((state) => ({
							events: state.events.filter((e) => e.id !== eventId),
						}));
					}
				)
				.subscribe();

			return () => {
				supabase.removeChannel(channel);
			};
		},

		subscribeToUserEvents: (userId: string) => {
			// Subscribe to new participations (when user joins or is added to events)
			const participantChannel = supabase
				.channel(`user_participations:${userId}`)
				.on(
					"postgres_changes",
					{
						event: "INSERT",
						schema: "public",
						table: "event_participants",
						filter: `user_id=eq.${userId}`,
					},
					async (payload) => {
						const participation = payload.new as EventParticipant;
						// Fetch the event details
						const { data: eventData } = await supabase
							.from("events")
							.select("*")
							.eq("id", participation.event_id)
							.single();

						if (eventData) {
							const { count } = await supabase
								.from("event_participants")
								.select("*", { count: "exact", head: true })
								.eq("event_id", eventData.id);

							const newEvent: EventWithParticipants = {
								...(eventData as Event),
								participant_count: count || 0,
								userRole: participation.role as "host" | "guest",
							};

							// Add to events list if not already there
							set((state) => {
								const exists = state.events.some((e) => e.id === newEvent.id);
								if (exists) {
									return {
										events: state.events.map((e) => (e.id === newEvent.id ? newEvent : e)),
									};
								}
								return {
									events: [newEvent, ...state.events].sort(
										(a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
									),
								};
							});
						}
					}
				)
				.on(
					"postgres_changes",
					{
						event: "DELETE",
						schema: "public",
						table: "event_participants",
						filter: `user_id=eq.${userId}`,
					},
					(payload) => {
						const oldParticipation = payload.old as { event_id: string };
						// Remove event from list if user left
						set((state) => ({
							events: state.events.filter((e) => e.id !== oldParticipation.event_id),
						}));
					}
				)
				.subscribe();

			// Subscribe to updates on all events the user participates in
			const eventsChannel = supabase
				.channel(`user_events_updates:${userId}`)
				.on(
					"postgres_changes",
					{
						event: "UPDATE",
						schema: "public",
						table: "events",
					},
					(payload) => {
						const updatedEvent = payload.new as Event;
						// Update in events list if user has this event
						set((state) => ({
							events: state.events.map((e) =>
								e.id === updatedEvent.id ? { ...e, ...updatedEvent } : e
							),
						}));
					}
				)
				.subscribe();

			return () => {
				supabase.removeChannel(participantChannel);
				supabase.removeChannel(eventsChannel);
			};
		},

		setCurrentEvent: (event) => {
			set({ currentEvent: event });
		},

		clearError: () => {
			set({ error: null });
		},

		addPendingUploads: async (photos: LocalPhoto[], eventId: string, userId: string) => {
			// Only check for pending uploads - uploaded photos are already filtered by the caller
			const currentPendingIds = new Set(
				get()
					.pendingUploads.filter((u) => u.eventId === eventId)
					.map((u) => u.assetId)
			);

			const newPhotos = photos.filter((photo) => !currentPendingIds.has(photo.id));

			if (newPhotos.length === 0) {
				return { added: 0, skipped: photos.length };
			}

			const newUploads: (PendingUpload & { assetId: string })[] = newPhotos.map((photo) => ({
				id: generateUploadId(),
				localUri: photo.uri,
				eventId,
				userId,
				capturedAt: safeDate(photo.creationTime),
				width: photo.width,
				height: photo.height,
				status: "pending" as const,
				retryCount: 0,
				assetId: photo.id,
				mediaType: photo.mediaType,
				duration: photo.duration,
			}));

			const allUploads = [...get().pendingUploads, ...newUploads];
			set({ pendingUploads: allUploads });
			await persistPendingUploads(allUploads);

			get().processPendingUploads();
			return {
				added: newPhotos.length,
				skipped: photos.length - newPhotos.length,
			};
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

		retryFailedUpload: async (id: string) => {
			const newUploads = get().pendingUploads.map((u) =>
				u.id === id ? { ...u, status: "pending" as const } : u
			);
			set({ pendingUploads: newUploads });
			await persistPendingUploads(newUploads);
			get().processPendingUploads();
		},

		removePendingUpload: async (id: string) => {
			const newUploads = get().pendingUploads.filter((u) => u.id !== id);
			set({ pendingUploads: newUploads });
			await persistPendingUploads(newUploads);
		},

		deletePhoto: async (mediaItemId: string, _eventId: string) => {
			const { mediaItems } = get();
			const photoToDelete = mediaItems.find((m) => m.id === mediaItemId);

			if (!photoToDelete) {
				return false;
			}

			// Optimistically remove from UI
			set((state) => ({
				mediaItems: state.mediaItems.filter((m) => m.id !== mediaItemId),
			}));

			try {
				// First delete from storage bucket
				if (photoToDelete.storage_path) {
					const { error: storageError } = await supabase.storage
						.from("event-photos")
						.remove([photoToDelete.storage_path]);

					if (storageError) {
						console.error("Storage delete error:", storageError);
						throw storageError;
					}
				}

				// Then delete the row from database
				const { error: dbError } = await supabase
					.from("media_items")
					.delete()
					.eq("id", mediaItemId);

				if (dbError) {
					console.error("Database delete error:", dbError);
					throw dbError;
				}

				return true;
			} catch (error) {
				console.error("Delete photo error:", error);
				// Restore photo on failure
				set((state) => ({
					mediaItems: [...state.mediaItems, photoToDelete].sort(
						(a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
					),
				}));
				return false;
			}
		},

		fetchParticipantStats: async (eventId: string) => {
			const { data: participants, error: partError } = await supabase
				.from("event_participants")
				.select("*, user:users(id, display_name)")
				.eq("event_id", eventId);

			if (partError || !participants) return [];

			const { data: photoCounts } = await supabase
				.from("media_items")
				.select("uploaded_by_user_id")
				.eq("event_id", eventId)
				.eq("visibility", "shared");

			const countMap: Record<string, number> = {};
			photoCounts?.forEach((item) => {
				if (item.uploaded_by_user_id) {
					countMap[item.uploaded_by_user_id] = (countMap[item.uploaded_by_user_id] || 0) + 1;
				}
			});

			return participants.map((p) => ({
				userId: p.user_id,
				displayName: (p.user as { display_name: string })?.display_name || "Unknown",
				role: p.role as "host" | "guest",
				photoCount: countMap[p.user_id] || 0,
				joinedAt: p.joined_at,
				noPhotosToUpload: p.no_photos_to_upload ?? false,
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
					captured_at: safeDate(p.capturedAt).toISOString(),
					uploaded_at: new Date().toISOString(),
					media_type: "photo" as const,
					width: p.width,
					height: p.height,
					duration_milliseconds: null,
					file_size_bytes: null,
					storage_path: "",
					thumbnail_path: null,
					visibility: "shared" as const,
					deleted_at: null,
					uploader: null,
					isPending: true,
					localUri: p.localUri,
					syncStatus: p.status,
				}));

			return [
				...mediaItems.map((m) => ({
					...m,
					isPending: false,
					localUri: undefined,
					syncStatus: undefined,
				})),
				...pending,
			].sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
		},

		deleteEvent: async (eventId: string, userId: string) => {
			set({ isLoading: true, error: null });

			try {
				const { data: participant } = await supabase
					.from("event_participants")
					.select("role")
					.eq("event_id", eventId)
					.eq("user_id", userId)
					.single();

				if (!participant || participant.role !== "host") {
					throw new Error("You are not allowed to delete this event");
				}

				const { data: mediaItems } = await supabase
					.from("media_items")
					.select("storage_path")
					.eq("event_id", eventId);

				if (mediaItems?.length) {
					const paths = mediaItems.map((m) => m.storage_path).filter(Boolean) as string[];
					if (paths.length) {
						await supabase.storage.from("event-photos").remove(paths);
					}
				}

				await supabase.from("media_items").delete().eq("event_id", eventId);
				await supabase.from("event_participants").delete().eq("event_id", eventId);
				await supabase.from("events").delete().eq("id", eventId);

				const pendingWithoutEvent = get().pendingUploads.filter((u) => u.eventId !== eventId);
				await persistPendingUploads(pendingWithoutEvent);

				set((state) => ({
					events: state.events.filter((e) => e.id !== eventId),
					currentEvent: state.currentEvent?.id === eventId ? null : state.currentEvent,
					pendingUploads: pendingWithoutEvent,
					isLoading: false,
				}));

				return true;
			} catch (error) {
				console.error("Delete event error:", error);
				set({
					error: error instanceof Error ? error.message : "Failed to delete event",
					isLoading: false,
				});
				return false;
			}
		},

		initializePendingUploads: async () => {
			const uploads = await loadPendingUploads();
			if (uploads.length > 0) {
				set({ pendingUploads: uploads });
				get().processPendingUploads();
			}
		},

		getUploadedPhotoIdsForEvent: async (
			eventId: string,
			userId: string,
			localPhotos: LocalPhoto[]
		) => {
			// Fetch all photos uploaded by this user for this event from Supabase
			const { data: uploadedPhotos, error } = await supabase
				.from("media_items")
				.select("captured_at, width, height")
				.eq("event_id", eventId)
				.eq("uploaded_by_user_id", userId);

			if (error || !uploadedPhotos) {
				console.error("Error fetching uploaded photos:", error);
				return new Set<string>();
			}

			// Create a set of uploaded photo timestamps for quick lookup
			const uploadedTimestamps = new Map<number, { width: number | null; height: number | null }>();
			for (const photo of uploadedPhotos) {
				const timestamp = new Date(photo.captured_at).getTime();
				uploadedTimestamps.set(timestamp, {
					width: photo.width,
					height: photo.height,
				});
			}

			const uploadedLocalIds = new Set<string>();
			for (const localPhoto of localPhotos) {
				const localTimestamp = localPhoto.creationTime;

				// Check if there's a matching uploaded photo (within 1 second tolerance)
				for (const [uploadedTimestamp, dimensions] of uploadedTimestamps) {
					const timeDiff = Math.abs(localTimestamp - uploadedTimestamp);
					// Match by timestamp, and optionally by dimensions if available
					const dimensionsMatch =
						dimensions.width === null ||
						dimensions.height === null ||
						(localPhoto.width === dimensions.width && localPhoto.height === dimensions.height);

					if (timeDiff <= 1000 && dimensionsMatch) {
						uploadedLocalIds.add(localPhoto.id);
						break;
					}
				}
			}

			return uploadedLocalIds;
		},

		markNoPhotosToUpload: async (eventId: string, userId: string) => {
			try {
				const { data, error } = await supabase
					.from("event_participants")
					.update({ no_photos_to_upload: true })
					.eq("event_id", eventId)
					.eq("user_id", userId)
					.select();

				if (error) {
					console.error("Error marking no photos to upload:", error);
					return false;
				}

				if (!data || data.length === 0) {
					console.error("No rows updated - participant not found");
					return false;
				}

				return true;
			} catch (error) {
				console.error("Error marking no photos to upload:", error);
				return false;
			}
		},

		getNoPhotosToUpload: async (eventId: string, userId: string) => {
			try {
				const { data, error } = await supabase
					.from("event_participants")
					.select("no_photos_to_upload")
					.eq("event_id", eventId)
					.eq("user_id", userId)
					.single();

				if (error || !data) {
					return false;
				}

				return data.no_photos_to_upload ?? false;
			} catch {
				return false;
			}
		},

		leaveEvent: async (eventId: string, userId: string) => {
			try {
				const { data: participants, error: fetchError } = await supabase
					.from("event_participants")
					.select("user_id, role")
					.eq("event_id", eventId);

				if (fetchError || !participants) {
					return { success: false };
				}

				const hosts = participants.filter((p) => p.role === "host");
				const isUserHost = hosts.some((p) => p.user_id === userId);

				if (isUserHost && hosts.length === 1) {
					return { success: false, isLastHost: true };
				}

				const { error: deleteError } = await supabase
					.from("event_participants")
					.delete()
					.eq("event_id", eventId)
					.eq("user_id", userId);

				if (deleteError) throw deleteError;

				const pendingWithoutEvent = get().pendingUploads.filter((u) => u.eventId !== eventId);
				await persistPendingUploads(pendingWithoutEvent);

				set((state) => ({
					events: state.events.filter((e) => e.id !== eventId),
					currentEvent: state.currentEvent?.id === eventId ? null : state.currentEvent,
					pendingUploads: pendingWithoutEvent,
				}));

				return { success: true };
			} catch (error) {
				console.error("Leave event error:", error);
				return { success: false };
			}
		},

		removeParticipant: async (eventId: string, targetUserId: string, hostUserId: string) => {
			try {
				const { data: caller, error: callerError } = await supabase
					.from("event_participants")
					.select("role")
					.eq("event_id", eventId)
					.eq("user_id", hostUserId)
					.single();

				if (callerError || !caller || caller.role !== "host") {
					return false;
				}

				const { data: target, error: targetError } = await supabase
					.from("event_participants")
					.select("role")
					.eq("event_id", eventId)
					.eq("user_id", targetUserId)
					.single();

				if (targetError || !target || target.role === "host") {
					return false;
				}

				const { error: deleteError } = await supabase
					.from("event_participants")
					.delete()
					.eq("event_id", eventId)
					.eq("user_id", targetUserId);

				if (deleteError) throw deleteError;

				return true;
			} catch (error) {
				console.error("Remove participant error:", error);
				return false;
			}
		},
	};
});
