import type { CustomerInfo } from "react-native-purchases";

process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = "appl_test_ios_key";
process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = "goog_test_android_key";
process.env.EXPO_PUBLIC_SUBSCRIPTIONS_ENABLED = "true";

type TargetPlatform = "ios" | "android";

const PLATFORMS: TargetPlatform[] = ["ios", "android"];

const EXPECTED_KEY: Record<TargetPlatform, string> = {
	ios: "appl_test_ios_key",
	android: "goog_test_android_key",
};

const EXPECTED_STORE_NAME: Record<TargetPlatform, string> = {
	ios: "the App Store",
	android: "Google Play",
};

const mockConfigure = jest.fn();
const mockGetCustomerInfo = jest.fn();
const mockGetOfferings = jest.fn();
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();
const mockAddListener = jest.fn();
const mockRemoveListener = jest.fn();
const mockSetLogLevel = jest.fn();
const mockLogIn = jest.fn();
const mockLogOut = jest.fn();
const mockSetEmail = jest.fn();
const mockSetDisplayName = jest.fn();
const mockPresentPaywall = jest.fn();
const mockPresentPaywallIfNeeded = jest.fn();
const mockPresentCustomerCenter = jest.fn();
const mockAlert = jest.fn();

const mockSupabaseEq = jest.fn();
const mockSupabaseUpdate = jest.fn();
const mockSupabaseUpsert = jest.fn();
const mockSupabaseFrom = jest.fn();

jest.mock("expo-constants", () => ({
	__esModule: true,
	default: { appOwnership: "standalone", executionEnvironment: "bare" },
}));

jest.mock("react-native-purchases", () => ({
	__esModule: true,
	default: {
		configure: (...args: unknown[]) => mockConfigure(...args),
		getCustomerInfo: () => mockGetCustomerInfo(),
		getOfferings: () => mockGetOfferings(),
		purchasePackage: (...args: unknown[]) => mockPurchasePackage(...args),
		restorePurchases: () => mockRestorePurchases(),
		addCustomerInfoUpdateListener: (...args: unknown[]) => mockAddListener(...args),
		removeCustomerInfoUpdateListener: (...args: unknown[]) => mockRemoveListener(...args),
		setLogLevel: (...args: unknown[]) => mockSetLogLevel(...args),
		logIn: (...args: unknown[]) => mockLogIn(...args),
		logOut: () => mockLogOut(),
		setEmail: (...args: unknown[]) => mockSetEmail(...args),
		setDisplayName: (...args: unknown[]) => mockSetDisplayName(...args),
	},
	LOG_LEVEL: { DEBUG: 0 },
	PURCHASES_ERROR_CODE: {
		PURCHASE_CANCELLED_ERROR: "1",
		STORE_PROBLEM_ERROR: "2",
		PURCHASE_NOT_ALLOWED_ERROR: "3",
		PURCHASE_INVALID_ERROR: "4",
		PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: "5",
		RECEIPT_ALREADY_IN_USE_ERROR: "7",
		NETWORK_ERROR: "10",
		CONFIGURATION_ERROR: "23",
		OFFLINE_CONNECTION_ERROR: "35",
	},
}));

jest.mock("react-native-purchases-ui", () => ({
	__esModule: true,
	default: {
		presentPaywall: (...args: unknown[]) => mockPresentPaywall(...args),
		presentPaywallIfNeeded: (...args: unknown[]) => mockPresentPaywallIfNeeded(...args),
		presentCustomerCenter: () => mockPresentCustomerCenter(),
	},
	PAYWALL_RESULT: {
		PURCHASED: "PURCHASED",
		RESTORED: "RESTORED",
		NOT_PRESENTED: "NOT_PRESENTED",
		CANCELLED: "CANCELLED",
		ERROR: "ERROR",
	},
}));

jest.mock("@/lib/supabase", () => ({
	supabase: {
		from: (table: string) => mockSupabaseFrom(table),
	},
}));

const proCustomerInfo = {
	entitlements: {
		active: {
			"Recapd Pro": {
				isActive: true,
				expirationDate: "2026-12-31",
				productIdentifier: "recapd_pro_monthly",
				willRenew: true,
			},
		},
		all: {},
	},
	activeSubscriptions: ["recapd_pro_monthly"],
	originalAppUserId: "user-1",
} as unknown as CustomerInfo;

const freeCustomerInfo = {
	entitlements: { active: {}, all: {} },
	activeSubscriptions: [],
	originalAppUserId: "user-1",
} as unknown as CustomerInfo;

const monthlyPackage = {
	identifier: "$rc_monthly",
	product: { identifier: "recapd_pro_monthly", priceString: "$2.99", price: 2.99 },
} as any;

