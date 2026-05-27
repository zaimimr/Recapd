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
			"limit",
		];
		methods.forEach((m) => {
			chain[m] = jest.fn().mockReturnValue(chain);
		});
		// biome-ignore lint/suspicious/noThenProperty: mock must be thenable
		chain.then = (resolve: any) => resolve(finalValue);
		Object.defineProperty(chain, "data", { get: () => finalValue.data });
		Object.defineProperty(chain, "error", { get: () => finalValue.error });
		Object.defineProperty(chain, "count", { get: () => finalValue.count ?? null });
		return chain;
	};
	return {
		buildChain,
		supabase: {
			from: jest.fn().mockReturnValue(buildChain()),
			rpc: jest.fn(),
			channel: jest.fn().mockReturnValue({
				on: jest.fn().mockReturnThis(),
				subscribe: jest.fn().mockReturnThis(),
			}),
			removeChannel: jest.fn(),
			storage: {
				from: jest.fn().mockReturnValue({
					remove: jest.fn().mockResolvedValue({ error: null }),
				}),
			},
		},
	};
});

jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: {
		getItem: jest.fn().mockResolvedValue(null),
		setItem: jest.fn().mockResolvedValue(undefined),
		removeItem: jest.fn().mockResolvedValue(undefined),
	},
}));

jest.mock("date-fns", () => ({
	addDays: jest.fn((date: Date, days: number) => {
		const result = new Date(date);
		result.setDate(result.getDate() + days);
		return result;
	}),
	subDays: jest.fn((date: Date, days: number) => {
		const result = new Date(date);
		result.setDate(result.getDate() - days);
		return result;
	}),
	subHours: jest.fn((date: Date, hours: number) => {
		const result = new Date(date);
		result.setHours(result.getHours() - hours);
		return result;
	}),
	subMinutes: jest.fn((date: Date, minutes: number) => {
		const result = new Date(date);
		result.setMinutes(result.getMinutes() - minutes);
		return result;
	}),
}));

jest.mock("expo-crypto", () => ({
	getRandomBytesAsync: jest.fn().mockResolvedValue(new Uint8Array(16).fill(0xab)),
}));

jest.mock("@/lib/dateUtils", () => ({
	safeDate: (d: any) => (d instanceof Date ? d : new Date(d)),
}));

jest.mock("@/lib/notifications", () => ({}));

jest.mock("@/lib/subscription", () => ({
	SUBSCRIPTIONS_ENABLED: true,
}));

jest.mock("@/lib/uploadQueue", () => ({
	generateUploadId: jest.fn().mockReturnValue("upload-1"),
	processUploadQueue: jest.fn().mockResolvedValue(undefined),
	setUploadCallbacks: jest.fn(),
}));
jest.mock("@/lib/storage", () => ({
	createVideoThumbnailUri: jest.fn().mockResolvedValue("file:///thumb.jpg"),
	stageUploadFileIfPurgeable: jest.fn().mockResolvedValue(null),
	cleanupStagedUpload: jest.fn().mockResolvedValue(undefined),
}));

import { useEventStore } from "@/store/eventStore";

const { supabase, buildChain } = require("@/lib/supabase");

const mockEvent = {
	id: "event-1",
	title: "Birthday Party",
	starts_at: "2024-06-01T18:00:00Z",
	ends_at: "2024-06-01T22:00:00Z",
	timezone: "UTC",
	expires_at: "2024-06-15T22:00:00Z",
	join_code: "ABC123",
	created_by_user_id: "host-1",
	status: "scheduled",
	created_at: "2024-05-01T00:00:00Z",
	updated_at: "2024-05-01T00:00:00Z",
};

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
	supabase.rpc.mockResolvedValue({ data: [], error: null });
});

