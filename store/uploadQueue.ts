import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import {
	ORIGINALS_BUCKET,
	THUMBS_BUCKET,
	originalObjectPath,
	thumbObjectPath,
	uploadFile,
} from "@/lib/upload/storage";
import { generateThumb } from "@/lib/upload/thumbnails";
import type { QueueItem, ScannedAsset } from "@/lib/upload/types";

const STORAGE_KEY = "recapd:upload-queue:v1";
const MAX_CONCURRENT = 2;

type EnqueueArgs = {
	eventId: string;
	ownerId: string;
	assets: ScannedAsset[];
};

type State = {
	items: Record<string, QueueItem>;
	order: string[];
	running: Set<string>;
	hydrated: boolean;
};

type Actions = {
	hydrate: () => Promise<void>;
	enqueue: (args: EnqueueArgs) => Promise<QueueItem[]>;
	retryItem: (id: string) => void;
	removeItem: (id: string) => void;
	clearDone: () => void;
	pumpQueue: () => void;
};

export type UploadQueueStore = State & Actions;

const initialState: State = {
	items: {},
	order: [],
	running: new Set<string>(),
	hydrated: false,
};

async function persistSnapshot(state: State) {
	const ids = state.order;
	const itemMap: Record<string, QueueItem> = {};
	for (const id of ids) {
		const item = state.items[id];
		if (!item) continue;
		const status = item.status === "uploading" ? "queued" : item.status;
		itemMap[id] = { ...item, status, progress: status === "queued" ? 0 : item.progress };
	}
	await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ order: ids, items: itemMap }));
}

async function loadSnapshot(): Promise<Pick<State, "items" | "order">> {
	const raw = await AsyncStorage.getItem(STORAGE_KEY);
	if (!raw) return { items: {}, order: [] };
	try {
		const parsed = JSON.parse(raw) as { items: Record<string, QueueItem>; order: string[] };
		const items: Record<string, QueueItem> = {};
		for (const id of parsed.order ?? []) {
			const item = parsed.items?.[id];
			if (!item) continue;
			items[id] = {
				...item,
				status: item.status === "uploading" ? "queued" : item.status,
				progress: 0,
			};
		}
		return { items, order: parsed.order ?? [] };
	} catch {
		return { items: {}, order: [] };
	}
}

function pickNext(state: State): QueueItem | undefined {
	for (const id of state.order) {
		const item = state.items[id];
		if (!item) continue;
		if (item.status !== "queued") continue;
		if (state.running.has(id)) continue;
		return item;
	}
	return undefined;
}

async function reserveMediaRow(item: QueueItem): Promise<{ id: string; storagePath: string; thumbPath: string }> {
	const provisionalId = Crypto.randomUUID();
	const storagePath = originalObjectPath(item.eventId, item.ownerId, provisionalId, item.filename, item.mimeType);
	const thumbPath = thumbObjectPath(item.eventId, item.ownerId, provisionalId);
	const { data, error } = await supabase
		.from("media_items")
		.insert({
			id: provisionalId,
			event_id: item.eventId,
			owner_id: item.ownerId,
			capture_time: new Date(item.captureTime).toISOString(),
			is_video: item.isVideo,
			duration_ms: item.isVideo ? item.durationMs : null,
			width: item.width || null,
			height: item.height || null,
			storage_path: storagePath,
			thumb_path: thumbPath,
			content_type: item.mimeType,
			status: "pending",
			outside_window: item.outsideWindow,
			latitude: item.latitude,
			longitude: item.longitude,
		})
		.select("id, storage_path, thumb_path")
		.single();
	if (error) throw error;
	const row = data as { id: string; storage_path: string; thumb_path: string };
	return { id: row.id, storagePath: row.storage_path, thumbPath: row.thumb_path };
}

async function markMediaReady(
	mediaItemId: string,
	sizeBytes: number,
	thumbSizeBytes: number
): Promise<void> {
	const { error } = await supabase
		.from("media_items")
		.update({
			status: "ready",
			size_bytes: sizeBytes,
			thumb_size_bytes: thumbSizeBytes,
		})
		.eq("id", mediaItemId);
	if (error) throw error;
}

async function markMediaFailed(mediaItemId: string): Promise<void> {
	try {
		await supabase
			.from("media_items")
			.update({ status: "failed" })
			.eq("id", mediaItemId);
	} catch {}
}

