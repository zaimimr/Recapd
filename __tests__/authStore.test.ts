jest.mock("@/lib/supabase", () => {
	const buildChain = (finalValue: any = { data: null, error: null }): any => {
		const chain: any = {};
		const methods = ["select", "insert", "update", "delete", "eq", "single"];
		methods.forEach((m) => {
			chain[m] = jest.fn().mockReturnValue(chain);
		});
		// biome-ignore lint/suspicious/noThenProperty: mock must be thenable to simulate Supabase query builder
		chain.then = (resolve: any) => resolve(finalValue);
		Object.defineProperty(chain, "data", { get: () => finalValue.data });
		Object.defineProperty(chain, "error", { get: () => finalValue.error });
		return chain;
	};
	return {
		buildChain,
		supabase: {
			from: jest.fn().mockReturnValue(buildChain()),
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

jest.mock("expo-secure-store", () => ({
	getItemAsync: jest.fn().mockResolvedValue(null),
	setItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-application", () => ({
	getIosIdForVendorAsync: jest.fn().mockResolvedValue("ios-vendor-id-123"),
	getAndroidId: jest.fn().mockReturnValue("android-id-123"),
}));

jest.mock("expo-crypto", () => ({
	getRandomBytesAsync: jest.fn().mockResolvedValue(new Uint8Array(16).fill(0xab)),
}));

jest.mock("react-native", () => ({
	Platform: { OS: "ios" },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "@/store/authStore";

const { supabase, buildChain } = require("@/lib/supabase");
const SecureStore = require("expo-secure-store");
const Application = require("expo-application");

const mockUser = {
	id: "user-1",
	display_name: "Test User",
	device_id: "ios-vendor-id-123",
	push_token: null,
	created_at: "2024-01-01T00:00:00Z",
	last_seen_at: "2024-01-01T00:00:00Z",
	subscription_tier: "free",
	subscription_expires_at: null,
	subscription_platform: null,
	subscription_id: null,
};

beforeEach(() => {
	useAuthStore.setState({
		user: null,
		isLoading: false,
		isInitialized: false,
		deviceId: null,
	});
	jest.clearAllMocks();
	supabase.from.mockReturnValue(buildChain());
});

describe("returning user opens the app", () => {
	test("recognizes the user by their device and resumes their session", async () => {
		const selectChain = buildChain({ data: mockUser, error: null });
		const updateChain = buildChain({ data: null, error: null });

		let fromCallCount = 0;
		supabase.from.mockImplementation((table: string) => {
			if (table === "users") {
				fromCallCount++;
				return fromCallCount === 1 ? selectChain : updateChain;
			}
			return buildChain();
		});

		await useAuthStore.getState().initializeAuth();

		const state = useAuthStore.getState();
		expect(state.user).toEqual(mockUser);
		expect(state.isInitialized).toBe(true);
		expect(state.isLoading).toBe(false);
	});

	test("updates the user's last seen timestamp", async () => {
		const selectChain = buildChain({ data: mockUser, error: null });
		const updateChain = buildChain({ data: null, error: null });

		let fromCallCount = 0;
		supabase.from.mockImplementation((table: string) => {
			if (table === "users") {
				fromCallCount++;
				return fromCallCount === 1 ? selectChain : updateChain;
			}
			return buildChain();
		});

		await useAuthStore.getState().initializeAuth();

		expect(supabase.from).toHaveBeenCalledWith("users");
		expect(updateChain.update).toHaveBeenCalledWith(
			expect.objectContaining({ last_seen_at: expect.any(String) })
		);
	});

	test("still initializes when last_seen_at update fails", async () => {
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		const selectChain = buildChain({ data: mockUser, error: null });
		const updateChain = buildChain({ data: null, error: { message: "DB error" } });

		let fromCallCount = 0;
		supabase.from.mockImplementation((table: string) => {
			if (table === "users") {
				fromCallCount++;
				return fromCallCount === 1 ? selectChain : updateChain;
			}
			return buildChain();
		});

		await useAuthStore.getState().initializeAuth();

		expect(useAuthStore.getState().user).toEqual(mockUser);
		expect(useAuthStore.getState().isInitialized).toBe(true);
		consoleSpy.mockRestore();
	});
});

describe("first-time user opens the app", () => {
	test("initializes without a user session", async () => {
		supabase.from.mockReturnValue(buildChain({ data: null, error: null }));

		await useAuthStore.getState().initializeAuth();

		const state = useAuthStore.getState();
		expect(state.user).toBeNull();
		expect(state.isInitialized).toBe(true);
		expect(state.isLoading).toBe(false);
	});

	test("app remains usable even when database is unreachable", async () => {
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		supabase.from.mockReturnValue(buildChain({ data: null, error: { message: "DB error" } }));

		await useAuthStore.getState().initializeAuth();

		const state = useAuthStore.getState();
		expect(state.isInitialized).toBe(true);
		expect(state.isLoading).toBe(false);
		consoleSpy.mockRestore();
	});
});

describe("device identity persistence", () => {
	test("prefers SecureStore for device ID (survives reinstall)", async () => {
		SecureStore.getItemAsync.mockResolvedValue("secure-device-id");
		supabase.from.mockReturnValue(buildChain({ data: null, error: null }));

		await useAuthStore.getState().initializeAuth();

		expect(useAuthStore.getState().deviceId).toBe("secure-device-id");
	});

	test("falls back to AsyncStorage when SecureStore is empty", async () => {
		SecureStore.getItemAsync.mockResolvedValue(null);
		(AsyncStorage.getItem as jest.Mock).mockResolvedValue("async-device-id");
		supabase.from.mockReturnValue(buildChain({ data: null, error: null }));

		await useAuthStore.getState().initializeAuth();

		expect(useAuthStore.getState().deviceId).toBe("async-device-id");
	});

	test("generates an iOS vendor ID when no stored ID exists", async () => {
		SecureStore.getItemAsync.mockResolvedValue(null);
		(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
		Application.getIosIdForVendorAsync.mockResolvedValue("new-ios-id");
		supabase.from.mockReturnValue(buildChain({ data: null, error: null }));

		await useAuthStore.getState().initializeAuth();

		expect(useAuthStore.getState().deviceId).toBe("new-ios-id");
		expect(SecureStore.setItemAsync).toHaveBeenCalledWith("recapd_device_id", "new-ios-id");
	});
});

describe("creating a new account", () => {
	test("user provides a valid name and gets an account", async () => {
		const insertChain = buildChain({
			data: { ...mockUser, display_name: "Alice" },
			error: null,
		});
		supabase.from.mockReturnValue(insertChain);

		const result = await useAuthStore.getState().createUser("Alice");

		expect(result).toBeTruthy();
		expect(result?.display_name).toBe("Alice");
		expect(useAuthStore.getState().user?.display_name).toBe("Alice");
		expect(useAuthStore.getState().isLoading).toBe(false);
	});

	test("trims whitespace from the display name", async () => {
		const insertChain = buildChain({
			data: { ...mockUser, display_name: "Alice" },
			error: null,
		});
		supabase.from.mockReturnValue(insertChain);

		const result = await useAuthStore.getState().createUser("  Alice  ");

		expect(result).toBeTruthy();
	});

	test("rejects names shorter than 2 characters", async () => {
		const result = await useAuthStore.getState().createUser("A");

		expect(result).toBeNull();
		expect(useAuthStore.getState().isLoading).toBe(false);
		expect(supabase.from).not.toHaveBeenCalled();
	});

	test("rejects names longer than 30 characters", async () => {
		const result = await useAuthStore.getState().createUser("A".repeat(31));

		expect(result).toBeNull();
		expect(useAuthStore.getState().isLoading).toBe(false);
	});

	test("rejects whitespace-only names", async () => {
		const result = await useAuthStore.getState().createUser("   ");

		expect(result).toBeNull();
	});

	test("accepts boundary names (exactly 2 and 30 characters)", async () => {
		const shortChain = buildChain({
			data: { ...mockUser, display_name: "AB" },
			error: null,
		});
		supabase.from.mockReturnValue(shortChain);
		expect(await useAuthStore.getState().createUser("AB")).toBeTruthy();

		const longName = "A".repeat(30);
		const longChain = buildChain({
			data: { ...mockUser, display_name: longName },
			error: null,
		});
		supabase.from.mockReturnValue(longChain);
		expect(await useAuthStore.getState().createUser(longName)).toBeTruthy();
	});

	test("handles database failure gracefully", async () => {
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		const errorChain = buildChain({
			data: null,
			error: { message: "Duplicate device_id" },
		});
		supabase.from.mockReturnValue(errorChain);

		const result = await useAuthStore.getState().createUser("Alice");

		expect(result).toBeNull();
		expect(useAuthStore.getState().isLoading).toBe(false);
		consoleSpy.mockRestore();
	});
});

describe("changing display name", () => {
	beforeEach(() => {
		useAuthStore.setState({ user: mockUser });
	});

	test("updates the name in both database and local state", async () => {
		const updateChain = buildChain({ data: null, error: null });
		supabase.from.mockReturnValue(updateChain);

		const result = await useAuthStore.getState().updateDisplayName("New Name");

		expect(result).toBe(true);
		expect(useAuthStore.getState().user?.display_name).toBe("New Name");
	});

	test("cannot change name without being logged in", async () => {
		useAuthStore.setState({ user: null });

		const result = await useAuthStore.getState().updateDisplayName("New Name");

		expect(result).toBe(false);
	});

	test("reverts local state if database update fails", async () => {
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		const errorChain = buildChain({ data: null, error: { message: "DB error" } });
		supabase.from.mockReturnValue(errorChain);

		const result = await useAuthStore.getState().updateDisplayName("New Name");

		expect(result).toBe(false);
		expect(useAuthStore.getState().user?.display_name).toBe("Test User");
		consoleSpy.mockRestore();
	});
});

describe("logging out", () => {
	test("clears user session and requires re-initialization", async () => {
		useAuthStore.setState({ user: mockUser, isInitialized: true });

		await useAuthStore.getState().logout();

		expect(useAuthStore.getState().user).toBeNull();
		expect(useAuthStore.getState().isInitialized).toBe(false);
	});
});