describe("host creates a new event", () => {
	test("generates a join code and sets expiry 14 days after end date", async () => {
		const insertChain = buildChain({ data: null, error: null });
		const participantInsertChain = buildChain({ data: null, error: null });
		const eventFetchChain = buildChain({ data: mockEvent, error: null });
		const participantsFetchChain = buildChain({
			data: [{ event_id: mockEvent.id, user_id: "host-1", role: "host" }],
			error: null,
		});
		const hostUserChain = buildChain({
			data: { subscription_tier: "free", display_name: "Host User" },
			error: null,
		});
		let eventsCallCount = 0;
		let participantsCallCount = 0;

		supabase.from.mockImplementation((table: string) => {
			if (table === "events") {
				eventsCallCount += 1;
				return eventsCallCount === 1 ? insertChain : eventFetchChain;
			}
			if (table === "event_participants") {
				participantsCallCount += 1;
				return participantsCallCount === 1 ? participantInsertChain : participantsFetchChain;
			}
			if (table === "users") return hostUserChain;
			return buildChain();
		});

		const result = await useEventStore.getState().createEvent(
			{
				title: "Birthday Party",
				starts_at: "2024-06-01T18:00:00Z",
				ends_at: "2024-06-01T22:00:00Z",
				created_by_user_id: "host-1",
			},
			"host-1"
		);

		expect(result).toBeTruthy();
		expect(insertChain.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				id: expect.any(String),
				join_code: expect.any(String),
				expires_at: expect.any(String),
			})
		);
	});

	test("automatically adds the creator as a host participant", async () => {
		const insertChain = buildChain({ data: null, error: null });
		const participantInsertChain = buildChain({ data: null, error: null });
		const eventFetchChain = buildChain({ data: mockEvent, error: null });
		const participantsFetchChain = buildChain({
			data: [{ event_id: mockEvent.id, user_id: "host-1", role: "host" }],
			error: null,
		});
		const hostUserChain = buildChain({
			data: { subscription_tier: "free", display_name: "Host User" },
			error: null,
		});
		let eventsCallCount = 0;
		let participantsCallCount = 0;

		supabase.from.mockImplementation((table: string) => {
			if (table === "events") {
				eventsCallCount += 1;
				return eventsCallCount === 1 ? insertChain : eventFetchChain;
			}
			if (table === "event_participants") {
				participantsCallCount += 1;
				return participantsCallCount === 1 ? participantInsertChain : participantsFetchChain;
			}
			if (table === "users") return hostUserChain;
			return buildChain();
		});

		await useEventStore.getState().createEvent(
			{
				title: "Party",
				starts_at: "2024-06-01T18:00:00Z",
				ends_at: "2024-06-01T22:00:00Z",
				created_by_user_id: "host-1",
			},
			"host-1"
		);

		expect(participantInsertChain.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				event_id: expect.any(String),
				user_id: "host-1",
				role: "host",
			})
		);
	});

	test("returns null and sets error when creation fails", async () => {
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		supabase.from.mockReturnValue(buildChain({ data: null, error: { message: "DB error" } }));

		const result = await useEventStore.getState().createEvent(
			{
				title: "Party",
				starts_at: "2024-06-01T18:00:00Z",
				ends_at: "2024-06-01T22:00:00Z",
				created_by_user_id: "host-1",
			},
			"host-1"
		);

		expect(result).toBeNull();
		expect(useEventStore.getState().error).toBe("Failed to create event");
		consoleSpy.mockRestore();
	});
});

describe("looking up an event by join code", () => {
	test("returns the event with participant count and host pro status", async () => {
		supabase.rpc.mockResolvedValue({
			data: [
				{
					...mockEvent,
					participant_count: 5,
					host_is_pro: false,
				},
			],
			error: null,
		});

		const result = await useEventStore.getState().fetchEventByCode("ABC123");

		expect(result).toBeTruthy();
		expect(result?.participant_count).toBe(5);
		expect(result?.hostIsPro).toBe(false);
	});

	test("shows host as Pro when they have an active subscription", async () => {
		supabase.rpc.mockResolvedValue({
			data: [
				{
					...mockEvent,
					participant_count: 5,
					host_is_pro: true,
				},
			],
			error: null,
		});

		const result = await useEventStore.getState().fetchEventByCode("ABC123");

		expect(result?.hostIsPro).toBe(true);
	});

	test("returns null with 'Event not found' when code doesn't match", async () => {
		supabase.rpc.mockResolvedValue({ data: [], error: null });

		const result = await useEventStore.getState().fetchEventByCode("ZZZZZ");

		expect(result).toBeNull();
		expect(useEventStore.getState().error).toBe("Event not found");
	});

	test("normalizes the join code to uppercase", async () => {
		supabase.rpc.mockResolvedValue({
			data: [
				{
					...mockEvent,
					participant_count: 1,
					host_is_pro: false,
				},
			],
			error: null,
		});

		await useEventStore.getState().fetchEventByCode("abc123");

		expect(supabase.rpc).toHaveBeenCalledWith("get_event_preview", {
			join_code_input: "ABC123",
		});
	});
});

