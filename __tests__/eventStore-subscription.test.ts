import { FREE_PARTICIPANT_LIMIT } from "@/types/subscription";

const mockFrom = jest.fn();

jest.mock("@/lib/supabase", () => ({
	supabase: {
		from: (...args: unknown[]) => mockFrom(...args),
		channel: jest.fn(() => ({
			on: jest.fn().mockReturnThis(),
			subscribe: jest.fn(),
		})),
		removeChannel: jest.fn(),
		storage: { from: jest.fn() },
	},
}));

jest.mock("@/lib/subscription", () => ({
	SUBSCRIPTIONS_ENABLED: true,
}));

jest.mock("@/lib/notifications", () => ({
	sendParticipantLimitNotification: jest.fn(),
}));

jest.mock("@/lib/uploadQueue", () => ({
	setUploadCallbacks: jest.fn(),
	processUploadQueue: jest.fn(),
	generateUploadId: jest.fn(() => "upload-1"),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: {
		getItem: jest.fn(() => Promise.resolve(null)),
		setItem: jest.fn(() => Promise.resolve()),
		removeItem: jest.fn(() => Promise.resolve()),
	},
}));

function buildChain(finalValue: unknown) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const chain: Record<string, any> = {};
	chain.single = jest.fn().mockResolvedValue(finalValue);
	chain.eq = jest.fn().mockReturnValue(chain);
	chain.in = jest.fn().mockReturnValue(chain);
	chain.select = jest.fn().mockReturnValue(chain);
	chain.insert = jest.fn().mockReturnValue(chain);
	chain.order = jest.fn().mockReturnValue(chain);
	// biome-ignore lint/suspicious/noThenProperty: mock must be thenable to simulate Supabase query builder
	chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(finalValue).then(resolve);
	return chain;
}

function setupFetchEventByCodeMocks(opts: {
	event: Record<string, unknown>;
	participantCount: number;
	participants: { role: string; user_id: string }[];
	hostSubscriptionTier: string;
}) {
	let participantCallIndex = 0;

	mockFrom.mockImplementation((table: string) => {
		if (table === "events") {
			return buildChain({ data: opts.event, error: null });
		}
		if (table === "event_participants") {
			const callIdx = participantCallIndex++;
			if (callIdx === 0) {
				return buildChain({
					count: opts.participantCount,
					error: null,
				});
			}
			return buildChain({
				data: opts.participants,
				error: null,
			});
		}
		if (table === "users") {
			return buildChain({
				data: { subscription_tier: opts.hostSubscriptionTier },
				error: null,
			});
		}
		return buildChain({ data: null, error: null });
	});
}

beforeEach(() => {
	jest.clearAllMocks();
	const { useEventStore } = require("@/store/eventStore");
	useEventStore.setState({
		events: [],
		currentEvent: null,
		mediaItems: [],
		pendingUploads: [],
		isLoading: false,
		error: null,
	});
});

describe("fetchEventByCode subscription tier detection", () => {
	it("returns hostIsPro=true when host has pro subscription", async () => {
		const { useEventStore } = require("@/store/eventStore");

		setupFetchEventByCodeMocks({
			event: {
				id: "evt-1",
				title: "Pro Event",
				join_code: "ABC123",
				starts_at: new Date().toISOString(),
				ends_at: new Date().toISOString(),
			},
			participantCount: 5,
			participants: [{ role: "host", user_id: "host-1" }],
			hostSubscriptionTier: "pro",
		});

		const result = await useEventStore.getState().fetchEventByCode("ABC123");

		expect(result).not.toBeNull();
		expect(result?.hostIsPro).toBe(true);
	});

	it("returns hostIsPro=false when host has free subscription", async () => {
		const { useEventStore } = require("@/store/eventStore");

		setupFetchEventByCodeMocks({
			event: {
				id: "evt-2",
				title: "Free Event",
				join_code: "DEF456",
				starts_at: new Date().toISOString(),
				ends_at: new Date().toISOString(),
			},
			participantCount: 3,
			participants: [{ role: "host", user_id: "host-2" }],
			hostSubscriptionTier: "free",
		});

		const result = await useEventStore.getState().fetchEventByCode("DEF456");

		expect(result).not.toBeNull();
		expect(result?.hostIsPro).toBe(false);
	});
});

