jest.mock("@/lib/supabase", () => {
	const buildChain = (finalValue: any = { data: null, error: null }): any => {
		const chain: any = {};
		const methods = [
			"select",
			"insert",
			"update",
			"delete",
			"eq",
			"single",
			"maybeSingle",
			"upsert",
			"is",
		];
		methods.forEach((m) => {
			chain[m] = jest.fn().mockReturnValue(chain);
		});
		// biome-ignore lint/suspicious/noThenProperty: mock must be thenable to simulate Supabase query builder
		chain.then = (resolve: any) => resolve(finalValue);
		Object.defineProperty(chain, "data", { get: () => finalValue.data });
		Object.defineProperty(chain, "error", { get: () => finalValue.error });
		return chain;
	};
	const auth = {
		getSession: jest.fn().mockResolvedValue({
			data: {
				session: {
					user: {
						id: "auth-user-1",
					},
				},
			},
			error: null,
		}),
		signInAnonymously: jest.fn().mockResolvedValue({
			data: {
				session: {
					user: {
						id: "auth-user-1",
					},
				},
			},
			error: null,
		}),
		signOut: jest.fn().mockResolvedValue({ error: null }),
	};
	return {
		buildChain,
		supabase: {
			from: jest.fn().mockReturnValue(buildChain()),
			auth,
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
jest.mock("@/lib/logger", () => ({
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "@/store/authStore";

const { supabase, buildChain } = require("@/lib/supabase");
const SecureStore = require("expo-secure-store");
const Application = require("expo-application");

const mockUser = {
	id: "user-1",
	auth_user_id: "auth-user-1",
	display_name: "Test User",
	created_at: "2024-01-01T00:00:00Z",
	last_seen_at: "2024-01-01T00:00:00Z",
	subscription_tier: "free" as const,
};

beforeEach(() => {
	useAuthStore.setState({
		user: null,
		isLoading: false,
		isInitialized: false,
		deviceId: null,
	});
	jest.clearAllMocks();
	supabase.from.mockReset();
	supabase.from.mockReturnValue(buildChain());
	supabase.auth.getSession.mockResolvedValue({
		data: { session: { user: { id: "auth-user-1" } } },
		error: null,
	});
	supabase.auth.signInAnonymously.mockResolvedValue({
		data: { session: { user: { id: "auth-user-1" } } },
		error: null,
	});
	supabase.auth.signOut.mockResolvedValue({ error: null });
});

describe("returning user opens the app", () => {
	test("recognizes the user by their device and resumes their session", async () => {
		const selectChain = buildChain({ data: mockUser, error: null });
		const updateChain = buildChain({ data: null, error: null });
		const privateUpsertChain = buildChain({ data: null, error: null });

		let fromCallCount = 0;
		supabase.from.mockImplementation((table: string) => {
			if (table === "users") {
				fromCallCount++;
				return fromCallCount === 1 ? selectChain : updateChain;
			}
			if (table === "user_private_data") {
				return privateUpsertChain;
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
		const privateUpsertChain = buildChain({ data: null, error: null });

		let fromCallCount = 0;
		supabase.from.mockImplementation((table: string) => {
			if (table === "users") {
				fromCallCount++;
				return fromCallCount === 1 ? selectChain : updateChain;
			}
			if (table === "user_private_data") {
				return privateUpsertChain;
			}
			return buildChain();
		});

		await useAuthStore.getState().initializeAuth();

		expect(supabase.from).toHaveBeenCalledWith("users");
		expect(updateChain.update).toHaveBeenCalledWith(
			expect.objectContaining({ last_seen_at: expect.any(String) })
		);
		expect(supabase.from).toHaveBeenCalledWith("user_private_data");
	});

	test("still initializes when last_seen_at update fails", async () => {
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		const selectChain = buildChain({ data: mockUser, error: null });
		const updateChain = buildChain({ data: null, error: { message: "DB error" } });
		const privateUpsertChain = buildChain({ data: null, error: null });

		let fromCallCount = 0;
		supabase.from.mockImplementation((table: string) => {
			if (table === "users") {
				fromCallCount++;
				return fromCallCount === 1 ? selectChain : updateChain;
			}
			if (table === "user_private_data") {
				return privateUpsertChain;
			}
			return buildChain();
		});

		await useAuthStore.getState().initializeAuth();

		expect(useAuthStore.getState().user).toEqual(mockUser);
		expect(useAuthStore.getState().isInitialized).toBe(true);
		consoleSpy.mockRestore();
	});

	test("falls back when device_id is already claimed by another row", async () => {
		const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		const selectChain = buildChain({ data: mockUser, error: null });
		const updateChain = buildChain({ data: null, error: null });
		const duplicatePrivateUpsertChain = buildChain({
			data: null,
			error: {
				code: "23505",
				message: 'duplicate key value violates unique constraint "user_private_data_device_id_key"',
			},
		});
		const fallbackPrivateUpsertChain = buildChain({ data: null, error: null });
		let usersCallCount = 0;
		let privateCallCount = 0;

		supabase.from.mockImplementation((table: string) => {
			if (table === "users") {
				usersCallCount += 1;
				return usersCallCount === 1 ? selectChain : updateChain;
			}
			if (table === "user_private_data") {
				privateCallCount += 1;
				return privateCallCount === 1 ? duplicatePrivateUpsertChain : fallbackPrivateUpsertChain;
			}
			return buildChain();
		});

		await useAuthStore.getState().initializeAuth();

		expect(useAuthStore.getState().user).toEqual(mockUser);
		expect(duplicatePrivateUpsertChain.upsert).toHaveBeenCalledWith(
			expect.objectContaining({ user_id: "user-1", device_id: "ios-vendor-id-123" }),
			{ onConflict: "user_id" }
		);
		expect(fallbackPrivateUpsertChain.upsert).toHaveBeenCalledWith(
			expect.objectContaining({ user_id: "user-1" }),
			{ onConflict: "user_id" }
		);
		expect(warnSpy).not.toHaveBeenCalledWith(
			expect.objectContaining({
				message: "Failed to sync private user data during auth init",
			})
		);
		warnSpy.mockRestore();
	});
});

describe("first-time user opens the app", () => {
	test("initializes without a user session", async () => {
		supabase.from.mockReturnValue(buildChain({ data: null, error: null }));
		supabase.auth.getSession.mockResolvedValue({
			data: { session: { user: { id: "auth-user-1" } } },
			error: null,
		});

		await useAuthStore.getState().initializeAuth();

		const state = useAuthStore.getState();
		expect(state.user).toBeNull();
		expect(state.isInitialized).toBe(true);
		expect(state.isLoading).toBe(false);
	});

	test("app remains usable even when database is unreachable", async () => {
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		supabase.from.mockReturnValue(buildChain({ data: null, error: { message: "DB error" } }));
		supabase.auth.getSession.mockResolvedValue({
			data: { session: { user: { id: "auth-user-1" } } },
			error: null,
		});

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
		supabase.auth.getSession.mockResolvedValue({
			data: { session: { user: { id: "auth-user-1" } } },
			error: null,
		});

		await useAuthStore.getState().initializeAuth();

		expect(useAuthStore.getState().deviceId).toBe("secure-device-id");
	});

	test("falls back to AsyncStorage when SecureStore is empty", async () => {
		SecureStore.getItemAsync.mockResolvedValue(null);
		(AsyncStorage.getItem as jest.Mock).mockResolvedValue("async-device-id");
		supabase.from.mockReturnValue(buildChain({ data: null, error: null }));
		supabase.auth.getSession.mockResolvedValue({
			data: { session: { user: { id: "auth-user-1" } } },
			error: null,
		});

		await useAuthStore.getState().initializeAuth();

		expect(useAuthStore.getState().deviceId).toBe("async-device-id");
	});

	test("generates an iOS vendor ID when no stored ID exists", async () => {
		SecureStore.getItemAsync.mockResolvedValue(null);
		(AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
		Application.getIosIdForVendorAsync.mockResolvedValue("new-ios-id");
		supabase.from.mockReturnValue(buildChain({ data: null, error: null }));
		supabase.auth.getSession.mockResolvedValue({
			data: { session: { user: { id: "auth-user-1" } } },
			error: null,
		});

		await useAuthStore.getState().initializeAuth();

		expect(useAuthStore.getState().deviceId).toBe("new-ios-id");
		expect(SecureStore.setItemAsync).toHaveBeenCalledWith("recapd_device_id", "new-ios-id");
	});
});

describe("creating a new account", () => {
	test("user provides a valid name and gets an account", async () => {
		const existingUserChain = buildChain({ data: null, error: null });
		const insertChain = buildChain({ data: null, error: null });
		const createdUserChain = buildChain({
			data: {
				...mockUser,
				id: "user-2",
				display_name: "Alice",
			},
			error: null,
		});
		const privateUpsertChain = buildChain({ data: null, error: null });
		let usersCallCount = 0;
		supabase.from.mockImplementation((table: string) => {
			if (table === "users") {
				usersCallCount += 1;
				if (usersCallCount === 1) return existingUserChain;
				if (usersCallCount === 2) return insertChain;
				return createdUserChain;
			}
			if (table === "user_private_data") {
				return privateUpsertChain;
			}
			return buildChain();
		});

		const result = await useAuthStore.getState().createUser("Alice");

		expect(result).toBeTruthy();
		expect(result?.display_name).toBe("Alice");
		expect(useAuthStore.getState().user?.display_name).toBe("Alice");
		expect(useAuthStore.getState().isLoading).toBe(false);
	});

	test("trims whitespace from the display name", async () => {
		const existingUserChain = buildChain({ data: null, error: null });
		const insertChain = buildChain({ data: null, error: null });
		const createdUserChain = buildChain({
			data: {
				...mockUser,
				id: "user-2",
				display_name: "Alice",
			},
			error: null,
		});
		const privateUpsertChain = buildChain({ data: null, error: null });
		let usersCallCount = 0;
		supabase.from.mockImplementation((table: string) => {
			if (table === "users") {
				usersCallCount += 1;
				if (usersCallCount === 1) return existingUserChain;
				if (usersCallCount === 2) return insertChain;
				return createdUserChain;
			}
			if (table === "user_private_data") {
				return privateUpsertChain;
			}
			return buildChain();
		});

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
		const firstExistingUserChain = buildChain({ data: null, error: null });
		const shortInsertChain = buildChain({ data: null, error: null });
		const shortCreatedUserChain = buildChain({
			data: {
				...mockUser,
				id: "user-2",
				display_name: "AB",
			},
			error: null,
		});
		const shortPrivateUpsertChain = buildChain({ data: null, error: null });
		let shortUsersCallCount = 0;
		supabase.from.mockImplementation((table: string) => {
			if (table === "users") {
				shortUsersCallCount += 1;
				if (shortUsersCallCount === 1) return firstExistingUserChain;
				if (shortUsersCallCount === 2) return shortInsertChain;
				return shortCreatedUserChain;
			}
			if (table === "user_private_data") {
				return shortPrivateUpsertChain;
			}
			return buildChain();
		});
		expect(await useAuthStore.getState().createUser("AB")).toBeTruthy();

		const longName = "A".repeat(30);
		const secondExistingUserChain = buildChain({ data: null, error: null });
		const longInsertChain = buildChain({ data: null, error: null });
		const longCreatedUserChain = buildChain({
			data: {
				...mockUser,
				id: "user-3",
				display_name: longName,
			},
			error: null,
		});
		const longPrivateUpsertChain = buildChain({ data: null, error: null });
		let longUsersCallCount = 0;
		supabase.from.mockImplementation((table: string) => {
			if (table === "users") {
				longUsersCallCount += 1;
				if (longUsersCallCount === 1) return secondExistingUserChain;
				if (longUsersCallCount === 2) return longInsertChain;
				return longCreatedUserChain;
			}
			if (table === "user_private_data") {
				return longPrivateUpsertChain;
			}
			return buildChain();
		});
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