describe("loading an event by ID with full details", () => {
	test("includes participants, count, host pro status, and host name", async () => {
		const eventsChain = buildChain({ data: mockEvent, error: null });
		const participantsChain = buildChain({
			data: [
				{ user_id: "host-1", role: "host", joined_at: "2024-05-01T00:00:00Z" },
				{ user_id: "guest-1", role: "guest", joined_at: "2024-06-01T00:00:00Z" },
			],
			error: null,
		});
		const hostUserChain = buildChain({
			data: { subscription_tier: "pro", display_name: "Alice" },
			error: null,
		});

		supabase.from.mockImplementation((table: string) => {
			if (table === "events") return eventsChain;
			if (table === "event_participants") return participantsChain;
			if (table === "users") return hostUserChain;
			return buildChain();
		});

		const result = await useEventStore.getState().fetchEventById("event-1");

		expect(result?.participant_count).toBe(2);
		expect(result?.hostIsPro).toBe(true);
		expect(result?.hostDisplayName).toBe("Alice");
		expect(useEventStore.getState().currentEvent).toEqual(result);
	});

	test("defaults host name to 'the host' when not available", async () => {
		const eventsChain = buildChain({ data: mockEvent, error: null });
		const participantsChain = buildChain({
			data: [{ user_id: "host-1", role: "host" }],
			error: null,
		});
		const hostUserChain = buildChain({
			data: { subscription_tier: "free", display_name: null },
			error: null,
		});

		supabase.from.mockImplementation((table: string) => {
			if (table === "events") return eventsChain;
			if (table === "event_participants") return participantsChain;
			if (table === "users") return hostUserChain;
			return buildChain();
		});

		const result = await useEventStore.getState().fetchEventById("event-1");

		expect(result?.hostDisplayName).toBe("the host");
	});
});

describe("guest joins an event", () => {
	test("adds the user as a guest participant", async () => {
		const existingCheck = buildChain({ data: null, error: { code: "PGRST116" } });
		const countCheck = buildChain({ data: null, error: null, count: 5 });
		const eventDataChain = buildChain({
			data: { created_by_user_id: "host-1" },
			error: null,
		});
		const hostUserChain = buildChain({
			data: { subscription_tier: "free" },
			error: null,
		});
		const insertChain = buildChain({ data: null, error: null });
		const postJoinCountChain = buildChain({ data: null, error: null, count: 6 });

		let epCallIndex = 0;
		supabase.from.mockImplementation((table: string) => {
			if (table === "event_participants") {
				epCallIndex++;
				if (epCallIndex === 1) return existingCheck;
				if (epCallIndex === 2) return countCheck;
				if (epCallIndex === 3) return insertChain;
				return postJoinCountChain;
			}
			if (table === "events") return eventDataChain;
			if (table === "users") return hostUserChain;
			return buildChain();
		});

		const result = await useEventStore.getState().joinEvent("event-1", "guest-1");

		expect(result).toBe(true);
		expect(insertChain.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				user_id: "guest-1",
				role: "guest",
			})
		);
	});

	test("silently succeeds if the user already joined", async () => {
		const existingCheck = buildChain({ data: { id: "p-1" }, error: null });

		supabase.from.mockReturnValue(existingCheck);

		const result = await useEventStore.getState().joinEvent("event-1", "guest-1");

		expect(result).toBe(true);
	});

	test("supports optional nickname for the event", async () => {
		const existingCheck = buildChain({ data: null, error: { code: "PGRST116" } });
		const countCheck = buildChain({ data: null, error: null, count: 3 });
		const eventDataChain = buildChain({
			data: { created_by_user_id: "host-1" },
			error: null,
		});
		const hostUserChain = buildChain({
			data: { subscription_tier: "free" },
			error: null,
		});
		const insertChain = buildChain({ data: null, error: null });
		const postJoinCountChain = buildChain({ data: null, error: null, count: 4 });

		let epCallIndex = 0;
		supabase.from.mockImplementation((table: string) => {
			if (table === "event_participants") {
				epCallIndex++;
				if (epCallIndex === 1) return existingCheck;
				if (epCallIndex === 2) return countCheck;
				if (epCallIndex === 3) return insertChain;
				return postJoinCountChain;
			}
			if (table === "events") return eventDataChain;
			if (table === "users") return hostUserChain;
			return buildChain();
		});

		await useEventStore.getState().joinEvent("event-1", "guest-1", "Bobby");

		expect(insertChain.insert).toHaveBeenCalledWith(expect.objectContaining({ nickname: "Bobby" }));
	});
});