describe("joinEvent subscription gating", () => {
	function setupJoinEventMocks(opts: {
		existingParticipant: boolean;
		currentCount: number;
		hostUserId: string;
		hostSubscriptionTier: string;
	}) {
		let participantCallIndex = 0;

		mockFrom.mockImplementation((table: string) => {
			if (table === "event_participants") {
				const callIdx = participantCallIndex++;
				if (callIdx === 0) {
					return buildChain(
						opts.existingParticipant
							? { data: { id: "existing-1" }, error: null }
							: { data: null, error: { code: "PGRST116" } }
					);
				}
				if (callIdx === 1) {
					return buildChain({
						count: opts.currentCount,
						error: null,
					});
				}
				if (callIdx === 2) {
					return buildChain({ data: null, error: null });
				}
				return buildChain({
					count: opts.currentCount + 1,
					error: null,
				});
			}
			if (table === "events") {
				return buildChain({
					data: {
						created_by_user_id: opts.hostUserId,
						title: "Test Event",
					},
					error: null,
				});
			}
			if (table === "users") {
				return buildChain({
					data: { subscription_tier: opts.hostSubscriptionTier },
					error: null,
				});
			}
			return buildChain({ data: null, error: null });
		});
	}

	it("blocks joining when count >= FREE_PARTICIPANT_LIMIT, host is free, and SUBSCRIPTIONS_ENABLED", async () => {
		jest.resetModules();
		jest.mock("@/lib/subscription", () => ({
			SUBSCRIPTIONS_ENABLED: true,
		}));

		const { useEventStore } = require("@/store/eventStore");

		setupJoinEventMocks({
			existingParticipant: false,
			currentCount: FREE_PARTICIPANT_LIMIT,
			hostUserId: "host-free",
			hostSubscriptionTier: "free",
		});

		const result = await useEventStore.getState().joinEvent("evt-full", "user-new");

		expect(result).toBe(false);
		expect(useEventStore.getState().error).toBe("Event is full");
	});

	it("allows joining when count >= FREE_PARTICIPANT_LIMIT but host is pro", async () => {
		jest.resetModules();
		jest.mock("@/lib/subscription", () => ({
			SUBSCRIPTIONS_ENABLED: true,
		}));

		const { useEventStore } = require("@/store/eventStore");

		setupJoinEventMocks({
			existingParticipant: false,
			currentCount: FREE_PARTICIPANT_LIMIT,
			hostUserId: "host-pro",
			hostSubscriptionTier: "pro",
		});

		const result = await useEventStore.getState().joinEvent("evt-pro", "user-new");

		expect(result).toBe(true);
	});

	it("allows joining when count < FREE_PARTICIPANT_LIMIT and host is free", async () => {
		jest.resetModules();
		jest.mock("@/lib/subscription", () => ({
			SUBSCRIPTIONS_ENABLED: true,
		}));

		const { useEventStore } = require("@/store/eventStore");

		setupJoinEventMocks({
			existingParticipant: false,
			currentCount: 5,
			hostUserId: "host-free",
			hostSubscriptionTier: "free",
		});

		const result = await useEventStore.getState().joinEvent("evt-ok", "user-new");

		expect(result).toBe(true);
	});

	it("allows joining when SUBSCRIPTIONS_ENABLED=false even at limit", async () => {
		jest.resetModules();
		jest.mock("@/lib/subscription", () => ({
			SUBSCRIPTIONS_ENABLED: false,
		}));

		const { useEventStore } = require("@/store/eventStore");

		setupJoinEventMocks({
			existingParticipant: false,
			currentCount: FREE_PARTICIPANT_LIMIT,
			hostUserId: "host-free",
			hostSubscriptionTier: "free",
		});

		const result = await useEventStore.getState().joinEvent("evt-disabled", "user-new");

		expect(result).toBe(true);
	});

	it("returns true immediately when user is already a participant", async () => {
		jest.resetModules();
		jest.mock("@/lib/subscription", () => ({
			SUBSCRIPTIONS_ENABLED: true,
		}));

		const { useEventStore } = require("@/store/eventStore");

		setupJoinEventMocks({
			existingParticipant: true,
			currentCount: FREE_PARTICIPANT_LIMIT,
			hostUserId: "host-free",
			hostSubscriptionTier: "free",
		});

		const result = await useEventStore.getState().joinEvent("evt-existing", "user-existing");

		expect(result).toBe(true);
		expect(useEventStore.getState().error).toBeNull();
	});

	it("sends notification when reaching FREE_PARTICIPANT_LIMIT with free host", async () => {
		jest.resetModules();
		jest.mock("@/lib/subscription", () => ({
			SUBSCRIPTIONS_ENABLED: true,
		}));

		const { useEventStore } = require("@/store/eventStore");
		const { sendParticipantLimitNotification } = require("@/lib/notifications");

		setupJoinEventMocks({
			existingParticipant: false,
			currentCount: FREE_PARTICIPANT_LIMIT - 1,
			hostUserId: "host-free",
			hostSubscriptionTier: "free",
		});

		const result = await useEventStore.getState().joinEvent("evt-notify", "user-new");

		expect(result).toBe(true);
		expect(sendParticipantLimitNotification).toHaveBeenCalledWith(
			"evt-notify",
			"Test Event",
			"host-free"
		);
	});
});
