import { uploadQueueSelectors } from "@/store/uploadQueue";
import type { QueueItem, UploadQueueStore } from "@/store/uploadQueue";

function stub(items: QueueItem[]): UploadQueueStore {
	const map: Record<string, QueueItem> = {};
	for (const item of items) map[item.id] = item;
	return {
		items: map,
		order: items.map((i) => i.id),
		running: new Set<string>(),
		hydrated: true,
		hydrate: async () => {},
		enqueue: async () => [],
		retryItem: () => {},
		removeItem: () => {},
		clearDone: () => {},
		pumpQueue: () => {},
	};
}

function makeItem(partial: Partial<QueueItem>): QueueItem {
	return {
		id: partial.id ?? "x",
		eventId: partial.eventId ?? "evt-1",
		ownerId: partial.ownerId ?? "owner",
		assetId: "asset",
		localUri: "file:///tmp/x",
		filename: "x.jpg",
		mimeType: "image/jpeg",
		captureTime: 0,
		isVideo: false,
		durationMs: 0,
		sizeBytes: null,
		thumbSizeBytes: null,
		width: 100,
		height: 100,
		outsideWindow: false,
		latitude: null,
		longitude: null,
		status: partial.status ?? "queued",
		attempts: 0,
		progress: 0,
		...partial,
	};
}

describe("uploadQueueSelectors.itemsForEvent", () => {
	it("filters items by event id", () => {
		const state = stub([
			makeItem({ id: "a", eventId: "evt-1" }),
			makeItem({ id: "b", eventId: "evt-2" }),
			makeItem({ id: "c", eventId: "evt-1" }),
		]);
		const result = uploadQueueSelectors.itemsForEvent("evt-1")(state);
		expect(result.map((i) => i.id)).toEqual(["a", "c"]);
	});
});

describe("uploadQueueSelectors.pendingCountForEvent", () => {
	it("counts queued and uploading only", () => {
		const state = stub([
			makeItem({ id: "a", eventId: "evt-1", status: "queued" }),
			makeItem({ id: "b", eventId: "evt-1", status: "uploading" }),
			makeItem({ id: "c", eventId: "evt-1", status: "done" }),
			makeItem({ id: "d", eventId: "evt-1", status: "failed" }),
			makeItem({ id: "e", eventId: "evt-2", status: "queued" }),
		]);
		expect(uploadQueueSelectors.pendingCountForEvent("evt-1")(state)).toBe(2);
		expect(uploadQueueSelectors.pendingCountForEvent("evt-2")(state)).toBe(1);
	});
});