describe("free tier participant limit (12 people)", () => {
	test("blocks joining when the event already has 12 participants", async () => {
		const existingCheck = buildChain({ data: null, error: { code: "PGRST116" } });
		const countCheck = buildChain({ data: null, error: null, count: 12 });
		const eventDataChain = buildChain({
			data: { created_by_user_id: "host-1" },
			error: null,
		});
		const hostUserChain = buildChain({
			data: { subscription_tier: "free" },
			error: null,
		});

		let epCallIndex = 0;
		supabase.from.mockImplementation((table: string) => {
			if (table === "event_participants") {
				epCallIndex++;
				if (epCallIndex === 1) return existingCheck;
				return countCheck;
			}
			if (table === "events") return eventDataChain;
			if (table === "users") return hostUserChain;
			return buildChain();
		});

		const result = await useEventStore.getState().joinEvent("event-1", "guest-new");

		expect(result).toBe(false);
		expect(useEventStore.getState().error).toBe("Event is full");
	});

	test("allows joining beyond 12 when the host is Pro", async () => {
		const existingCheck = buildChain({ data: null, error: { code: "PGRST116" } });
		const countCheck = buildChain({ data: null, error: null, count: 15 });
		const eventDataChain = buildChain({
			data: { created_by_user_id: "host-1" },
			error: null,
		});
		const hostUserChain = buildChain({
			data: { subscription_tier: "pro" },
			error: null,
		});
		const insertChain = buildChain({ data: null, error: null });
		const postJoinCountChain = buildChain({ data: null, error: null, count: 16 });

		let epCallIndex = 0;
		supabase.from.mockImplementation((table: string) => {
			if (table === "event_participants") {
				epCallIndex++;
				if (epCallIndex === 1) return existingCheck;
				if (epCallIndex === 2) return countCheck;
				if (epCallIndex === 3) return insertChain;
				return postJoinCountChain;
			}
			if (table === "events") return eventDataChain;
			if (table === "users") return hostUserChain;
			return buildChain();
		});

		const result = await useEventStore.getState().joinEvent("event-1", "guest-new");

		expect(result).toBe(true);
	});

	test("allows the 12th participant to join without client-side fanout", async () => {
		const existingCheck = buildChain({ data: null, error: { code: "PGRST116" } });
		const countBefore = buildChain({ data: null, error: null, count: 11 });
		const eventDataChain = buildChain({
			data: { created_by_user_id: "host-1" },
			error: null,
		});
		const hostUserChain = buildChain({
			data: { subscription_tier: "free" },
			error: null,
		});
		const insertChain = buildChain({ data: null, error: null });
		const countAfter = buildChain({ data: null, error: null, count: 12 });

		let epCallIndex = 0;
		supabase.from.mockImplementation((table: string) => {
			if (table === "event_participants") {
				epCallIndex++;
				if (epCallIndex === 1) return existingCheck;
				if (epCallIndex === 2) return countBefore;
				if (epCallIndex === 3) return insertChain;
				return countAfter;
			}
			if (table === "events") return eventDataChain;
			if (table === "users") return hostUserChain;
			return buildChain();
		});

		const result = await useEventStore.getState().joinEvent("event-1", "guest-12");

		expect(result).toBe(true);
		expect(insertChain.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				user_id: "guest-12",
				role: "guest",
			})
		);
	});
});

describe("host updates event details", () => {
	test("saves changes and refreshes the event", async () => {
		const updateChain = buildChain({ data: null, error: null });
		const participantsChain = buildChain({ data: [], error: null });

		supabase.from.mockImplementation((table: string) => {
			if (table === "events") return updateChain;
			if (table === "event_participants") return participantsChain;
			if (table === "users") return buildChain({ data: null, error: null });
			return buildChain();
		});

		const result = await useEventStore.getState().updateEvent("event-1", {
			title: "Updated Party",
		});

		expect(result).toBe(true);
		expect(updateChain.update).toHaveBeenCalledWith(
			expect.objectContaining({ title: "Updated Party" })
		);
	});

	test("recalculates expiry when end date changes", async () => {
		const updateChain = buildChain({ data: null, error: null });
		const participantsChain = buildChain({ data: [], error: null });

		supabase.from.mockImplementation((table: string) => {
			if (table === "events") return updateChain;
			if (table === "event_participants") return participantsChain;
			if (table === "users") return buildChain({ data: null, error: null });
			return buildChain();
		});

		await useEventStore.getState().updateEvent("event-1", {
			ends_at: "2024-07-01T22:00:00Z",
		});

		expect(updateChain.update).toHaveBeenCalledWith(
			expect.objectContaining({ expires_at: expect.any(String) })
		);
	});
});

