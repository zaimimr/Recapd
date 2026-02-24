jest.mock("@/lib/supabase", () => {
	const buildChain = (finalValue: any = { data: null, error: null }): any => {
		const chain: any = {};
		const methods = [
			"select",
			"insert",
			"update",
			"delete",
			"eq",
			"in",
			"order",
			"single",
			"filter",
		];
		methods.forEach((m) => {
			chain[m] = jest.fn().mockReturnValue(chain);
		});
		// biome-ignore lint/suspicious/noThenProperty: mock must be thenable to simulate Supabase query builder
		chain.then = (resolve: any) => resolve(finalValue);
		Object.defineProperty(chain, "count", { get: () => finalValue.count });
		Object.defineProperty(chain, "data", { get: () => finalValue.data });
		Object.defineProperty(chain, "error", { get: () => finalValue.error });
		return chain;
	};
	return {
		buildChain,
		supabase: {
			from: jest.fn().mockReturnValue(buildChain()),
			storage: {
				from: jest.fn().mockReturnValue({
					upload: jest.fn().mockResolvedValue({ data: { path: "test/path" }, error: null }),
					remove: jest.fn().mockResolvedValue({ error: null }),
					getPublicUrl: jest.fn().mockReturnValue({
						data: { publicUrl: "https://example.com/photo" },
					}),
				}),
			},
			channel: jest.fn().mockReturnValue({
				on: jest.fn().mockReturnThis(),
				subscribe: jest.fn(),
			}),
			removeChannel: jest.fn(),
		},
	};
});
jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock("@/lib/uploadQueue", () => ({
	generateUploadId: jest.fn().mockReturnValue("upload_123_abc"),
	processUploadQueue: jest.fn().mockResolvedValue(undefined),
	setUploadCallbacks: jest.fn(),
}));
jest.mock("@/lib/notifications", () => ({
	sendParticipantLimitNotification: jest.fn(),
}));
jest.mock("@/lib/subscription", () => ({
	SUBSCRIPTIONS_ENABLED: true,
}));
jest.mock("@/lib/dateUtils", () => ({
	safeDate: jest.fn((v) =>
		v instanceof Date ? v : new Date(typeof v === "number" ? v : Date.now())
	),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEventStore } from "@/store/eventStore";
import type { MediaItemWithUser } from "@/types/database";

const { supabase, buildChain } = require("@/lib/supabase");
const { generateUploadId } = require("@/lib/uploadQueue");

function makeMediaItem(overrides: Partial<MediaItemWithUser> = {}): MediaItemWithUser {
	return {
		id: "media-1",
		event_id: "evt1",
		uploaded_by_user_id: "user1",
		captured_at: new Date(1000).toISOString(),
		uploaded_at: new Date().toISOString(),
		media_type: "photo",
		width: 1920,
		height: 1080,
		duration_milliseconds: null,
		file_size_bytes: null,
		storage_path: "events/evt1/photo1.jpg",
		thumbnail_path: null,
		visibility: "shared",
		deleted_at: null,
		latitude: null,
		longitude: null,
		uploader: { display_name: "Test User" },
		...overrides,
	};
}

beforeEach(() => {
	useEventStore.setState({
		events: [],
		currentEvent: null,
		mediaItems: [],
		pendingUploads: [],
		isLoading: false,
		error: null,
	});
	jest.clearAllMocks();
	supabase.from.mockReturnValue(buildChain());
});

describe("addPendingUploads", () => {
	const basePhotos = [
		{
			id: "photo-1",
			uri: "file://p1.jpg",
			filename: "p1.jpg",
			creationTime: 1000,
			width: 100,
			height: 100,
			duration: 0,
			mediaType: "photo" as const,
		},
		{
			id: "photo-2",
			uri: "file://p2.jpg",
			filename: "p2.jpg",
			creationTime: 2000,
			width: 200,
			height: 200,
			duration: 0,
			mediaType: "photo" as const,
		},
		{
			id: "photo-3",
			uri: "file://p3.jpg",
			filename: "p3.jpg",
			creationTime: 3000,
			width: 300,
			height: 300,
			duration: 0,
			mediaType: "photo" as const,
		},
	];

	let uploadIdCounter: number;

	beforeEach(() => {
		uploadIdCounter = 0;
		generateUploadId.mockImplementation(() => `upload_${++uploadIdCounter}`);
	});

	test("all new photos returns correct counts and populates pendingUploads", async () => {
		const result = await useEventStore.getState().addPendingUploads(basePhotos, "evt1", "user1");

		expect(result).toEqual({ added: 3, skipped: 0 });
		expect(useEventStore.getState().pendingUploads).toHaveLength(3);
	});

	test("duplicate by assetId is skipped", async () => {
		useEventStore.setState({
			pendingUploads: [
				{
					id: "existing_1",
					localUri: "file://p1.jpg",
					eventId: "evt1",
					userId: "user1",
					capturedAt: new Date(1000),
					width: 100,
					height: 100,
					status: "pending" as const,
					retryCount: 0,
					assetId: "photo-1",
					mediaType: "photo" as const,
					duration: 0,
				},
			],
		});

		const result = await useEventStore.getState().addPendingUploads(
			[
				{
					id: "photo-1",
					uri: "file://p1.jpg",
					filename: "p1.jpg",
					creationTime: 1000,
					width: 100,
					height: 100,
					duration: 0,
					mediaType: "photo" as const,
				},
			],
			"evt1",
			"user1"
		);

		expect(result).toEqual({ added: 0, skipped: 1 });
	});

	test("mixed new and duplicate returns correct counts", async () => {
		useEventStore.setState({
			pendingUploads: [
				{
					id: "existing_1",
					localUri: "file://p1.jpg",
					eventId: "evt1",
					userId: "user1",
					capturedAt: new Date(1000),
					width: 100,
					height: 100,
					status: "pending" as const,
					retryCount: 0,
					assetId: "photo-1",
					mediaType: "photo" as const,
					duration: 0,
				},
			],
		});

		const result = await useEventStore.getState().addPendingUploads(basePhotos, "evt1", "user1");

		expect(result).toEqual({ added: 2, skipped: 1 });
		expect(useEventStore.getState().pendingUploads).toHaveLength(3);
	});

	test("same assetId for different event is NOT skipped", async () => {
		useEventStore.setState({
			pendingUploads: [
				{
					id: "existing_1",
					localUri: "file://p1.jpg",
					eventId: "evt1",
					userId: "user1",
					capturedAt: new Date(1000),
					width: 100,
					height: 100,
					status: "pending" as const,
					retryCount: 0,
					assetId: "photo-1",
					mediaType: "photo" as const,
					duration: 0,
				},
			],
		});

		const result = await useEventStore.getState().addPendingUploads(
			[
				{
					id: "photo-1",
					uri: "file://p1.jpg",
					filename: "p1.jpg",
					creationTime: 1000,
					width: 100,
					height: 100,
					duration: 0,
					mediaType: "photo" as const,
				},
			],
			"evt2",
			"user1"
		);

		expect(result).toEqual({ added: 1, skipped: 0 });
	});

	test("persists to AsyncStorage after adding", async () => {
		await useEventStore.getState().addPendingUploads(basePhotos, "evt1", "user1");

		expect(AsyncStorage.setItem).toHaveBeenCalledWith("recapd_pending_uploads", expect.any(String));
	});

	test("video upload preserves mediaType and duration", async () => {
		const videoPhoto = {
			id: "video-1",
			uri: "file://v1.mp4",
			filename: "v1.mp4",
			creationTime: 5000,
			width: 1920,
			height: 1080,
			duration: 15000,
			mediaType: "video" as const,
		};

		await useEventStore.getState().addPendingUploads([videoPhoto], "evt1", "user1");

		const pending = useEventStore.getState().pendingUploads[0];
		expect(pending.mediaType).toBe("video");
		expect(pending.duration).toBe(15000);
	});
});

describe("getMergedTimeline", () => {
	test("only DB items returns items with isPending=false", () => {
		const item = makeMediaItem({ captured_at: new Date(1000).toISOString() });
		useEventStore.setState({ mediaItems: [item], pendingUploads: [] });

		const timeline = useEventStore.getState().getMergedTimeline("evt1");

		expect(timeline).toHaveLength(1);
		expect(timeline[0].isPending).toBe(false);
		expect(timeline[0].id).toBe("media-1");
	});

	test("only pending uploads returns items with isPending=true and localUri", () => {
		useEventStore.setState({
			mediaItems: [],
			pendingUploads: [
				{
					id: "pending-1",
					localUri: "file://local.jpg",
					eventId: "evt1",
					userId: "user1",
					capturedAt: new Date(2000),
					width: 100,
					height: 100,
					status: "pending" as const,
					retryCount: 0,
					mediaType: "photo" as const,
				},
			],
		});

		const timeline = useEventStore.getState().getMergedTimeline("evt1");

		expect(timeline).toHaveLength(1);
		expect(timeline[0].isPending).toBe(true);
		expect(timeline[0].localUri).toBe("file://local.jpg");
	});

	test("mixed items sorted by captured_at ascending", () => {
		const dbItem = makeMediaItem({ captured_at: new Date(100).toISOString() });
		useEventStore.setState({
			mediaItems: [dbItem],
			pendingUploads: [
				{
					id: "pending-1",
					localUri: "file://local.jpg",
					eventId: "evt1",
					userId: "user1",
					capturedAt: new Date(50),
					width: 100,
					height: 100,
					status: "pending" as const,
					retryCount: 0,
					mediaType: "photo" as const,
				},
			],
		});

		const timeline = useEventStore.getState().getMergedTimeline("evt1");

		expect(timeline).toHaveLength(2);
		expect(timeline[0].isPending).toBe(true);
		expect(timeline[1].isPending).toBe(false);
	});

	test("filters pending by eventId", () => {
		useEventStore.setState({
			mediaItems: [],
			pendingUploads: [
				{
					id: "pending-1",
					localUri: "file://local.jpg",
					eventId: "evt1",
					userId: "user1",
					capturedAt: new Date(1000),
					width: 100,
					height: 100,
					status: "pending" as const,
					retryCount: 0,
					mediaType: "photo" as const,
				},
				{
					id: "pending-2",
					localUri: "file://other.jpg",
					eventId: "evt2",
					userId: "user1",
					capturedAt: new Date(2000),
					width: 100,
					height: 100,
					status: "pending" as const,
					retryCount: 0,
					mediaType: "photo" as const,
				},
			],
		});

		const timeline = useEventStore.getState().getMergedTimeline("evt1");

		expect(timeline).toHaveLength(1);
		expect(timeline[0].id).toBe("pending-1");
	});
});

describe("getUploadedPhotoIdsForEvent", () => {
	function setupMediaItemsChain(uploadedPhotos: any[], error: any = null) {
		const chain = buildChain({ data: uploadedPhotos, error });
		supabase.from.mockImplementation((table: string) => {
			if (table === "media_items") return chain;
			return buildChain();
		});
		return chain;
	}

	test("exact timestamp match returns photo id", async () => {
		setupMediaItemsChain([
			{ captured_at: new Date(5000).toISOString(), width: 1920, height: 1080 },
		]);

		const localPhotos = [
			{
				id: "local-1",
				uri: "file://p.jpg",
				filename: "p.jpg",
				creationTime: 5000,
				width: 1920,
				height: 1080,
				duration: 0,
				mediaType: "photo" as const,
			},
		];

		const result = await useEventStore
			.getState()
			.getUploadedPhotoIdsForEvent("evt1", "user1", localPhotos);

		expect(result.has("local-1")).toBe(true);
	});

	test("within 1 second tolerance matches", async () => {
		setupMediaItemsChain([
			{ captured_at: new Date(5000).toISOString(), width: 1920, height: 1080 },
		]);

		const localPhotos = [
			{
				id: "local-1",
				uri: "file://p.jpg",
				filename: "p.jpg",
				creationTime: 5500,
				width: 1920,
				height: 1080,
				duration: 0,
				mediaType: "photo" as const,
			},
		];

		const result = await useEventStore
			.getState()
			.getUploadedPhotoIdsForEvent("evt1", "user1", localPhotos);

		expect(result.has("local-1")).toBe(true);
	});

	test("beyond 1 second does not match", async () => {
		setupMediaItemsChain([
			{ captured_at: new Date(5000).toISOString(), width: 1920, height: 1080 },
		]);

		const localPhotos = [
			{
				id: "local-1",
				uri: "file://p.jpg",
				filename: "p.jpg",
				creationTime: 6500,
				width: 1920,
				height: 1080,
				duration: 0,
				mediaType: "photo" as const,
			},
		];

		const result = await useEventStore
			.getState()
			.getUploadedPhotoIdsForEvent("evt1", "user1", localPhotos);

		expect(result.has("local-1")).toBe(false);
	});

	test("dimension matching when both match", async () => {
		setupMediaItemsChain([
			{ captured_at: new Date(5000).toISOString(), width: 1920, height: 1080 },
		]);

		const localPhotos = [
			{
				id: "local-1",
				uri: "file://p.jpg",
				filename: "p.jpg",
				creationTime: 5000,
				width: 1920,
				height: 1080,
				duration: 0,
				mediaType: "photo" as const,
			},
		];

		const result = await useEventStore
			.getState()
			.getUploadedPhotoIdsForEvent("evt1", "user1", localPhotos);

		expect(result.has("local-1")).toBe(true);
	});

	test("dimension mismatch prevents match", async () => {
		setupMediaItemsChain([
			{ captured_at: new Date(5000).toISOString(), width: 1920, height: 1080 },
		]);

		const localPhotos = [
			{
				id: "local-1",
				uri: "file://p.jpg",
				filename: "p.jpg",
				creationTime: 5000,
				width: 1080,
				height: 1920,
				duration: 0,
				mediaType: "photo" as const,
			},
		];

		const result = await useEventStore
			.getState()
			.getUploadedPhotoIdsForEvent("evt1", "user1", localPhotos);

		expect(result.has("local-1")).toBe(false);
	});

	test("null dimensions act as wildcard", async () => {
		setupMediaItemsChain([
			{ captured_at: new Date(5000).toISOString(), width: null, height: null },
		]);

		const localPhotos = [
			{
				id: "local-1",
				uri: "file://p.jpg",
				filename: "p.jpg",
				creationTime: 5000,
				width: 3000,
				height: 2000,
				duration: 0,
				mediaType: "photo" as const,
			},
		];

		const result = await useEventStore
			.getState()
			.getUploadedPhotoIdsForEvent("evt1", "user1", localPhotos);

		expect(result.has("local-1")).toBe(true);
	});

	test("supabase error returns empty Set", async () => {
		setupMediaItemsChain(null, { message: "DB error" });

		const localPhotos = [
			{
				id: "local-1",
				uri: "file://p.jpg",
				filename: "p.jpg",
				creationTime: 5000,
				width: 1920,
				height: 1080,
				duration: 0,
				mediaType: "photo" as const,
			},
		];

		const result = await useEventStore
			.getState()
			.getUploadedPhotoIdsForEvent("evt1", "user1", localPhotos);

		expect(result.size).toBe(0);
	});

	test("1000 local photos completes efficiently", async () => {
		const uploaded = Array.from({ length: 100 }, (_, i) => ({
			captured_at: new Date(i * 1000).toISOString(),
			width: 1920,
			height: 1080,
		}));
		setupMediaItemsChain(uploaded);

		const localPhotos = Array.from({ length: 1000 }, (_, i) => ({
			id: `local-${i}`,
			uri: `file://p${i}.jpg`,
			filename: `p${i}.jpg`,
			creationTime: i * 1000,
			width: 1920,
			height: 1080,
			duration: 0,
			mediaType: "photo" as const,
		}));

		const start = Date.now();
		const result = await useEventStore
			.getState()
			.getUploadedPhotoIdsForEvent("evt1", "user1", localPhotos);
		const elapsed = Date.now() - start;

		expect(result.size).toBeGreaterThan(0);
		expect(elapsed).toBeLessThan(5000);
	});
});

describe("deletePhoto", () => {
	const photo1 = makeMediaItem({
		id: "photo-1",
		storage_path: "events/evt1/p1.jpg",
		captured_at: new Date(1000).toISOString(),
	});
	const photo2 = makeMediaItem({
		id: "photo-2",
		storage_path: "events/evt1/p2.jpg",
		captured_at: new Date(2000).toISOString(),
	});

	beforeEach(() => {
		useEventStore.setState({ mediaItems: [photo1, photo2] });
	});

	test("successful delete returns true and removes photo", async () => {
		const deleteChain = buildChain({ data: null, error: null });
		supabase.from.mockImplementation((table: string) => {
			if (table === "media_items") return deleteChain;
			return buildChain();
		});
		supabase.storage.from.mockReturnValue({
			remove: jest.fn().mockResolvedValue({ error: null }),
			upload: jest.fn(),
			getPublicUrl: jest.fn(),
		});

		const result = await useEventStore.getState().deletePhoto("photo-1", "evt1");

		expect(result).toBe(true);
		expect(useEventStore.getState().mediaItems.find((m) => m.id === "photo-1")).toBeUndefined();
	});

	test("photo not found returns false", async () => {
		const result = await useEventStore.getState().deletePhoto("nonexistent", "evt1");

		expect(result).toBe(false);
	});

	test("storage error restores photo and returns false", async () => {
		supabase.storage.from.mockReturnValue({
			remove: jest.fn().mockResolvedValue({ error: { message: "Storage error" } }),
			upload: jest.fn(),
			getPublicUrl: jest.fn(),
		});

		const result = await useEventStore.getState().deletePhoto("photo-1", "evt1");

		expect(result).toBe(false);
		const items = useEventStore.getState().mediaItems;
		expect(items.find((m) => m.id === "photo-1")).toBeDefined();
	});

	test("DB delete error restores photo sorted by captured_at", async () => {
		supabase.storage.from.mockReturnValue({
			remove: jest.fn().mockResolvedValue({ error: null }),
			upload: jest.fn(),
			getPublicUrl: jest.fn(),
		});

		const dbChain = buildChain({ data: null, error: { message: "DB error" } });
		supabase.from.mockImplementation((table: string) => {
			if (table === "media_items") return dbChain;
			return buildChain();
		});

		const result = await useEventStore.getState().deletePhoto("photo-1", "evt1");

		expect(result).toBe(false);
		const items = useEventStore.getState().mediaItems;
		expect(items).toHaveLength(2);
		expect(items[0].id).toBe("photo-1");
		expect(items[1].id).toBe("photo-2");
	});
});

describe("deleteEvent", () => {
	beforeEach(() => {
		useEventStore.setState({
			events: [
				{
					id: "evt1",
					title: "Test Event",
					starts_at: "",
					ends_at: "",
					timezone: "",
					join_code: "ABC123",
					created_by_user_id: "host1",
					status: "live" as const,
					expires_at: "",
					created_at: "",
					updated_at: "",
					userRole: "host" as const,
				},
			],
			currentEvent: {
				id: "evt1",
				title: "Test Event",
				starts_at: "",
				ends_at: "",
				timezone: "",
				join_code: "ABC123",
				created_by_user_id: "host1",
				status: "live" as const,
				expires_at: "",
				created_at: "",
				updated_at: "",
			},
			pendingUploads: [
				{
					id: "pending-1",
					localUri: "file://p1.jpg",
					eventId: "evt1",
					userId: "host1",
					capturedAt: new Date(1000),
					width: 100,
					height: 100,
					status: "pending" as const,
					retryCount: 0,
					mediaType: "photo" as const,
				},
				{
					id: "pending-2",
					localUri: "file://p2.jpg",
					eventId: "evt2",
					userId: "host1",
					capturedAt: new Date(2000),
					width: 100,
					height: 100,
					status: "pending" as const,
					retryCount: 0,
					mediaType: "photo" as const,
				},
			],
		});
	});

	test("host deletes event successfully", async () => {
		const participantChain = buildChain({
			data: { role: "host" },
			error: null,
		});
		const mediaChain = buildChain({
			data: [{ storage_path: "events/evt1/p1.jpg" }],
			error: null,
		});
		const deleteChain = buildChain({ data: null, error: null });

		supabase.from.mockImplementation((table: string) => {
			if (table === "event_participants") {
				const call = supabase.from.mock.calls.filter(
					(c: any[]) => c[0] === "event_participants"
				).length;
				return call <= 1 ? participantChain : deleteChain;
			}
			if (table === "media_items") {
				const call = supabase.from.mock.calls.filter((c: any[]) => c[0] === "media_items").length;
				return call <= 1 ? mediaChain : deleteChain;
			}
			if (table === "events") return deleteChain;
			return buildChain();
		});

		supabase.storage.from.mockReturnValue({
			remove: jest.fn().mockResolvedValue({ error: null }),
			upload: jest.fn(),
			getPublicUrl: jest.fn(),
		});

		const result = await useEventStore.getState().deleteEvent("evt1", "host1");

		expect(result).toBe(true);
	});

	test("non-host is blocked from deleting", async () => {
		const guestChain = buildChain({ data: { role: "guest" }, error: null });
		supabase.from.mockImplementation((table: string) => {
			if (table === "event_participants") return guestChain;
			return buildChain();
		});

		const result = await useEventStore.getState().deleteEvent("evt1", "guest1");

		expect(result).toBe(false);
		expect(useEventStore.getState().error).toBe("You are not allowed to delete this event");
	});

	test("cleans pendingUploads for deleted event", async () => {
		const participantChain = buildChain({
			data: { role: "host" },
			error: null,
		});
		const mediaChain = buildChain({ data: [], error: null });
		const deleteChain = buildChain({ data: null, error: null });

		supabase.from.mockImplementation((table: string) => {
			if (table === "event_participants") {
				const call = supabase.from.mock.calls.filter(
					(c: any[]) => c[0] === "event_participants"
				).length;
				return call <= 1 ? participantChain : deleteChain;
			}
			if (table === "media_items") {
				const call = supabase.from.mock.calls.filter((c: any[]) => c[0] === "media_items").length;
				return call <= 1 ? mediaChain : deleteChain;
			}
			if (table === "events") return deleteChain;
			return buildChain();
		});

		await useEventStore.getState().deleteEvent("evt1", "host1");

		const remaining = useEventStore.getState().pendingUploads;
		expect(remaining).toHaveLength(1);
		expect(remaining[0].eventId).toBe("evt2");
		expect(AsyncStorage.setItem).toHaveBeenCalledWith("recapd_pending_uploads", expect.any(String));
	});

	test("updates events list and clears currentEvent", async () => {
		const participantChain = buildChain({
			data: { role: "host" },
			error: null,
		});
		const mediaChain = buildChain({ data: [], error: null });
		const deleteChain = buildChain({ data: null, error: null });

		supabase.from.mockImplementation((table: string) => {
			if (table === "event_participants") {
				const call = supabase.from.mock.calls.filter(
					(c: any[]) => c[0] === "event_participants"
				).length;
				return call <= 1 ? participantChain : deleteChain;
			}
			if (table === "media_items") {
				const call = supabase.from.mock.calls.filter((c: any[]) => c[0] === "media_items").length;
				return call <= 1 ? mediaChain : deleteChain;
			}
			if (table === "events") return deleteChain;
			return buildChain();
		});

		await useEventStore.getState().deleteEvent("evt1", "host1");

		expect(useEventStore.getState().events).toHaveLength(0);
		expect(useEventStore.getState().currentEvent).toBeNull();
	});
});

describe("loadPendingUploads (via initializePendingUploads)", () => {
	test("normal load populates pendingUploads with Date capturedAt", async () => {
		const stored = [
			{
				id: "upload-1",
				localUri: "file://p1.jpg",
				eventId: "evt1",
				userId: "user1",
				capturedAt: "2024-01-01T00:00:00.000Z",
				width: 100,
				height: 100,
				status: "pending",
				retryCount: 0,
				mediaType: "photo",
			},
		];
		(AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(stored));

		await useEventStore.getState().initializePendingUploads();

		const uploads = useEventStore.getState().pendingUploads;
		expect(uploads).toHaveLength(1);
		expect(uploads[0].capturedAt).toBeInstanceOf(Date);
	});

	test("syncing status reset to pending on load", async () => {
		const stored = [
			{
				id: "upload-1",
				localUri: "file://p1.jpg",
				eventId: "evt1",
				userId: "user1",
				capturedAt: "2024-01-01T00:00:00.000Z",
				width: 100,
				height: 100,
				status: "syncing",
				retryCount: 0,
				mediaType: "photo",
			},
		];
		(AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(stored));

		await useEventStore.getState().initializePendingUploads();

		expect(useEventStore.getState().pendingUploads[0].status).toBe("pending");
	});

	test("corrupted JSON clears storage and returns empty", async () => {
		(AsyncStorage.getItem as jest.Mock).mockResolvedValue("not valid json{{{");

		await useEventStore.getState().initializePendingUploads();

		expect(useEventStore.getState().pendingUploads).toHaveLength(0);
		expect(AsyncStorage.removeItem).toHaveBeenCalledWith("recapd_pending_uploads");
	});

	test("null from AsyncStorage results in empty pendingUploads", async () => {
		(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

		await useEventStore.getState().initializePendingUploads();

		expect(useEventStore.getState().pendingUploads).toHaveLength(0);
	});
});
