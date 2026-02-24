const mockSetNotificationHandler = jest.fn();
const mockAddNotificationResponseReceivedListener = jest
	.fn()
	.mockReturnValue({ remove: jest.fn() });
const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockSetNotificationChannelAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();

jest.mock("expo-notifications", () => ({
	setNotificationHandler: (...args: unknown[]) => mockSetNotificationHandler(...args),
	addNotificationResponseReceivedListener: (...args: unknown[]) =>
		mockAddNotificationResponseReceivedListener(...args),
	getPermissionsAsync: () => mockGetPermissionsAsync(),
	requestPermissionsAsync: () => mockRequestPermissionsAsync(),
	setNotificationChannelAsync: (...args: unknown[]) => mockSetNotificationChannelAsync(...args),
	getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushTokenAsync(...args),
	AndroidImportance: { MAX: 5 },
}));

jest.mock("expo-device", () => ({
	isDevice: true,
}));

jest.mock("expo-constants", () => ({
	__esModule: true,
	default: {
		expoConfig: {
			extra: {
				eas: { projectId: "test-project-id" },
			},
		},
	},
}));

jest.mock("react-native", () => ({
	Platform: { OS: "ios" },
}));

const mockRouterPush = jest.fn();
jest.mock("expo-router", () => ({
	router: { push: (...args: unknown[]) => mockRouterPush(...args) },
}));

const mockSupabaseEq = jest.fn().mockResolvedValue({ error: null });
const mockSupabaseUpdate = jest.fn().mockReturnValue({ eq: mockSupabaseEq });
const mockSupabaseSelect = jest.fn().mockReturnValue({
	eq: jest.fn().mockReturnValue({
		// biome-ignore lint/suspicious/noThenProperty: mock
		then: (resolve: any) => resolve({ data: [], error: null }),
		data: [],
		error: null,
	}),
});
const mockSupabaseFrom = jest.fn().mockReturnValue({
	update: mockSupabaseUpdate,
	select: mockSupabaseSelect,
});

jest.mock("@/lib/supabase", () => ({
	supabase: {
		from: (...args: unknown[]) => mockSupabaseFrom(...args),
	},
}));

beforeEach(() => {
	jest.clearAllMocks();
});

describe("notification handler is set up once on app launch", () => {
	test("configures how notifications appear when the app is in the foreground", () => {
		jest.resetModules();
		const { setupNotificationHandler } = require("@/lib/notifications");

		setupNotificationHandler();

		expect(mockSetNotificationHandler).toHaveBeenCalledWith(
			expect.objectContaining({
				handleNotification: expect.any(Function),
			})
		);
	});

	test("shows alerts and plays sounds for foreground notifications", async () => {
		jest.resetModules();
		const { setupNotificationHandler } = require("@/lib/notifications");

		setupNotificationHandler();

		const handlerConfig = mockSetNotificationHandler.mock.calls[0][0];
		const result = await handlerConfig.handleNotification();

		expect(result.shouldShowAlert).toBe(true);
		expect(result.shouldPlaySound).toBe(true);
		expect(result.shouldSetBadge).toBe(false);
	});

	test("listens for notification taps to navigate users", () => {
		jest.resetModules();
		const { setupNotificationHandler } = require("@/lib/notifications");

		setupNotificationHandler();

		expect(mockAddNotificationResponseReceivedListener).toHaveBeenCalled();
	});

	test("only configures once even if called multiple times", () => {
		jest.resetModules();
		const { setupNotificationHandler } = require("@/lib/notifications");

		setupNotificationHandler();
		setupNotificationHandler();

		expect(mockSetNotificationHandler).toHaveBeenCalledTimes(1);
	});
});

