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

const mockSupabaseUpsert = jest.fn().mockResolvedValue({ error: null });
const mockSupabaseFrom = jest.fn().mockReturnValue({
	upsert: (...args: unknown[]) => mockSupabaseUpsert(...args),
});

jest.mock("@/lib/supabase", () => ({
	supabase: {
		from: (...args: unknown[]) => mockSupabaseFrom(...args),
	},
}));

beforeEach(() => {
	jest.clearAllMocks();
	mockSupabaseUpsert.mockResolvedValue({ error: null });
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
		const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		mockGetPermissionsAsync.mockResolvedValue({ status: "denied" });
		mockRequestPermissionsAsync.mockResolvedValue({ status: "denied" });

		const { registerForPushNotifications } = require("@/lib/notifications");
		const token = await registerForPushNotifications();

		expect(token).toBeNull();
		consoleSpy.mockRestore();
	});

	test("returns null on simulators/emulators (not physical devices)", async () => {
		jest.resetModules();
		const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		jest.doMock("expo-device", () => ({ isDevice: false }));

		const { registerForPushNotifications } = require("@/lib/notifications");
		const token = await registerForPushNotifications();

		expect(token).toBeNull();
		consoleSpy.mockRestore();
		jest.doMock("expo-device", () => ({ isDevice: true }));
	});
});

describe("saving a push token to private user data", () => {
	test("persists the token in the database for later use", async () => {
		jest.resetModules();
		const { savePushToken } = require("@/lib/notifications");

		await savePushToken("user-1", "ExponentPushToken[abc]");

		expect(mockSupabaseFrom).toHaveBeenCalledWith("user_private_data");
		expect(mockSupabaseUpsert).toHaveBeenCalledWith(
			{
				user_id: "user-1",
				push_token: "ExponentPushToken[abc]",
			},
			{ onConflict: "user_id" }
		);
	});

	test("logs an error but does not throw if save fails", async () => {
		jest.resetModules();
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		mockSupabaseUpsert.mockResolvedValueOnce({ error: { message: "Save failed" } });

		const { savePushToken } = require("@/lib/notifications");
		await savePushToken("user-1", "ExponentPushToken[abc]");

		expect(consoleSpy).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});
});