describe("participant leaves an event", () => {
	test("guest can leave and their local data is cleaned up", async () => {
		const participantsChain = buildChain({
			data: [
				{ user_id: "host-1", role: "host" },
				{ user_id: "guest-1", role: "guest" },
			],
			error: null,
		});
		const deleteChain = buildChain({ data: null, error: null });

		supabase.from.mockImplementation(() => ({
			...participantsChain,
			delete: deleteChain.delete,
		}));

		useEventStore.setState({
			events: [{ ...mockEvent, userRole: "guest" } as any],
		});

		const result = await useEventStore.getState().leaveEvent("event-1", "guest-1");

		expect(result.success).toBe(true);
		expect(useEventStore.getState().events).toHaveLength(0);
	});

	test("last remaining host cannot leave (must delete event instead)", async () => {
		const participantsChain = buildChain({
			data: [{ user_id: "host-1", role: "host" }],
			error: null,
		});

		supabase.from.mockReturnValue(participantsChain);

		const result = await useEventStore.getState().leaveEvent("event-1", "host-1");

		expect(result.success).toBe(false);
		expect(result.isLastHost).toBe(true);
	});

	test("host can leave if another host exists", async () => {
		const participantsChain = buildChain({
			data: [
				{ user_id: "host-1", role: "host" },
				{ user_id: "host-2", role: "host" },
			],
			error: null,
		});
		const deleteChain = buildChain({ data: null, error: null });

		supabase.from.mockImplementation(() => ({
			...participantsChain,
			delete: deleteChain.delete,
		}));

		const result = await useEventStore.getState().leaveEvent("event-1", "host-1");

		expect(result.success).toBe(true);
	});
});

describe("host removes a participant", () => {
	test("host can remove a guest from the event", async () => {
		const callerChain = buildChain({ data: { role: "host" }, error: null });
		const targetChain = buildChain({ data: { role: "guest" }, error: null });
		const deleteChain = buildChain({ data: null, error: null });

		let epCallIndex = 0;
		supabase.from.mockImplementation(() => {
			epCallIndex++;
			if (epCallIndex === 1) return callerChain;
			if (epCallIndex === 2) return targetChain;
			return deleteChain;
		});

		const result = await useEventStore.getState().removeParticipant("event-1", "guest-1", "host-1");

		expect(result).toBe(true);
	});

	test("host cannot remove another host", async () => {
		const callerChain = buildChain({ data: { role: "host" }, error: null });
		const targetChain = buildChain({ data: { role: "host" }, error: null });

		let epCallIndex = 0;
		supabase.from.mockImplementation(() => {
			epCallIndex++;
			return epCallIndex === 1 ? callerChain : targetChain;
		});

		const result = await useEventStore.getState().removeParticipant("event-1", "host-2", "host-1");

		expect(result).toBe(false);
	});

	test("non-hosts cannot remove anyone", async () => {
		const callerChain = buildChain({ data: { role: "guest" }, error: null });

		supabase.from.mockReturnValue(callerChain);

		const result = await useEventStore
			.getState()
			.removeParticipant("event-1", "guest-2", "guest-1");

		expect(result).toBe(false);
	});
});