describe("registering a device for push notifications", () => {
	test("returns a push token when permission is already granted", async () => {
		jest.resetModules();
		mockGetPermissionsAsync.mockResolvedValue({ status: "granted" });
		mockGetExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[abc123]" });

		const { registerForPushNotifications } = require("@/lib/notifications");
		const token = await registerForPushNotifications();

		expect(token).toBe("ExponentPushToken[abc123]");
	});

	test("prompts for permission when not previously granted", async () => {
		jest.resetModules();
		mockGetPermissionsAsync.mockResolvedValue({ status: "denied" });
		mockRequestPermissionsAsync.mockResolvedValue({ status: "granted" });
		mockGetExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[abc123]" });

		const { registerForPushNotifications } = require("@/lib/notifications");
		const token = await registerForPushNotifications();

		expect(mockRequestPermissionsAsync).toHaveBeenCalled();
		expect(token).toBe("ExponentPushToken[abc123]");
	});

	test("returns null when the user denies permission", async () => {
		jest.resetModules();
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		mockGetPermissionsAsync.mockResolvedValue({ status: "denied" });
		mockRequestPermissionsAsync.mockResolvedValue({ status: "denied" });

		const { registerForPushNotifications } = require("@/lib/notifications");
		const token = await registerForPushNotifications();

		expect(token).toBeNull();
		consoleSpy.mockRestore();
	});

	test("returns null on simulators/emulators (not physical devices)", async () => {
		jest.resetModules();
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		jest.doMock("expo-device", () => ({ isDevice: false }));

		const { registerForPushNotifications } = require("@/lib/notifications");
		const token = await registerForPushNotifications();

		expect(token).toBeNull();
		consoleSpy.mockRestore();
		jest.doMock("expo-device", () => ({ isDevice: true }));
	});
});

describe("saving a push token to the user profile", () => {
	test("persists the token in the database for later use", async () => {
		jest.resetModules();
		const { savePushToken } = require("@/lib/notifications");

		await savePushToken("user-1", "ExponentPushToken[abc]");

		expect(mockSupabaseFrom).toHaveBeenCalledWith("users");
		expect(mockSupabaseUpdate).toHaveBeenCalledWith({ push_token: "ExponentPushToken[abc]" });
		expect(mockSupabaseEq).toHaveBeenCalledWith("id", "user-1");
	});

	test("logs an error but does not throw if save fails", async () => {
		jest.resetModules();
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		mockSupabaseEq.mockResolvedValueOnce({ error: { message: "Save failed" } });

		const { savePushToken } = require("@/lib/notifications");
		await savePushToken("user-1", "ExponentPushToken[abc]");

		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});
});

describe("sending push notifications via Expo API", () => {
	const mockFetch = jest.fn();
	const originalFetch = global.fetch;

	beforeEach(() => {
		global.fetch = mockFetch;
	});
	afterEach(() => {
		global.fetch = originalFetch;
	});

	test("sends a message to multiple recipients at once", async () => {
		jest.resetModules();
		mockFetch.mockResolvedValue({ ok: true });

		const { sendPushNotification } = require("@/lib/notifications");
		const result = await sendPushNotification(
			["token1", "token2"],
			"New Photo!",
			"Someone added a photo to your event",
			{ eventId: "evt1" }
		);

		expect(result).toBe(true);

		const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(sentBody).toHaveLength(2);
		expect(sentBody[0].to).toBe("token1");
		expect(sentBody[0].title).toBe("New Photo!");
		expect(sentBody[0].body).toBe("Someone added a photo to your event");
		expect(sentBody[0].data.eventId).toBe("evt1");
	});

	test("returns false when the Expo push API rejects the request", async () => {
		jest.resetModules();
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		mockFetch.mockResolvedValue({ ok: false, text: () => Promise.resolve("error") });

		const { sendPushNotification } = require("@/lib/notifications");
		const result = await sendPushNotification(["token1"], "Title", "Body");

		expect(result).toBe(false);
		consoleSpy.mockRestore();
	});

	test("returns false when the network is unavailable", async () => {
		jest.resetModules();
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		mockFetch.mockRejectedValue(new Error("Network error"));

		const { sendPushNotification } = require("@/lib/notifications");
		const result = await sendPushNotification(["token1"], "Title", "Body");

		expect(result).toBe(false);
		consoleSpy.mockRestore();
	});
});

