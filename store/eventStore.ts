import AsyncStorage from "@react-native-async-storage/async-storage";
import { addDays } from "date-fns";
import * as Crypto from "expo-crypto";
import { create } from "zustand";
import { safeDate } from "@/lib/dateUtils";
import { logger } from "@/lib/logger";
import type { LocalPhoto } from "@/lib/mediaLibrary";
import { addUploadBreadcrumb } from "@/lib/sentry";
import type { UploadFailureReason } from "@/lib/storage";
import { createVideoThumbnailUri } from "@/lib/storage";
import { SUBSCRIPTIONS_ENABLED } from "@/lib/subscription";
import { supabase } from "@/lib/supabase";
import {
	generateUploadId,
	type PendingUpload,
	processUploadQueue,
	setUploadCallbacks,
} from "@/lib/uploadQueue";
import { useAuthStore } from "@/store/authStore";
import { useSubscriptionStore } from "@/store/subscriptionStore";
import type {
	Event,
	EventInsert,
	EventParticipant,
	EventParticipantInsert,
	EventPreviewResult,
	EventUpdate,
	MediaItemWithUser,
} from "@/types/database";
import { getParticipantLimit } from "@/types/subscription";

const PENDING_UPLOADS_KEY = "recapd_pending_uploads";
const SCAN_MATCH_TOLERANCE_MS = 1000;
const VIDEO_DURATION_TOLERANCE_MS = 1500;
const VIDEO_THUMBNAIL_BATCH_SIZE = 3;
const MAX_PERSISTED_UPLOAD_ERROR_LENGTH = 256;

type PersistedPendingUpload = Omit<PendingUpload, "capturedAt" | "thumbnailUri"> & {
	capturedAt: string;
	thumbnailUri?: null;
};

async function generateUuid(): Promise<string> {
	const randomBytes = await Crypto.getRandomBytesAsync(16);

	// Set version 4 and RFC 4122 variant bits.
	randomBytes[6] = (randomBytes[6] & 0x0f) | 0x40;
	randomBytes[8] = (randomBytes[8] & 0x3f) | 0x80;

	const hex = Array.from(randomBytes)
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");

	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function createPersistedPendingUpload(upload: PendingUpload): PersistedPendingUpload {
	return {
		...upload,
		capturedAt: safeDate(upload.capturedAt).toISOString(),
		error:
			typeof upload.error === "string" && upload.error.length > MAX_PERSISTED_UPLOAD_ERROR_LENGTH
				? `${upload.error.slice(0, MAX_PERSISTED_UPLOAD_ERROR_LENGTH - 3)}...`
				: upload.error,
		// Generated thumbnails are transient UI state. Persisting them can serialize oversized URIs.
		thumbnailUri: null,
	};
}

function createMinimalPersistedPendingUpload(upload: PendingUpload): PersistedPendingUpload {
	return {
		id: upload.id,
		localUri: upload.localUri,
		eventId: upload.eventId,
		userId: upload.userId,
		capturedAt: safeDate(upload.capturedAt).toISOString(),
		width: upload.width,
		height: upload.height,
		status: upload.status === "syncing" ? "pending" : upload.status,
		retryCount: upload.retryCount,
		assetId: upload.assetId,
		fileSize: upload.fileSize,
		mediaType: upload.mediaType,
		duration: upload.duration,
		latitude: upload.latitude,
		longitude: upload.longitude,
		thumbnailUri: null,
		thumbnailPath: upload.thumbnailPath ?? null,
		error: undefined,
		failureReason: undefined,
		startedAt: undefined,
		lastAttemptAt: undefined,
		finishedAt: undefined,
	};
}

async function persistPendingUploads(uploads: PendingUpload[]) {
	const snapshots = [
		uploads.map(createPersistedPendingUpload),
		uploads.map(createMinimalPersistedPendingUpload),
	];

	for (const snapshot of snapshots) {
		try {
			await AsyncStorage.setItem(PENDING_UPLOADS_KEY, JSON.stringify(snapshot));
			return;
		} catch {
			// Fall through to a smaller snapshot. Pending upload persistence should never crash the app.
		}
	}

	await AsyncStorage.removeItem(PENDING_UPLOADS_KEY);
}

async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	if (items.length === 0) return [];

	const results = new Array<R>(items.length);
	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			results[currentIndex] = await mapper(items[currentIndex], currentIndex);
		}
	});

	await Promise.all(workers);
	return results;
}