describe("host deletes an event", () => {
	test("cleans up all photos, participants, and the event itself", async () => {
		const roleCheck = buildChain({ data: { role: "host" }, error: null });
		const mediaChain = buildChain({
			data: [{ storage_path: "photos/1.jpg" }],
			error: null,
		});
		const deleteChain = buildChain({ data: null, error: null });

		let epCallIndex = 0;
		supabase.from.mockImplementation((table: string) => {
			if (table === "event_participants") {
				epCallIndex++;
				return epCallIndex === 1 ? roleCheck : deleteChain;
			}
			if (table === "media_items") return mediaChain;
			if (table === "events") return deleteChain;
			return buildChain();
		});

		useEventStore.setState({
			events: [mockEvent as any],
			currentEvent: mockEvent as any,
		});

		const result = await useEventStore.getState().deleteEvent("event-1", "host-1");

		expect(result).toBe(true);
		expect(supabase.storage.from).toHaveBeenCalledWith("event-photos");
		expect(useEventStore.getState().events).toHaveLength(0);
		expect(useEventStore.getState().currentEvent).toBeNull();
	});

	test("non-hosts are prevented from deleting", async () => {
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		const roleCheck = buildChain({ data: { role: "guest" }, error: null });

		supabase.from.mockReturnValue(roleCheck);

		const result = await useEventStore.getState().deleteEvent("event-1", "guest-1");

		expect(result).toBe(false);
		expect(useEventStore.getState().error).toBe("You are not allowed to delete this event");
		consoleSpy.mockRestore();
	});
});

describe("loading a user's events", () => {
	test("fetches all events the user participates in with counts", async () => {
		const partChain = buildChain({
			data: [{ event_id: "e1", role: "host" }],
			error: null,
		});
		const eventsChain = buildChain({
			data: [{ ...mockEvent, id: "e1" }],
			error: null,
		});
		const countChain = buildChain({ data: null, error: null, count: 3 });

		let epCallIndex = 0;
		supabase.from.mockImplementation((table: string) => {
			if (table === "event_participants") {
				epCallIndex++;
				return epCallIndex === 1 ? partChain : countChain;
			}
			if (table === "events") return eventsChain;
			return buildChain();
		});

		await useEventStore.getState().fetchUserEvents("user-1");

		const events = useEventStore.getState().events;
		expect(events).toHaveLength(1);
		expect(events[0].userRole).toBe("host");
		expect(events[0].participant_count).toBe(3);
	});

	test("sets empty events list when user has no participations", async () => {
		const partChain = buildChain({ data: [], error: null });
		supabase.from.mockReturnValue(partChain);

		await useEventStore.getState().fetchUserEvents("user-1");

		expect(useEventStore.getState().events).toHaveLength(0);
	});
});

describe("participant marks 'no photos to upload'", () => {
	test("records the flag in the database", async () => {
		const updateChain = buildChain({ data: [{ id: "p-1" }], error: null });
		supabase.from.mockReturnValue(updateChain);

		const result = await useEventStore.getState().markNoPhotosToUpload("event-1", "user-1");

		expect(result).toBe(true);
		expect(updateChain.update).toHaveBeenCalledWith({ no_photos_to_upload: true });
	});

	test("returns false when the participant is not found", async () => {
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		const updateChain = buildChain({ data: [], error: null });
		supabase.from.mockReturnValue(updateChain);

		const result = await useEventStore.getState().markNoPhotosToUpload("event-1", "user-1");

		expect(result).toBe(false);
		consoleSpy.mockRestore();
	});
});

describe("checking if participant marked no photos", () => {
	test("returns true when the flag is set", async () => {
		const chain = buildChain({ data: { no_photos_to_upload: true }, error: null });
		supabase.from.mockReturnValue(chain);

		const result = await useEventStore.getState().getNoPhotosToUpload("event-1", "user-1");

		expect(result).toBe(true);
	});

	test("defaults to false when flag is not set or null", async () => {
		const chain = buildChain({ data: { no_photos_to_upload: null }, error: null });
		supabase.from.mockReturnValue(chain);

		const result = await useEventStore.getState().getNoPhotosToUpload("event-1", "user-1");

		expect(result).toBe(false);
	});
});

