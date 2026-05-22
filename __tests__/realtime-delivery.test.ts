type PostgresChangesHandler = (payload: {
	eventType: "INSERT" | "UPDATE" | "DELETE";
	new: Record<string, unknown> | null;
	old: Record<string, unknown> | null;
}) => Promise<void> | void;

interface CapturedChannel {
	name: string;
	topic: string;
	handler: PostgresChangesHandler | null;
	statusCallback: ((status: string, err?: unknown) => void) | null;
}

const mockCapturedChannels: CapturedChannel[] = [];
const mockRealtimeSetAuth = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase", () => ({
	supabase: {
		from: mockFrom,
		channel: jest.fn((name: string) => {
			const captured: CapturedChannel = {
				name,
				topic: `realtime:${name}`,
				handler: null,
				statusCallback: null,
			};
			mockCapturedChannels.push(captured);
			const channelObject: Record<string, unknown> = {};
			channelObject.topic = captured.topic;
			channelObject.on = jest.fn((_event: string, _config: unknown, fn: PostgresChangesHandler) => {
				captured.handler = fn;
				return channelObject;
			});
			channelObject.subscribe = jest.fn((cb?: (status: string, err?: unknown) => void) => {
				captured.statusCallback = cb ?? null;
				cb?.("SUBSCRIBED");
				return channelObject;
			});
			return channelObject;
		}),
		getChannels: jest.fn(() => mockCapturedChannels.map((c) => ({ topic: c.topic }))),
		removeChannel: jest.fn((ch: { topic?: string }) => {
			const idx = mockCapturedChannels.findIndex((c) => c.topic === ch.topic);
			if (idx >= 0) mockCapturedChannels.splice(idx, 1);
		}),
		realtime: {
			setAuth: mockRealtimeSetAuth,
		},
		storage: {
			from: jest.fn().mockReturnValue({ remove: jest.fn() }),
		},
	},
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: {
		getItem: jest.fn().mockResolvedValue(null),
		setItem: jest.fn().mockResolvedValue(undefined),
		removeItem: jest.fn().mockResolvedValue(undefined),
	},
}));

jest.mock("date-fns", () => ({
	addDays: jest.fn((date: Date) => date),
}));

jest.mock("@/lib/dateUtils", () => ({
	safeDate: (d: unknown) => (d instanceof Date ? d : new Date(d as string)),
}));

jest.mock("@/lib/notifications", () => ({
	sendParticipantLimitNotification: jest.fn(),
	sendEventFullNotification: jest.fn(),
}));

jest.mock("@/lib/subscription", () => ({
	SUBSCRIPTIONS_ENABLED: false,
}));

jest.mock("@/lib/uploadQueue", () => ({
	generateUploadId: jest.fn().mockReturnValue("upload-1"),
	processUploadQueue: jest.fn().mockResolvedValue(undefined),
	setUploadCallbacks: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { useEventStore } from "@/store/eventStore";

function findChannel(name: string): CapturedChannel | undefined {
	return mockCapturedChannels.find((c) => c.name === name);
}

beforeEach(() => {
	mockCapturedChannels.length = 0;
	useEventStore.setState({
		events: [],
		currentEvent: null,
		mediaItems: [],
		pendingUploads: [],
		isLoading: false,
		error: null,
	});
	jest.clearAllMocks();
	mockFrom.mockReturnValue({
		select: jest.fn().mockReturnThis(),
		eq: jest.fn().mockReturnThis(),
		single: jest.fn().mockResolvedValue({ data: null, error: null }),
		// biome-ignore lint/suspicious/noThenProperty: mock must be thenable
		then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
	});
});

describe("realtime delivery to other participants", () => {
	test("INSERT payload for matching event_id appends to mediaItems", async () => {
		const unsubscribe = useEventStore.getState().subscribeToMediaItems("event-A");

		const channel = findChannel("media_items:event-A");
		expect(channel).toBeDefined();
		expect(channel?.handler).toBeInstanceOf(Function);

		await channel?.handler?.({
			eventType: "INSERT",
			new: {
				id: "m-1",
				event_id: "event-A",
				captured_at: "2024-06-01T19:00:00Z",
				uploaded_by_user_id: null,
				visibility: "shared",
				width: 100,
				height: 100,
				storage_path: "event-A/m-1.jpg",
			},
			old: null,
		});

		const items = useEventStore.getState().mediaItems;
		expect(items).toHaveLength(1);
		expect(items[0].id).toBe("m-1");
		unsubscribe();
	});

	test("removes any prior channel with the same topic before subscribing", () => {
		useEventStore.getState().subscribeToMediaItems("event-A");
		useEventStore.getState().subscribeToMediaItems("event-A");

		const matching = mockCapturedChannels.filter((c) => c.name === "media_items:event-A");
		expect(matching).toHaveLength(1);
	});

	test("DELETE payload removes the matching item", async () => {
		useEventStore.setState({
			mediaItems: [
				{
					id: "m-1",
					event_id: "event-A",
					captured_at: "2024-06-01T19:00:00Z",
					uploaded_by_user_id: null,
					visibility: "shared",
					storage_path: "event-A/m-1.jpg",
				} as never,
			],
		});

		useEventStore.getState().subscribeToMediaItems("event-A");
		const channel = findChannel("media_items:event-A");
		await channel?.handler?.({
			eventType: "DELETE",
			new: null,
			old: { id: "m-1" },
		});

		expect(useEventStore.getState().mediaItems).toHaveLength(0);
	});

	test("subscribe reports SUBSCRIBED status to the callback", () => {
		const unsubscribe = useEventStore.getState().subscribeToMediaItems("event-X");
		const channel = findChannel("media_items:event-X");
		expect(channel?.statusCallback).toBeInstanceOf(Function);
		unsubscribe();
	});

	test("hidden visibility on UPDATE removes the item from the timeline", async () => {
		useEventStore.setState({
			mediaItems: [
				{
					id: "m-1",
					event_id: "event-A",
					visibility: "shared",
					captured_at: "2024-06-01T19:00:00Z",
				} as never,
			],
		});

		useEventStore.getState().subscribeToMediaItems("event-A");
		const channel = findChannel("media_items:event-A");
		await channel?.handler?.({
			eventType: "UPDATE",
			new: {
				id: "m-1",
				event_id: "event-A",
				visibility: "deleted",
				captured_at: "2024-06-01T19:00:00Z",
			},
			old: { id: "m-1", visibility: "shared" },
		});

		expect(useEventStore.getState().mediaItems).toHaveLength(0);
	});
});