const yearlyPackage = {
	identifier: "$rc_annual",
	product: { identifier: "recapd_pro_yearly", priceString: "$29.99", price: 29.99 },
} as any;

const offering = {
	identifier: "default",
	monthly: monthlyPackage,
	annual: yearlyPackage,
	availablePackages: [monthlyPackage, yearlyPackage],
} as any;

function purchasesError(code: string, message: string, extra: Record<string, unknown> = {}) {
	return Object.assign(new Error(message), { code, ...extra });
}

/**
 * Loads the billing modules with the platform mocked, so the same journey can be
 * asserted on iOS and on Android.
 */
function loadForPlatform(platform: TargetPlatform) {
	jest.resetModules();
	jest.clearAllMocks();

	mockSupabaseEq.mockResolvedValue({ error: null });
	mockSupabaseUpdate.mockReturnValue({ eq: mockSupabaseEq });
	mockSupabaseUpsert.mockResolvedValue({ error: null });
	mockSupabaseFrom.mockImplementation((table: string) => {
		if (table === "users") return { update: mockSupabaseUpdate };
		if (table === "user_private_data") return { upsert: mockSupabaseUpsert };
		return {};
	});

	jest.doMock("react-native", () => ({
		Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
		Platform: { OS: platform },
	}));

	const subscription = require("@/lib/subscription") as typeof import("@/lib/subscription");
	const store = require("@/store/subscriptionStore") as typeof import("@/store/subscriptionStore");
	const paywallErrors =
		require("@/lib/billing/paywallErrors") as typeof import("@/lib/billing/paywallErrors");

	return { subscription, store: store.useSubscriptionStore, paywallErrors };
}

async function initializedStore(platform: TargetPlatform, customerInfo = freeCustomerInfo) {
	const loaded = loadForPlatform(platform);
	mockConfigure.mockResolvedValue(undefined);
	mockGetCustomerInfo.mockResolvedValue(customerInfo);
	mockGetOfferings.mockResolvedValue({ current: offering, all: { default: offering } });
	await loaded.store.getState().initialize("user-1");
	return loaded;
}