describe("host sends upload reminders to participants", () => {
	const mockFetch = jest.fn();
	const originalFetch = global.fetch;

	beforeEach(() => {
		global.fetch = mockFetch;
		mockFetch.mockResolvedValue({ ok: true });
	});
	afterEach(() => {
		global.fetch = originalFetch;
	});

	test("notifies all participants except the host", async () => {
		jest.resetModules();
		const participants = [
			{ user_id: "user1", users: { push_token: "token1" } },
			{ user_id: "user2", users: { push_token: "token2" } },
			{ user_id: "host1", users: { push_token: "host_token" } },
		];

		const selectChain = {
			eq: jest.fn().mockReturnValue({
				// biome-ignore lint/suspicious/noThenProperty: mock
				then: (resolve: any) => resolve({ data: participants, error: null }),
				data: participants,
				error: null,
			}),
		};
		mockSupabaseFrom.mockReturnValue({ select: jest.fn().mockReturnValue(selectChain) });

		const { sendReminderToParticipants } = require("@/lib/notifications");
		const result = await sendReminderToParticipants("evt1", "My Event", "host1");

		expect(result.success).toBe(true);
		expect(result.sentCount).toBe(2);
	});

	test("succeeds with zero sent when no participants have push tokens", async () => {
		jest.resetModules();
		const participants = [{ user_id: "user1", users: { push_token: null } }];

		const selectChain = {
			eq: jest.fn().mockReturnValue({
				// biome-ignore lint/suspicious/noThenProperty: mock
				then: (resolve: any) => resolve({ data: participants, error: null }),
				data: participants,
				error: null,
			}),
		};
		mockSupabaseFrom.mockReturnValue({ select: jest.fn().mockReturnValue(selectChain) });

		const { sendReminderToParticipants } = require("@/lib/notifications");
		const result = await sendReminderToParticipants("evt1", "My Event");

		expect(result.success).toBe(true);
		expect(result.sentCount).toBe(0);
	});

	test("reports failure when participant data cannot be loaded", async () => {
		jest.resetModules();
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		const selectChain = {
			eq: jest.fn().mockReturnValue({
				// biome-ignore lint/suspicious/noThenProperty: mock
				then: (resolve: any) => resolve({ data: null, error: { message: "DB error" } }),
				data: null,
				error: { message: "DB error" },
			}),
		};
		mockSupabaseFrom.mockReturnValue({ select: jest.fn().mockReturnValue(selectChain) });

		const { sendReminderToParticipants } = require("@/lib/notifications");
		const result = await sendReminderToParticipants("evt1", "My Event");

		expect(result.success).toBe(false);
		expect(result.sentCount).toBe(0);
		consoleSpy.mockRestore();
	});
});

describe("free tier participant limit notification", () => {
	const mockFetch = jest.fn();
	const originalFetch = global.fetch;

	beforeEach(() => {
		global.fetch = mockFetch;
		mockFetch.mockResolvedValue({ ok: true });
	});
	afterEach(() => {
		global.fetch = originalFetch;
	});

	test("notifies the host to upgrade when their event hits 12 participants", async () => {
		jest.resetModules();

		const chain = {
			select: jest.fn().mockReturnValue({
				eq: jest.fn().mockReturnValue({
					single: jest.fn().mockReturnValue({
						// biome-ignore lint/suspicious/noThenProperty: mock
						then: (resolve: any) => resolve({ data: { push_token: "host_token" }, error: null }),
						data: { push_token: "host_token" },
						error: null,
					}),
				}),
			}),
		};
		mockSupabaseFrom.mockReturnValue(chain);

		const { sendParticipantLimitNotification } = require("@/lib/notifications");
		const result = await sendParticipantLimitNotification("evt1", "Party", "host1");

		expect(result).toBe(true);
		const sentBody = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(sentBody[0].title).toBe("Party reached 12 participants");
		expect(sentBody[0].body).toBe("Upgrade to Pro for unlimited participants.");
	});

	test("skips notification when the host has no push token", async () => {
		jest.resetModules();

		const chain = {
			select: jest.fn().mockReturnValue({
				eq: jest.fn().mockReturnValue({
					single: jest.fn().mockReturnValue({
						// biome-ignore lint/suspicious/noThenProperty: mock
						then: (resolve: any) => resolve({ data: { push_token: null }, error: null }),
						data: { push_token: null },
						error: null,
					}),
				}),
			}),
		};
		mockSupabaseFrom.mockReturnValue(chain);

		const { sendParticipantLimitNotification } = require("@/lib/notifications");
		const result = await sendParticipantLimitNotification("evt1", "Party", "host1");

		expect(result).toBe(false);
	});

	test("returns false when host data cannot be loaded", async () => {
		jest.resetModules();

		const chain = {
			select: jest.fn().mockReturnValue({
				eq: jest.fn().mockReturnValue({
					single: jest.fn().mockReturnValue({
						// biome-ignore lint/suspicious/noThenProperty: mock
						then: (resolve: any) => resolve({ data: null, error: { message: "Error" } }),
						data: null,
						error: { message: "Error" },
					}),
				}),
			}),
		};
		mockSupabaseFrom.mockReturnValue(chain);

		const { sendParticipantLimitNotification } = require("@/lib/notifications");
		const result = await sendParticipantLimitNotification("evt1", "Party", "host1");

		expect(result).toBe(false);
	});
});