export const useUploadQueue = create<UploadQueueStore>((set, get) => ({
	...initialState,

	hydrate: async () => {
		if (get().hydrated) return;
		const snap = await loadSnapshot();
		set({ items: snap.items, order: snap.order, hydrated: true });
		get().pumpQueue();
	},

	enqueue: async ({ eventId, ownerId, assets }) => {
		const created: QueueItem[] = [];
		const items = { ...get().items };
		const order = [...get().order];

		for (const asset of assets) {
			const id = Crypto.randomUUID();
			const queueItem: QueueItem = {
				id,
				eventId,
				ownerId,
				assetId: asset.assetId,
				localUri: asset.uri,
				filename: asset.filename,
				mimeType: asset.mimeType,
				captureTime: asset.captureTime,
				isVideo: asset.isVideo,
				durationMs: asset.durationMs,
				sizeBytes: null,
				thumbSizeBytes: null,
				width: asset.width,
				height: asset.height,
				outsideWindow: !asset.inWindow,
				latitude: asset.latitude ?? null,
				longitude: asset.longitude ?? null,
				status: "queued",
				attempts: 0,
				progress: 0,
			};
			items[id] = queueItem;
			order.push(id);
			created.push(queueItem);
		}

		set({ items, order });
		await persistSnapshot(get());
		get().pumpQueue();
		return created;
	},

	retryItem: (id) => {
		const items = { ...get().items };
		const existing = items[id];
		if (!existing) return;
		items[id] = { ...existing, status: "queued", error: undefined, progress: 0 };
		set({ items });
		persistSnapshot(get()).catch(() => {});
		get().pumpQueue();
	},

	removeItem: (id) => {
		const items = { ...get().items };
		delete items[id];
		const order = get().order.filter((x) => x !== id);
		set({ items, order });
		persistSnapshot(get()).catch(() => {});
	},

	clearDone: () => {
		const items = { ...get().items };
		const order = get().order.filter((id) => {
			const it = items[id];
			if (it && it.status === "done") {
				delete items[id];
				return false;
			}
			return true;
		});
		set({ items, order });
		persistSnapshot(get()).catch(() => {});
	},

	pumpQueue: () => {
		const state = get();
		if (!state.hydrated) return;
		while (state.running.size < MAX_CONCURRENT) {
			const next = pickNext(get());
			if (!next) return;
			runItem(next.id).catch(() => {});
		}
	},
}));

function setProgress(id: string, progress: number) {
	const store = useUploadQueue.getState();
	const item = store.items[id];
	if (!item) return;
	useUploadQueue.setState({
		items: { ...store.items, [id]: { ...item, progress } },
	});
}

function setItem(id: string, patch: Partial<QueueItem>) {
	const store = useUploadQueue.getState();
	const item = store.items[id];
	if (!item) return;
	useUploadQueue.setState({
		items: { ...store.items, [id]: { ...item, ...patch } },
	});
}

async function runItem(id: string) {
	const store = useUploadQueue.getState();
	const item = store.items[id];
	if (!item) return;
	if (store.running.has(id)) return;

	const nextRunning = new Set(store.running);
	nextRunning.add(id);
	useUploadQueue.setState({ running: nextRunning });
	setItem(id, { status: "uploading", attempts: item.attempts + 1, error: undefined, progress: 0 });

	let mediaItemId = item.mediaItemId;
	try {
		if (!mediaItemId) {
			const reserved = await reserveMediaRow(item);
			mediaItemId = reserved.id;
			setItem(id, {
				mediaItemId: reserved.id,
				storagePath: reserved.storagePath,
				thumbPath: reserved.thumbPath,
			});
		}

		const refreshed = useUploadQueue.getState().items[id];
		if (!refreshed) throw new Error("queue item disappeared");
		const originalPath = refreshed.storagePath;
		const thumbPath = refreshed.thumbPath;
		if (!originalPath || !thumbPath) throw new Error("missing storage paths");

		const captureIso = new Date(item.captureTime).toISOString();

		const originalResult = await uploadFile({
			bucket: ORIGINALS_BUCKET,
			objectPath: originalPath,
			localUri: item.localUri,
			mimeType: item.mimeType,
			metadata: {
				capture_time: captureIso,
				event_id: item.eventId,
				owner_id: item.ownerId,
				media_id: mediaItemId,
				asset_id: item.assetId,
			},
			onProgress: (loaded, total) => {
				const ratio = total === 0 ? 0 : loaded / total;
				setProgress(id, Math.min(0.85, ratio * 0.85));
			},
		});

		setItem(id, {
			sizeBytes: originalResult.sizeBytes,
			originalUploadedAt: Date.now(),
		});

		const thumb = await generateThumb(item.localUri, item.isVideo);
		setProgress(id, 0.9);

		const thumbResult = await uploadFile({
			bucket: THUMBS_BUCKET,
			objectPath: thumbPath,
			localUri: thumb.uri,
			mimeType: thumb.mimeType,
			metadata: { event_id: item.eventId, owner_id: item.ownerId, media_id: mediaItemId },
		});
		setItem(id, { thumbSizeBytes: thumbResult.sizeBytes, thumbUploadedAt: Date.now() });
		setProgress(id, 0.95);

		await markMediaReady(mediaItemId, originalResult.sizeBytes, thumbResult.sizeBytes);
		setItem(id, { status: "done", progress: 1 });
	} catch (err) {
		const message = (err as { message?: string })?.message ?? "upload failed";
		setItem(id, { status: "failed", error: message });
		if (mediaItemId) markMediaFailed(mediaItemId);
	} finally {
		const current = useUploadQueue.getState();
		const stillRunning = new Set(current.running);
		stillRunning.delete(id);
		useUploadQueue.setState({ running: stillRunning });
		await persistSnapshot(useUploadQueue.getState()).catch(() => {});
		useUploadQueue.getState().pumpQueue();
	}
}

export const uploadQueueSelectors = {
	allItems: (state: UploadQueueStore): QueueItem[] => state.order.map((id) => state.items[id]).filter(Boolean) as QueueItem[],
	itemsForEvent: (eventId: string) => (state: UploadQueueStore): QueueItem[] =>
		state.order
			.map((id) => state.items[id])
			.filter((item): item is QueueItem => Boolean(item) && item.eventId === eventId),
	pendingCountForEvent: (eventId: string) => (state: UploadQueueStore): number =>
		uploadQueueSelectors.itemsForEvent(eventId)(state).filter(
			(item) => item.status === "queued" || item.status === "uploading"
		).length,
};