function sortMediaItems(items: MediaItemWithUser[]) {
	return [...items].sort(
		(a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime()
	);
}

function upsertMediaItem(
	items: MediaItemWithUser[],
	newItem: MediaItemWithUser
): MediaItemWithUser[] {
	const index = items.findIndex(
		(item) => item.id === newItem.id || item.storage_path === newItem.storage_path
	);

	if (index >= 0) {
		const nextItems = [...items];
		nextItems[index] = {
			...nextItems[index],
			...newItem,
			uploader: newItem.uploader || nextItems[index].uploader,
		};
		return sortMediaItems(nextItems);
	}

	return sortMediaItems([...items, newItem]);
}

function getCaptureTime(value: string | number | Date) {
	return new Date(value).getTime();
}

function scoreMediaMatch(
	localPhoto: LocalPhoto,
	uploadedPhoto: {
		captured_at: string;
		width: number | null;
		height: number | null;
		media_type?: string | null;
		duration_milliseconds: number | null;
	}
) {
	if (uploadedPhoto.media_type && uploadedPhoto.media_type !== localPhoto.mediaType) {
		return null;
	}

	const capturedAt = getCaptureTime(uploadedPhoto.captured_at);
	const timeDiff = Math.abs(localPhoto.creationTime - capturedAt);
	if (timeDiff > SCAN_MATCH_TOLERANCE_MS) {
		return null;
	}

	let score = timeDiff;

	if (uploadedPhoto.width != null && uploadedPhoto.height != null) {
		if (localPhoto.width !== uploadedPhoto.width || localPhoto.height !== uploadedPhoto.height) {
			return null;
		}
	}

	if (localPhoto.mediaType === "video" && uploadedPhoto.duration_milliseconds != null) {
		const durationDiff = Math.abs((localPhoto.duration || 0) - uploadedPhoto.duration_milliseconds);
		if (durationDiff > VIDEO_DURATION_TOLERANCE_MS) {
			return null;
		}
		score += durationDiff;
	}

	return score;
}

async function loadPendingUploads(): Promise<PendingUpload[]> {
	const data = await AsyncStorage.getItem(PENDING_UPLOADS_KEY);
	if (!data) return [];
	try {
		const uploads = JSON.parse(data);
		return uploads.map((u: PersistedPendingUpload) => ({
			...u,
			capturedAt: safeDate(u.capturedAt),
			status: u.status === "syncing" ? "pending" : u.status,
			thumbnailUri: null,
		}));
	} catch {
		logger.warn("Corrupted pending uploads data, clearing local queue");
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
	skipPendingUpload: (id: string) => Promise<void>;
	removePendingUpload: (id: string) => void;
	deletePhoto: (mediaItemId: string, eventId: string) => Promise<boolean>;
	deleteEvent: (eventId: string, userId: string) => Promise<boolean>;
	fetchParticipantStats: (eventId: string) => Promise<ParticipantWithStats[]>;
	getMergedTimeline: (eventId: string) => (MediaItemWithUser & {
		isPending?: boolean;
		localUri?: string;
		localThumbnailUri?: string | null;
		syncStatus?: string;
		retryCount?: number;
		error?: string;
		failureReason?: UploadFailureReason;
	})[];
	initializePendingUploads: (userId?: string | null) => Promise<void>;
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
		onComplete: async (upload, result) => {
			const currentUpload = get().pendingUploads.find((u) => u.id === upload.id);
			const remainingUploads = get().pendingUploads.filter((u) => u.id !== upload.id);
			set({ pendingUploads: remainingUploads });
			await persistPendingUploads(remainingUploads);

			if (!currentUpload) {
				return;
			}

			if (currentUpload.status === "skipped") {
				return;
			}

			if (result.mediaItem) {
				set((state) => ({
					mediaItems: upsertMediaItem(state.mediaItems, result.mediaItem as MediaItemWithUser),
				}));
			} else {
				try {
					await get().fetchMediaItems(upload.eventId);
				} catch (error) {
					logger.error("Failed to refresh media items after upload", error, {
						eventId: upload.eventId,
					});
				}
			}
		},
		onFailed: async (upload, error, failureReason) => {
			const newUploads = get().pendingUploads.map((u) =>
				u.id === upload.id
					? {
							...u,
							status: "failed" as const,
							error,
							failureReason,
							finishedAt: new Date().toISOString(),
						}
					: u
			);
			set({ pendingUploads: newUploads });
			await persistPendingUploads(newUploads);
		},
		onStatusChange: async (id, updates) => {
			const newUploads = get().pendingUploads.map((u) => (u.id === id ? { ...u, ...updates } : u));
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
				logger.error("Fetch events error", error, { userId });
				set({ error: "Failed to load events", isLoading: false });
			}
		},

		fetchEventByCode: async (joinCode: string) => {
			try {
				set({ isLoading: true, error: null });

				const { data, error } = await supabase.rpc("get_event_preview", {
					join_code_input: joinCode.toUpperCase(),
				});

				if (error) {
					throw error;
				}

				const preview = (data as EventPreviewResult[] | null)?.[0];
				if (!preview) {
					set({ error: "Event not found", isLoading: false });
					return null;
				}

				const eventWithCount: EventWithParticipants = {
					...(preview as Event),
					participant_count: preview.participant_count || 0,
					hostIsPro: preview.host_is_pro,
				};
				set({ isLoading: false });
				return eventWithCount;
			} catch (error) {
				logger.error("Fetch event by code error", error, { joinCode });
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
				logger.error("Fetch event by id error", error, { eventId });
				set({ error: "Failed to load event", isLoading: false });
				return null;
			}
		},

		createEvent: async (eventData, userId) => {
			try {
				set({ isLoading: true, error: null });

				const eventId = await generateUuid();
				const joinCode = generateJoinCode();
				const expiresAt = addDays(new Date(eventData.ends_at), 14).toISOString();

				const insertData: EventInsert = {
					id: eventId,
					...eventData,
					join_code: joinCode,
					expires_at: expiresAt,
					created_by_user_id: userId,
				};

				const { error } = await supabase.from("events").insert(insertData);

				if (error) throw error;

				const participantData: EventParticipantInsert = {
					event_id: eventId,
					user_id: userId,
					role: "host",
				};

				const { error: participantError } = await supabase
					.from("event_participants")
					.insert(participantData);

				if (participantError) throw participantError;

				const createdEvent = await get().fetchEventById(eventId);
				if (!createdEvent) {
					throw new Error("Created event could not be loaded");
				}

				set({ isLoading: false });
				return createdEvent;
			} catch (error) {
				logger.error("Create event error", error, { userId });
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
				logger.error("Update event error", error, { eventId });
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
					const plans = useSubscriptionStore.getState().plans;
					const { count: currentCount } = await supabase
						.from("event_participants")
						.select("*", { count: "exact", head: true })
						.eq("event_id", eventId);

					const { data: eventData } = await supabase
						.from("events")
						.select("created_by_user_id, title")
						.eq("id", eventId)
						.single();

					if (eventData?.created_by_user_id) {
						const { data: hostUser } = await supabase
							.from("users")
							.select("subscription_tier")
							.eq("id", eventData.created_by_user_id)
							.single();

						const participantLimit = getParticipantLimit(
							hostUser?.subscription_tier === "pro",
							plans
						);

						if ((currentCount || 0) >= participantLimit) {
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

				if (error) {
					if (
						error.code === "42501" ||
						error.message?.toLowerCase().includes("row-level security")
					) {
						set({ error: "Event is full", isLoading: false });
						return false;
					}
					throw error;
				}

				set({ isLoading: false });
				return true;
			} catch (error) {
				logger.error("Join event error", error, { eventId, userId });
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
					.order("captured_at", { ascending: false });

				if (error) throw error;

				set({
					mediaItems: sortMediaItems((data || []) as MediaItemWithUser[]),
					isLoading: false,
				});
			} catch (error) {
				logger.error("Fetch media items error", error, { eventId });
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
								set((state) => ({
									mediaItems: upsertMediaItem(state.mediaItems, newItem),
								}));
							}
						} else if (payload.eventType === "DELETE") {
							const oldItem = payload.old as { id: string };
							set((state) => ({
								mediaItems: state.mediaItems.filter((item) => item.id !== oldItem.id),
							}));
						} else if (payload.eventType === "UPDATE") {
							const updatedItem = payload.new as MediaItemWithUser;
							if (updatedItem.visibility !== "shared") {
								set((state) => ({
									mediaItems: state.mediaItems.filter((item) => item.id !== updatedItem.id),
								}));
							} else {
								set((state) => ({
									mediaItems: upsertMediaItem(state.mediaItems, updatedItem),
								}));
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

							const alreadyPresent = (currentEvent.participants || []).some(
								(p) => p.user_id === newParticipant.user_id
							);
							if (alreadyPresent) return;

							const participantWithUser = {
								...newParticipant,
								user: userData,
							};

							const nextParticipants = [...(currentEvent.participants || []), participantWithUser];
							set({
								currentEvent: {
									...currentEvent,
									participants: nextParticipants,
									participant_count: nextParticipants.length,
								},
							});
						} else if (payload.eventType === "DELETE") {
							const oldParticipant = payload.old as { user_id: string };
							const remainingParticipants = (currentEvent.participants || []).filter(
								(p) => p.user_id !== oldParticipant.user_id
							);
							set({
								currentEvent: {
									...currentEvent,
									participants: remainingParticipants,
									participant_count: remainingParticipants.length,
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

			const newUploads = await mapWithConcurrency(
				newPhotos,
				VIDEO_THUMBNAIL_BATCH_SIZE,
				async (photo) => {
					const thumbnailUri =
						photo.mediaType === "video" ? await createVideoThumbnailUri(photo.uri, 0) : null;
					const uploadId = generateUploadId();

					return {
						id: uploadId,
						localUri: photo.uri,
						eventId,
						userId,
						capturedAt: safeDate(photo.creationTime),
						width: photo.width,
						height: photo.height,
						status: "pending" as const,
						retryCount: 0,
						assetId: photo.id,
						fileSize: photo.fileSize,
						mediaType: photo.mediaType,
						duration: photo.duration,
						latitude: photo.latitude,
						longitude: photo.longitude,
						thumbnailUri,
						thumbnailPath: null,
					};
				}
			);

			const allUploads = [...get().pendingUploads, ...newUploads];
			set({ pendingUploads: allUploads });
			await persistPendingUploads(allUploads);

			const totalBytes = newUploads.reduce((sum, u) => sum + (u.fileSize ?? 0), 0);
			const photoCount = newUploads.filter((u) => u.mediaType === "photo").length;
			const videoCount = newUploads.filter((u) => u.mediaType === "video").length;
			addUploadBreadcrumb("eventStore.enqueue", {
				eventId,
				userId,
				added: newUploads.length,
				skipped: photos.length - newPhotos.length,
				photoCount,
				videoCount,
				totalBytes,
				queueDepth: allUploads.length,
			});

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
					set((state) => {
						const nextUploads = state.pendingUploads.map((u) =>
							u.id === id ? { ...u, ...updates } : u
						);
						void persistPendingUploads(nextUploads);
						return {
							pendingUploads: nextUploads,
						};
					});
				}
			);
		},

		retryFailedUpload: async (id: string) => {
			const newUploads = get().pendingUploads.map((u) =>
				u.id === id
					? { ...u, status: "pending" as const, error: undefined, failureReason: undefined }
					: u
			);
			set({ pendingUploads: newUploads });
			await persistPendingUploads(newUploads);
			get().processPendingUploads();
		},

		skipPendingUpload: async (id: string) => {
			const newUploads = get().pendingUploads.map((u) =>
				u.id === id
					? {
							...u,
							status: "skipped" as const,
							finishedAt: new Date().toISOString(),
						}
					: u
			);
			set({ pendingUploads: newUploads });
			await persistPendingUploads(newUploads);
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
				if (photoToDelete.storage_path) {
					const { error: storageError } = await supabase.storage
						.from("event-photos")
						.remove([photoToDelete.storage_path]);

					if (storageError) {
						logger.error("Storage delete error", storageError, { mediaItemId });
						throw storageError;
					}
				}

				if (photoToDelete.thumbnail_path) {
					const { error: thumbnailDeleteError } = await supabase.storage
						.from("thumbnails")
						.remove([photoToDelete.thumbnail_path]);

					if (thumbnailDeleteError) {
						logger.error("Thumbnail delete error", thumbnailDeleteError, { mediaItemId });
						throw thumbnailDeleteError;
					}
				}

				// Then delete the row from database
				const { error: dbError } = await supabase
					.from("media_items")
					.delete()
					.eq("id", mediaItemId);

				if (dbError) {
					logger.error("Database delete error", dbError, { mediaItemId });
					throw dbError;
				}

				return true;
			} catch (error) {
				logger.error("Delete photo error", error, { mediaItemId });
				// Restore photo on failure
				set((state) => ({
					mediaItems: [...state.mediaItems, photoToDelete].sort(
						(a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime()
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
				.filter((p) => p.eventId === eventId && p.status !== "skipped")
				.map((p) => ({
					id: p.id,
					event_id: p.eventId,
					uploaded_by_user_id: p.userId,
					captured_at: safeDate(p.capturedAt).toISOString(),
					uploaded_at: new Date().toISOString(),
					media_type: p.mediaType,
					width: p.width,
					height: p.height,
					duration_milliseconds: p.mediaType === "video" ? Math.round(p.duration || 0) : null,
					file_size_bytes: null,
					storage_path: "",
					thumbnail_path: p.thumbnailPath ?? null,
					hls_path: null,
					visibility: "shared" as const,
					deleted_at: null,
					latitude: p.latitude ?? null,
					longitude: p.longitude ?? null,
					uploader: null,
					isPending: true,
					localUri: p.localUri,
					localThumbnailUri: p.thumbnailUri ?? null,
					syncStatus: p.status,
					retryCount: p.retryCount,
					error: p.error,
					failureReason: p.failureReason,
					startedAt: p.startedAt,
					lastAttemptAt: p.lastAttemptAt,
					finishedAt: p.finishedAt,
				}));

			return [
				...mediaItems.map((m) => ({
					...m,
					isPending: false,
					localUri: undefined,
					syncStatus: undefined,
				})),
				...pending,
			].sort((a, b) => new Date(b.captured_at).getTime() - new Date(a.captured_at).getTime());
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
					.select("storage_path, thumbnail_path")
					.eq("event_id", eventId);

				if (mediaItems?.length) {
					const photoPaths = mediaItems
						.map((mediaItem) => mediaItem.storage_path)
						.filter(Boolean) as string[];
					const thumbnailPaths = mediaItems
						.map((mediaItem) => mediaItem.thumbnail_path)
						.filter(Boolean) as string[];
					if (photoPaths.length) {
						await supabase.storage.from("event-photos").remove(photoPaths);
					}
					if (thumbnailPaths.length) {
						await supabase.storage.from("thumbnails").remove(thumbnailPaths);
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
				logger.error("Delete event error", error, { eventId, userId });
				set({
					error: error instanceof Error ? error.message : "Failed to delete event",
					isLoading: false,
				});
				return false;
			}
		},

		initializePendingUploads: async (userId?: string | null) => {
			const activeUserId = userId ?? useAuthStore.getState().user?.id ?? null;
			if (!activeUserId) {
				set({ pendingUploads: [] });
				return;
			}
			const uploads = await loadPendingUploads();
			const activeUploads = uploads.filter((upload) => upload.userId === activeUserId);

			if (activeUploads.length !== uploads.length) {
				logger.warn("Discarding pending uploads for a stale profile", undefined, {
					activeUserId,
					discardedCount: uploads.length - activeUploads.length,
				});
				await persistPendingUploads(activeUploads);
			}

			if (activeUploads.length > 0) {
				set({ pendingUploads: activeUploads });
				get().processPendingUploads();
				return;
			}

			set({ pendingUploads: [] });
		},

		getUploadedPhotoIdsForEvent: async (
			eventId: string,
			userId: string,
			localPhotos: LocalPhoto[]
		) => {
			// Fetch all photos uploaded by this user for this event from Supabase
			const { data: uploadedPhotos, error } = await supabase
				.from("media_items")
				.select("captured_at, width, height, media_type, duration_milliseconds")
				.eq("event_id", eventId)
				.eq("uploaded_by_user_id", userId);

			if (error || !uploadedPhotos) {
				logger.error("Error fetching uploaded photos", error, { eventId, userId });
				return new Set<string>();
			}

			const uploadedCandidates = uploadedPhotos
				.map((photo) => ({
					...photo,
					capturedAt: new Date(photo.captured_at).getTime(),
				}))
				.sort((a, b) => a.capturedAt - b.capturedAt);
			const matchedUploadedIndexes = new Set<number>();
			const uploadedLocalIds = new Set<string>();
			const sortedLocalPhotos = [...localPhotos].sort((a, b) => a.creationTime - b.creationTime);
			for (const localPhoto of sortedLocalPhotos) {
				let bestIndex = -1;
				let bestScore = Number.POSITIVE_INFINITY;

				for (let i = 0; i < uploadedCandidates.length; i++) {
					if (matchedUploadedIndexes.has(i)) continue;
					const candidate = uploadedCandidates[i];
					const score = scoreMediaMatch(localPhoto, candidate);
					if (score === null) continue;
					if (score < bestScore) {
						bestScore = score;
						bestIndex = i;
					}
				}

				if (bestIndex >= 0) {
					matchedUploadedIndexes.add(bestIndex);
					uploadedLocalIds.add(localPhoto.id);
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
					logger.error("Error marking no photos to upload", error, { eventId, userId });
					return false;
				}

				if (!data || data.length === 0) {
					logger.warn("No participant row updated when marking no photos to upload", undefined, {
						eventId,
						userId,
					});
					return false;
				}

				return true;
			} catch (error) {
				logger.error("Error marking no photos to upload", error, { eventId, userId });
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
				logger.error("Leave event error", error, { eventId, userId });
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
				logger.error("Remove participant error", error, {
					eventId,
					targetUserId,
					hostUserId,
				});
				return false;
			}
		},
	};
});