describe("fetching participant stats", () => {
	test("returns each participant with their photo count", async () => {
		const participantsChain = buildChain({
			data: [
				{
					user_id: "host-1",
					role: "host",
					joined_at: "2024-01-01",
					no_photos_to_upload: false,
					user: { id: "host-1", display_name: "Alice" },
				},
				{
					user_id: "guest-1",
					role: "guest",
					joined_at: "2024-01-02",
					no_photos_to_upload: true,
					user: { id: "guest-1", display_name: "Bob" },
				},
			],
			error: null,
		});
		const photoCountsChain = buildChain({
			data: [
				{ uploaded_by_user_id: "host-1" },
				{ uploaded_by_user_id: "host-1" },
				{ uploaded_by_user_id: "guest-1" },
			],
			error: null,
		});

		supabase.from.mockImplementation((table: string) => {
			if (table === "event_participants") return participantsChain;
			if (table === "media_items") return photoCountsChain;
			return buildChain();
		});

		const stats = await useEventStore.getState().fetchParticipantStats("event-1");

		expect(stats).toHaveLength(2);
		expect(stats[0].displayName).toBe("Alice");
		expect(stats[0].photoCount).toBe(2);
		expect(stats[0].role).toBe("host");
		expect(stats[1].displayName).toBe("Bob");
		expect(stats[1].photoCount).toBe(1);
		expect(stats[1].noPhotosToUpload).toBe(true);
	});
});

describe("fetching shared media items", () => {
	test("loads only shared-visibility photos ordered by newest capture time first", async () => {
		const mediaChain = buildChain({
			data: [
				{
					id: "m-1",
					event_id: "event-1",
					captured_at: "2024-06-01T19:00:00Z",
					visibility: "shared",
					uploader: { display_name: "Alice" },
				},
			],
			error: null,
		});
		supabase.from.mockReturnValue(mediaChain);

		await useEventStore.getState().fetchMediaItems("event-1");

		expect(useEventStore.getState().mediaItems).toHaveLength(1);
		expect(mediaChain.eq).toHaveBeenCalledWith("visibility", "shared");
		expect(mediaChain.order).toHaveBeenCalledWith("captured_at", { ascending: false });
	});
});

describe("real-time subscriptions", () => {
	test("subscribes to media_items changes for an event", () => {
		const unsubscribe = useEventStore.getState().subscribeToMediaItems("event-1");

		expect(supabase.channel).toHaveBeenCalledWith("media_items:event-1");
		expect(typeof unsubscribe).toBe("function");

		unsubscribe();
		expect(supabase.removeChannel).toHaveBeenCalled();
	});

	test("subscribes to participant changes for an event", () => {
		const unsubscribe = useEventStore.getState().subscribeToParticipants("event-1");

		expect(supabase.channel).toHaveBeenCalledWith("participants:event-1");
		expect(typeof unsubscribe).toBe("function");
	});

	test("subscribes to event-level updates and deletes", () => {
		const unsubscribe = useEventStore.getState().subscribeToEvent("event-1");

		expect(supabase.channel).toHaveBeenCalledWith("event:event-1");
		expect(typeof unsubscribe).toBe("function");
	});

	test("subscribes to all events for a user (join/leave/update)", () => {
		const unsubscribe = useEventStore.getState().subscribeToUserEvents("user-1");

		expect(supabase.channel).toHaveBeenCalledWith("user_participations:user-1");
		expect(supabase.channel).toHaveBeenCalledWith("user_events_updates:user-1");
		expect(typeof unsubscribe).toBe("function");
	});
});

describe("local state management", () => {
	test("setCurrentEvent updates the active event", () => {
		useEventStore.getState().setCurrentEvent(mockEvent as any);

		expect(useEventStore.getState().currentEvent).toEqual(mockEvent);
	});

	test("clearError resets the error state", () => {
		useEventStore.setState({ error: "Something went wrong" });

		useEventStore.getState().clearError();

		expect(useEventStore.getState().error).toBeNull();
	});

	test("retryFailedUpload resets upload status to pending", async () => {
		useEventStore.setState({
			pendingUploads: [
				{
					id: "u-1",
					status: "failed",
					eventId: "event-1",
					userId: "user-1",
					localUri: "file://photo.jpg",
					capturedAt: new Date(),
					width: 100,
					height: 100,
					retryCount: 1,
				} as any,
			],
		});

		useEventStore.getState().retryFailedUpload("u-1");

		expect(useEventStore.getState().pendingUploads[0].status).toBe("pending");
	});

	test("removePendingUpload removes the upload from the queue", async () => {
		useEventStore.setState({
			pendingUploads: [
				{
					id: "u-1",
					status: "pending",
					eventId: "event-1",
					userId: "user-1",
					localUri: "file://photo.jpg",
					capturedAt: new Date(),
					width: 100,
					height: 100,
					retryCount: 0,
				} as any,
			],
		});

		await useEventStore.getState().removePendingUpload("u-1");

		expect(useEventStore.getState().pendingUploads).toHaveLength(0);
	});
});