describe.each(PLATFORMS)("payment flow on %s", (platform) => {
	describe("configuration", () => {
		it("configures RevenueCat with the key for this platform", async () => {
			const { subscription } = loadForPlatform(platform);
			mockConfigure.mockResolvedValue(undefined);

			const configured = await subscription.configureRevenueCat("user-1");

			expect(configured).toBe(true);
			expect(mockConfigure).toHaveBeenCalledWith({
				apiKey: EXPECTED_KEY[platform],
				appUserID: "user-1",
			});
		});

		it("reports a missing key for this platform instead of throwing", async () => {
			const iosKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
			const androidKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
			process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = "";
			process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = "";

			const { subscription } = loadForPlatform(platform);
			const configured = await subscription.configureRevenueCat("user-1");

			expect(configured).toBe(false);
			expect(subscription.getLastRevenueCatError()).toBe(
				`Missing RevenueCat API key for ${platform}`
			);

			process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = iosKey;
			process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = androidKey;
		});

		it("surfaces a configure failure without crashing the store", async () => {
			const { subscription, store } = loadForPlatform(platform);
			mockConfigure.mockRejectedValue(new Error("SDK exploded"));

			await store.getState().initialize("user-1");

			expect(store.getState().error).toBe("SDK exploded");
			expect(store.getState().isPro).toBe(false);
			expect(subscription.isRevenueCatConfigured()).toBe(false);
		});

		it("keeps the user id even when initialize bails out early", async () => {
			const { store } = loadForPlatform(platform);
			store.setState({ isLoading: true });

			await store.getState().initialize("user-1");

			expect(store.getState().userId).toBe("user-1");
		});
	});

	describe("offerings", () => {
		it("loads the current offering with both packages", async () => {
			const { store } = await initializedStore(platform);

			const offerings = store.getState().offerings;
			expect(offerings?.identifier).toBe("default");
			expect(offerings?.availablePackages).toHaveLength(2);
			expect(store.getState().getMonthlyPackage()?.product.identifier).toBe("recapd_pro_monthly");
			expect(store.getState().getYearlyPackage()?.product.identifier).toBe("recapd_pro_yearly");
		});

		it("records the reason when the store cannot return products", async () => {
			const { subscription, store } = loadForPlatform(platform);
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo.mockResolvedValue(freeCustomerInfo);
			mockGetOfferings.mockRejectedValue(
				purchasesError("23", "None of the products registered could be fetched")
			);

			await store.getState().initialize("user-1");

			expect(store.getState().offerings).toBeNull();
			expect(subscription.getLastRevenueCatError()).toContain("None of the products registered");
		});
	});

	describe("purchasing", () => {
		it("grants Pro locally and writes only the platform to the database", async () => {
			const { store } = await initializedStore(platform);
			mockPurchasePackage.mockResolvedValue({ customerInfo: proCustomerInfo });

			const result = await store.getState().purchase(monthlyPackage);

			expect(result.success).toBe(true);
			expect(store.getState().isPro).toBe(true);
			expect(store.getState().planId).toBe("pro");
			expect(mockSupabaseUpdate).not.toHaveBeenCalledWith({ subscription_tier: "pro" });
			expect(mockSupabaseUpsert).toHaveBeenCalledWith(
				expect.objectContaining({ subscription_platform: platform }),
				{ onConflict: "user_id" }
			);
		});

		it("treats a cancelled purchase as a non-error", async () => {
			const { store } = await initializedStore(platform);
			mockPurchasePackage.mockRejectedValue(
				Object.assign(new Error("cancelled"), { userCancelled: true })
			);

			const result = await store.getState().purchase(monthlyPackage);

			expect(result.userCancelled).toBe(true);
			expect(store.getState().isPro).toBe(false);
			expect(store.getState().error).toBeNull();
		});

		it.each([
			["3", "Purchases are not allowed on this device"],
			["4", "Invalid purchase"],
			["5", "Product not available for purchase"],
			["10", "Network error. Please check your connection"],
			["7", "This purchase is already associated with another account"],
		])("maps store error code %s to a readable message", async (code, expected) => {
			const { store } = await initializedStore(platform);
			mockPurchasePackage.mockRejectedValue(purchasesError(code, "raw sdk text"));

			const result = await store.getState().purchase(monthlyPackage);

			expect(result.success).toBe(false);
			expect(result.error).toBe(expected);
			expect(store.getState().isPro).toBe(false);
		});

		it("does not grant Pro when the entitlement identifier does not match", async () => {
			const { store } = await initializedStore(platform);
			mockPurchasePackage.mockResolvedValue({
				customerInfo: {
					entitlements: {
						active: { wrong_id: { isActive: true, productIdentifier: "recapd_pro_monthly" } },
						all: {},
					},
					activeSubscriptions: ["recapd_pro_monthly"],
					originalAppUserId: "user-1",
				} as unknown as CustomerInfo,
			});

			await store.getState().purchase(monthlyPackage);

			expect(store.getState().isPro).toBe(false);
		});
	});

	describe("restoring", () => {
		it("restores an active subscription", async () => {
			const { store } = await initializedStore(platform);
			mockRestorePurchases.mockResolvedValue(proCustomerInfo);

			const result = await store.getState().restore();

			expect(result.success).toBe(true);
			expect(store.getState().isPro).toBe(true);
		});

		it("reports when there is nothing to restore", async () => {
			const { store } = await initializedStore(platform);
			mockRestorePurchases.mockResolvedValue(freeCustomerInfo);

			const result = await store.getState().restore();

			expect(result.success).toBe(false);
			expect(result.error).toBe("No active subscriptions found");
			expect(store.getState().isPro).toBe(false);
		});

		it("does not surface an error when the user cancels the restore", async () => {
			const { store } = await initializedStore(platform);
			mockRestorePurchases.mockRejectedValue(
				Object.assign(new Error("cancelled"), { userCancelled: true })
			);

			const result = await store.getState().restore();

			expect(result.userCancelled).toBe(true);
			expect(store.getState().error).toBeNull();
		});
	});

	describe("paywall", () => {
		it("passes the resolved offering to the RevenueCat paywall", async () => {
			const { store } = await initializedStore(platform);
			mockPresentPaywall.mockResolvedValue("CANCELLED");

			await store.getState().showPaywall();

			expect(mockPresentPaywall).toHaveBeenCalledWith(
				expect.objectContaining({ offering: expect.objectContaining({ identifier: "default" }) })
			);
		});

		it("grants Pro after a purchase made inside the paywall", async () => {
			const { store } = await initializedStore(platform);
			mockPresentPaywall.mockResolvedValue("PURCHASED");
			mockGetCustomerInfo.mockResolvedValue(proCustomerInfo);

			const purchased = await store.getState().showPaywall();

			expect(purchased).toBe(true);
			expect(store.getState().isPro).toBe(true);
			expect(mockSupabaseUpdate).not.toHaveBeenCalledWith({ subscription_tier: "pro" });
		});

		it("names this platform's store when the store fails", async () => {
			const { store } = await initializedStore(platform);
			mockPresentPaywall.mockRejectedValue(
				purchasesError("2", "There was a problem with the store.")
			);

			const shown = await store.getState().showPaywall();

			expect(shown).toBe(false);
			expect(mockAlert).toHaveBeenCalledWith(
				"Store unavailable",
				expect.stringContaining(EXPECTED_STORE_NAME[platform]),
				expect.arrayContaining([expect.objectContaining({ text: "Try again" })])
			);
		});

		it("offers no retry when purchases are disabled on the device", async () => {
			const { store } = await initializedStore(platform);
			mockPresentPaywall.mockRejectedValue(
				purchasesError("3", "The device or user is not allowed to make the purchase.")
			);

			await store.getState().showPaywall();

			expect(mockAlert).toHaveBeenCalledWith("Purchases are turned off", expect.any(String));
		});

		it("explains an offline failure", async () => {
			const { store } = await initializedStore(platform);
			mockPresentPaywall.mockRejectedValue(purchasesError("35", "offline"));

			await store.getState().showPaywall();

			expect(mockAlert).toHaveBeenCalledWith(
				"You look offline",
				expect.any(String),
				expect.any(Array)
			);
		});

		it("explains an empty catalog", async () => {
			const { store } = await initializedStore(platform);
			mockPresentPaywall.mockRejectedValue(
				purchasesError("23", "None of the products registered could be fetched")
			);

			await store.getState().showPaywall();

			expect(mockAlert).toHaveBeenCalledWith(
				"Plans are not ready",
				expect.stringContaining(EXPECTED_STORE_NAME[platform]),
				expect.any(Array)
			);
		});

		it("never shows the paywall to someone who is already Pro", async () => {
			const { store } = await initializedStore(platform, proCustomerInfo);

			const shown = await store.getState().showPaywallIfNeeded();

			expect(shown).toBe(false);
			expect(mockPresentPaywallIfNeeded).not.toHaveBeenCalled();
		});
	});

	describe("account without a profile", () => {
		it("explains itself instead of failing silently", async () => {
			const { store } = loadForPlatform(platform);
			store.setState({ userId: null });

			const shown = await store.getState().showPaywall();

			expect(shown).toBe(false);
			expect(mockConfigure).not.toHaveBeenCalled();
			expect(mockAlert).toHaveBeenCalledWith(
				"Pro is unavailable",
				expect.any(String),
				expect.any(Array)
			);
		});

		it("configures from the auth store once a profile exists", async () => {
			jest.resetModules();
			jest.doMock("@/store/authStore", () => ({
				useAuthStore: { getState: () => ({ user: { id: "profile-created" } }) },
			}));

			const { store } = loadForPlatform(platform);
			jest.doMock("@/store/authStore", () => ({
				useAuthStore: { getState: () => ({ user: { id: "profile-created" } }) },
			}));
			mockConfigure.mockResolvedValue(undefined);
			mockPresentPaywall.mockResolvedValue("CANCELLED");
			store.setState({ userId: null });

			await store.getState().showPaywall();

			expect(mockConfigure).toHaveBeenCalledWith(
				expect.objectContaining({ appUserID: "profile-created" })
			);
			expect(store.getState().userId).toBe("profile-created");

			jest.dontMock("@/store/authStore");
		});
	});

	describe("entitlement truth", () => {
		it("reads status from the entitlement, not the raw subscription list", async () => {
			const { subscription } = loadForPlatform(platform);

			const status = subscription.getSubscriptionStatus(proCustomerInfo, "Recapd Pro");

			expect(status.isActive).toBe(true);
			expect(status.productId).toBe("recapd_pro_monthly");
			expect(status.willRenew).toBe(true);
			expect(status.expiresAt).toEqual(new Date("2026-12-31"));
		});

		it("falls back to the default entitlement id when none is configured", async () => {
			const { subscription } = loadForPlatform(platform);

			expect(subscription.checkProEntitlement(proCustomerInfo, null)).toBe(true);
			expect(subscription.checkProEntitlement(freeCustomerInfo, null)).toBe(false);
		});
	});
});

describe("payment failure classification", () => {
	const { classifyPaywallFailure, describePaywallFailure } =
		require("@/lib/billing/paywallErrors") as typeof import("@/lib/billing/paywallErrors");

	it.each([
		["2", "store_problem"],
		["3", "purchases_disabled"],
		["5", "no_plans"],
		["10", "network"],
		["23", "no_plans"],
		["35", "network"],
		["NOT_CONFIGURED", "not_configured"],
	])("maps code %s to %s", (code, reason) => {
		expect(classifyPaywallFailure(code, "")).toBe(reason);
	});

	it("keeps store names platform specific", () => {
		expect(describePaywallFailure("store_problem", "ios").message).toContain("the App Store");
		expect(describePaywallFailure("store_problem", "android").message).toContain("Google Play");
		expect(describePaywallFailure("no_plans", "ios").message).toContain("the App Store");
		expect(describePaywallFailure("no_plans", "android").message).toContain("Google Play");
	});
});
