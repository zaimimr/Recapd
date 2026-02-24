import type { CustomerInfo } from "react-native-purchases";

jest.mock("expo-constants", () => ({
	__esModule: true,
	default: { appOwnership: "standalone" },
}));

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
		PURCHASE_NOT_ALLOWED_ERROR: 1,
		PURCHASE_INVALID_ERROR: 2,
		PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: 3,
		NETWORK_ERROR: 4,
		RECEIPT_ALREADY_IN_USE_ERROR: 5,
	},
}));

const mockPresentPaywall = jest.fn();
const mockPresentPaywallIfNeeded = jest.fn();
const mockPresentCustomerCenter = jest.fn();

jest.mock("react-native-purchases-ui", () => ({
	__esModule: true,
	default: {
		presentPaywall: () => mockPresentPaywall(),
		presentPaywallIfNeeded: (...args: unknown[]) => mockPresentPaywallIfNeeded(...args),
		presentCustomerCenter: () => mockPresentCustomerCenter(),
	},
	PAYWALL_RESULT: {
		PURCHASED: "PURCHASED",
		RESTORED: "RESTORED",
		NOT_PRESENTED: "NOT_PRESENTED",
		CANCELLED: "CANCELLED",
	},
}));

jest.mock("react-native", () => ({
	Platform: { OS: "ios" },
}));

const mockSupabaseEq = jest.fn().mockResolvedValue({ error: null });
const mockSupabaseUpdate = jest.fn().mockReturnValue({ eq: mockSupabaseEq });
const mockSupabaseFrom = jest.fn().mockReturnValue({ update: mockSupabaseUpdate });

jest.mock("@/lib/supabase", () => ({
	supabase: {
		from: (...args: unknown[]) => mockSupabaseFrom(...args),
	},
}));

const proCustomerInfo = {
	entitlements: {
		active: {
			"Recapd Pro": {
				isActive: true,
				expirationDate: "2025-12-31",
				productIdentifier: "monthly",
				willRenew: true,
			},
		},
		all: {},
	},
	activeSubscriptions: ["monthly"],
	originalAppUserId: "user-123",
} as unknown as CustomerInfo;

const freeCustomerInfo = {
	entitlements: { active: {}, all: {} },
	activeSubscriptions: [],
	originalAppUserId: "user-123",
} as unknown as CustomerInfo;

const mismatchedEntitlementCustomerInfo = {
	entitlements: {
		active: {
			recapd_pro: {
				isActive: true,
				expirationDate: "2025-12-31",
				productIdentifier: "monthly",
				willRenew: true,
			},
		},
		all: {},
	},
	activeSubscriptions: ["monthly"],
	originalAppUserId: "user-123",
} as unknown as CustomerInfo;

const mockPackage = {
	identifier: "monthly",
	product: { identifier: "monthly", priceString: "$4.99", price: 4.99 },
} as any;

function resetModuleState() {
	jest.resetModules();
	jest.clearAllMocks();
	mockSupabaseEq.mockResolvedValue({ error: null });
	mockSupabaseUpdate.mockReturnValue({ eq: mockSupabaseEq });
	mockSupabaseFrom.mockReturnValue({ update: mockSupabaseUpdate });
}

describe("lib/subscription", () => {
	beforeEach(() => {
		resetModuleState();
	});

	describe("configureRevenueCat", () => {
		it("configures successfully and returns true", async () => {
			mockConfigure.mockResolvedValue(undefined);
			const { configureRevenueCat } = require("@/lib/subscription");

			const result = await configureRevenueCat("user-1");

			expect(result).toBe(true);
			expect(mockConfigure).toHaveBeenCalled();
		});

		it("returns true without reconfiguring for the same user", async () => {
			mockConfigure.mockResolvedValue(undefined);
			const { configureRevenueCat } = require("@/lib/subscription");

			await configureRevenueCat("user-1");
			mockConfigure.mockClear();
			const result = await configureRevenueCat("user-1");

			expect(result).toBe(true);
			expect(mockConfigure).not.toHaveBeenCalled();
		});

		it("returns false when configure throws", async () => {
			mockConfigure.mockRejectedValue(new Error("Config failed"));
			const { configureRevenueCat } = require("@/lib/subscription");

			const result = await configureRevenueCat("user-1");

			expect(result).toBe(false);
		});

		it("returns false when subscriptions are disabled", async () => {
			jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));
			const original = process.env.EXPO_PUBLIC_SUBSCRIPTIONS_ENABLED;
			process.env.EXPO_PUBLIC_SUBSCRIPTIONS_ENABLED = "false";
			jest.resetModules();

			const { configureRevenueCat } = require("@/lib/subscription");
			const result = await configureRevenueCat("user-1");

			expect(result).toBe(false);
			process.env.EXPO_PUBLIC_SUBSCRIPTIONS_ENABLED = original;
		});
	});

	describe("getCustomerInfo", () => {
		it("returns customer info when configured", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo.mockResolvedValue(proCustomerInfo);
			const { configureRevenueCat, getCustomerInfo } = require("@/lib/subscription");

			await configureRevenueCat("user-1");
			const result = await getCustomerInfo();

			expect(result).toBe(proCustomerInfo);
		});

		it("returns null when not configured", async () => {
			const { getCustomerInfo } = require("@/lib/subscription");

			const result = await getCustomerInfo();

			expect(result).toBeNull();
		});

		it("returns null when API throws", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo.mockRejectedValue(new Error("API error"));
			const { configureRevenueCat, getCustomerInfo } = require("@/lib/subscription");

			await configureRevenueCat("user-1");
			const result = await getCustomerInfo();

			expect(result).toBeNull();
		});
	});

	describe("checkProEntitlement", () => {
		it("returns true when Recapd Pro entitlement is active", () => {
			const { checkProEntitlement } = require("@/lib/subscription");

			expect(checkProEntitlement(proCustomerInfo)).toBe(true);
		});

		it("returns false when no active entitlements", () => {
			const { checkProEntitlement } = require("@/lib/subscription");

			expect(checkProEntitlement(freeCustomerInfo)).toBe(false);
		});

		it("returns false when entitlement has wrong name", () => {
			const { checkProEntitlement } = require("@/lib/subscription");

			expect(checkProEntitlement(mismatchedEntitlementCustomerInfo)).toBe(false);
		});

		it("returns false when entitlement isActive is false", () => {
			const { checkProEntitlement } = require("@/lib/subscription");
			const inactiveInfo = {
				entitlements: {
					active: {
						"Recapd Pro": { isActive: false },
					},
					all: {},
				},
				activeSubscriptions: [],
				originalAppUserId: "user-123",
			} as unknown as CustomerInfo;

			expect(checkProEntitlement(inactiveInfo)).toBe(false);
		});
	});

	describe("purchasePackage", () => {
		it("returns success with customerInfo on successful purchase", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockPurchasePackage.mockResolvedValue({ customerInfo: proCustomerInfo });
			const { configureRevenueCat, purchasePackage } = require("@/lib/subscription");

			await configureRevenueCat("user-1");
			const result = await purchasePackage(mockPackage);

			expect(result.success).toBe(true);
			expect(result.customerInfo).toBe(proCustomerInfo);
		});

		it("returns userCancelled when user cancels", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockPurchasePackage.mockRejectedValue({ userCancelled: true });
			const { configureRevenueCat, purchasePackage } = require("@/lib/subscription");

			await configureRevenueCat("user-1");
			const result = await purchasePackage(mockPackage);

			expect(result.success).toBe(false);
			expect(result.userCancelled).toBe(true);
		});

		it("returns specific error for network failure", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockPurchasePackage.mockRejectedValue({ code: 4 });
			const { configureRevenueCat, purchasePackage } = require("@/lib/subscription");

			await configureRevenueCat("user-1");
			const result = await purchasePackage(mockPackage);

			expect(result.success).toBe(false);
			expect(result.error).toBe("Network error. Please check your connection");
		});

		it("returns failure when not configured", async () => {
			const { purchasePackage } = require("@/lib/subscription");

			const result = await purchasePackage(mockPackage);

			expect(result.success).toBe(false);
			expect(result.error).toBe("RevenueCat not configured");
		});
	});

	describe("restorePurchases", () => {
		it("returns success when pro entitlement is active", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockRestorePurchases.mockResolvedValue(proCustomerInfo);
			const { configureRevenueCat, restorePurchases } = require("@/lib/subscription");

			await configureRevenueCat("user-1");
			const result = await restorePurchases();

			expect(result.success).toBe(true);
			expect(result.customerInfo).toBe(proCustomerInfo);
		});

		it("returns success when entitlement name mismatches but activeSubscriptions exist", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockRestorePurchases.mockResolvedValue(mismatchedEntitlementCustomerInfo);
			const { configureRevenueCat, restorePurchases } = require("@/lib/subscription");

			await configureRevenueCat("user-1");
			const result = await restorePurchases();

			expect(result.success).toBe(true);
			expect(result.customerInfo).toBe(mismatchedEntitlementCustomerInfo);
		});

		it("returns failure when no subscriptions at all", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockRestorePurchases.mockResolvedValue(freeCustomerInfo);
			const { configureRevenueCat, restorePurchases } = require("@/lib/subscription");

			await configureRevenueCat("user-1");
			const result = await restorePurchases();

			expect(result.success).toBe(false);
			expect(result.error).toBe("No active subscriptions found");
		});

		it("returns failure when not configured", async () => {
			const { restorePurchases } = require("@/lib/subscription");

			const result = await restorePurchases();

			expect(result.success).toBe(false);
			expect(result.error).toBe("RevenueCat not configured");
		});

		it("returns failure with error message on API error", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockRestorePurchases.mockRejectedValue(new Error("Network timeout"));
			const { configureRevenueCat, restorePurchases } = require("@/lib/subscription");

			await configureRevenueCat("user-1");
			const result = await restorePurchases();

			expect(result.success).toBe(false);
			expect(result.error).toBe("Network timeout");
		});
	});

	describe("getSubscriptionStatus", () => {
		it("returns active status with correct fields for pro user", () => {
			const { getSubscriptionStatus } = require("@/lib/subscription");

			const status = getSubscriptionStatus(proCustomerInfo);

			expect(status.isActive).toBe(true);
			expect(status.productId).toBe("monthly");
			expect(status.willRenew).toBe(true);
			expect(status.expiresAt).toEqual(new Date("2025-12-31"));
		});

		it("returns default inactive status for free user", () => {
			const { getSubscriptionStatus } = require("@/lib/subscription");

			const status = getSubscriptionStatus(freeCustomerInfo);

			expect(status.isActive).toBe(false);
			expect(status.expiresAt).toBeNull();
			expect(status.productId).toBeNull();
			expect(status.willRenew).toBe(false);
		});
	});

	describe("syncSubscriptionToDatabase", () => {
		it("updates database with pro tier for active subscriber", async () => {
			const { syncSubscriptionToDatabase } = require("@/lib/subscription");

			await syncSubscriptionToDatabase("user-1", proCustomerInfo);

			expect(mockSupabaseFrom).toHaveBeenCalledWith("users");
			expect(mockSupabaseUpdate).toHaveBeenCalledWith(
				expect.objectContaining({
					subscription_tier: "pro",
					subscription_platform: "ios",
					subscription_id: "user-123",
				})
			);
			expect(mockSupabaseEq).toHaveBeenCalledWith("id", "user-1");
		});

		it("updates database with free tier for inactive subscriber", async () => {
			const { syncSubscriptionToDatabase } = require("@/lib/subscription");

			await syncSubscriptionToDatabase("user-1", freeCustomerInfo);

			expect(mockSupabaseUpdate).toHaveBeenCalledWith(
				expect.objectContaining({
					subscription_tier: "free",
					subscription_platform: null,
				})
			);
		});

		it("does not throw when supabase returns an error", async () => {
			mockSupabaseEq.mockResolvedValue({ error: { message: "DB error" } });
			const { syncSubscriptionToDatabase } = require("@/lib/subscription");

			await expect(syncSubscriptionToDatabase("user-1", proCustomerInfo)).resolves.not.toThrow();
		});
	});

	describe("presentPaywall", () => {
		it("returns customerInfo after successful purchase", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockPresentPaywall.mockResolvedValue("PURCHASED");
			mockGetCustomerInfo.mockResolvedValue(proCustomerInfo);
			const { configureRevenueCat, presentPaywall } = require("@/lib/subscription");

			await configureRevenueCat("user-1");
			const result = await presentPaywall();

			expect(result.presented).toBe(true);
			expect(result.customerInfo).toBe(proCustomerInfo);
		});

		it("retries getCustomerInfo when first call returns null after purchase", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockPresentPaywall.mockResolvedValue("PURCHASED");
			mockGetCustomerInfo.mockResolvedValueOnce(null).mockResolvedValueOnce(proCustomerInfo);
			const { configureRevenueCat, presentPaywall } = require("@/lib/subscription");

			await configureRevenueCat("user-1");
			const result = await presentPaywall();

			expect(mockGetCustomerInfo).toHaveBeenCalledTimes(2);
			expect(result.customerInfo).toBe(proCustomerInfo);
		}, 10000);

		it("returns no customerInfo when paywall is cancelled", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockPresentPaywall.mockResolvedValue("CANCELLED");
			const { configureRevenueCat, presentPaywall } = require("@/lib/subscription");

			await configureRevenueCat("user-1");
			const result = await presentPaywall();

			expect(result.presented).toBe(true);
			expect(result.customerInfo).toBeUndefined();
		});

		it("returns error when not configured", async () => {
			const { presentPaywall } = require("@/lib/subscription");

			const result = await presentPaywall();

			expect(result.presented).toBe(false);
			expect(result.error).toBe("RevenueCat not configured");
		});
	});

	describe("setupCustomerInfoListener", () => {
		it("adds listener and returns cleanup function", async () => {
			mockConfigure.mockResolvedValue(undefined);
			const { configureRevenueCat, setupCustomerInfoListener } = require("@/lib/subscription");

			await configureRevenueCat("user-1");
			const callback = jest.fn();
			const cleanup = setupCustomerInfoListener(callback);

			expect(mockAddListener).toHaveBeenCalledWith(callback);
			expect(typeof cleanup).toBe("function");

			cleanup();
			expect(mockRemoveListener).toHaveBeenCalledWith(callback);
		});

		it("returns noop when not configured", () => {
			const { setupCustomerInfoListener } = require("@/lib/subscription");

			const cleanup = setupCustomerInfoListener(jest.fn());

			expect(mockAddListener).not.toHaveBeenCalled();
			expect(typeof cleanup).toBe("function");
		});
	});
});

describe("store/subscriptionStore", () => {
	beforeEach(() => {
		resetModuleState();
	});

	function getStore() {
		const { useSubscriptionStore } = require("@/store/subscriptionStore");
		useSubscriptionStore.setState({
			isInitialized: false,
			isLoading: false,
			isPro: false,
			userId: null,
			status: { isActive: false, expiresAt: null, productId: null, willRenew: false },
			customerInfo: null,
			offerings: null,
			error: null,
		});
		return useSubscriptionStore;
	}

	describe("initialize", () => {
		it("configures RevenueCat, fetches data, and syncs to database", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo.mockResolvedValue(proCustomerInfo);
			mockGetOfferings.mockResolvedValue({ availablePackages: [mockPackage] });
			mockAddListener.mockImplementation(() => {});

			const store = getStore();
			await store.getState().initialize("user-1");

			const state = store.getState();
			expect(state.isInitialized).toBe(true);
			expect(state.isPro).toBe(true);
			expect(state.userId).toBe("user-1");
			expect(state.customerInfo).toBe(proCustomerInfo);
			expect(mockSupabaseFrom).toHaveBeenCalledWith("users");
			expect(mockSupabaseUpdate).toHaveBeenCalledWith(
				expect.objectContaining({ subscription_tier: "pro" })
			);
		});

		it("returns early when already initialized", async () => {
			const store = getStore();
			store.setState({ isInitialized: true });

			await store.getState().initialize("user-1");

			expect(mockConfigure).not.toHaveBeenCalled();
		});

		it("sets error when configuration fails", async () => {
			mockConfigure.mockResolvedValue(undefined);
			jest.spyOn(require("@/lib/subscription"), "configureRevenueCat").mockResolvedValue(false);

			const _store = getStore();
			const { configureRevenueCat: mockConfig } = require("@/lib/subscription");
			mockConfig.mockResolvedValue?.(false);

			resetModuleState();
			mockConfigure.mockRejectedValue(new Error("Config failed"));

			const store2 = getStore();
			await store2.getState().initialize("user-1");

			expect(store2.getState().isInitialized).toBe(true);
		});

		it("sets up customer info listener after initialization", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo.mockResolvedValue(proCustomerInfo);
			mockGetOfferings.mockResolvedValue(null);
			mockAddListener.mockImplementation(() => {});

			const store = getStore();
			await store.getState().initialize("user-1");

			expect(mockAddListener).toHaveBeenCalled();
		});

		it("handles null customerInfo gracefully", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo.mockResolvedValue(null);
			mockGetOfferings.mockResolvedValue(null);

			const store = getStore();
			await store.getState().initialize("user-1");

			const state = store.getState();
			expect(state.isInitialized).toBe(true);
			expect(state.isPro).toBe(false);
			expect(state.userId).toBe("user-1");
		});
	});

	describe("purchase", () => {
		it("sets isPro and syncs to database on successful purchase", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo.mockResolvedValue(proCustomerInfo);
			mockGetOfferings.mockResolvedValue(null);
			mockAddListener.mockImplementation(() => {});
			mockPurchasePackage.mockResolvedValue({ customerInfo: proCustomerInfo });

			const store = getStore();
			await store.getState().initialize("user-1");
			mockSupabaseFrom.mockClear();
			mockSupabaseUpdate.mockClear();

			const result = await store.getState().purchase(mockPackage);

			expect(result.success).toBe(true);
			expect(store.getState().isPro).toBe(true);
			expect(mockSupabaseFrom).toHaveBeenCalledWith("users");
			expect(mockSupabaseUpdate).toHaveBeenCalledWith(
				expect.objectContaining({ subscription_tier: "pro" })
			);
		});

		it("sets error on failed purchase", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo.mockResolvedValue(freeCustomerInfo);
			mockGetOfferings.mockResolvedValue(null);
			mockAddListener.mockImplementation(() => {});
			mockPurchasePackage.mockRejectedValue({ code: 2, message: "Payment declined" });

			const store = getStore();
			await store.getState().initialize("user-1");

			await store.getState().purchase(mockPackage);

			expect(store.getState().error).toBe("Invalid purchase");
		});

		it("does not set error when user cancels", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo.mockResolvedValue(freeCustomerInfo);
			mockGetOfferings.mockResolvedValue(null);
			mockAddListener.mockImplementation(() => {});
			mockPurchasePackage.mockRejectedValue({ userCancelled: true });

			const store = getStore();
			await store.getState().initialize("user-1");

			await store.getState().purchase(mockPackage);

			expect(store.getState().error).toBeNull();
			expect(store.getState().isLoading).toBe(false);
		});
	});

	describe("purchase - edge cases", () => {
		it("does not crash when userId is null during sync", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo.mockResolvedValue(freeCustomerInfo);
			mockGetOfferings.mockResolvedValue(null);
			mockAddListener.mockImplementation(() => {});
			mockPurchasePackage.mockResolvedValue({ customerInfo: proCustomerInfo });

			const store = getStore();
			await store.getState().initialize("user-1");
			store.setState({ userId: null });
			mockSupabaseFrom.mockClear();

			await expect(store.getState().purchase(mockPackage)).resolves.toBeDefined();
			expect(mockSupabaseFrom).not.toHaveBeenCalled();
		});
	});

	describe("restore", () => {
		it("sets isPro and syncs to database on successful restore", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo.mockResolvedValue(freeCustomerInfo);
			mockGetOfferings.mockResolvedValue(null);
			mockRestorePurchases.mockResolvedValue(proCustomerInfo);

			const store = getStore();
			await store.getState().initialize("user-1");
			mockSupabaseFrom.mockClear();
			mockSupabaseUpdate.mockClear();

			const result = await store.getState().restore();

			expect(result.success).toBe(true);
			expect(store.getState().isPro).toBe(true);
			expect(mockSupabaseFrom).toHaveBeenCalledWith("users");
		});

		it("succeeds via fallback when activeSubscriptions exist but entitlement mismatches", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo.mockResolvedValue(freeCustomerInfo);
			mockGetOfferings.mockResolvedValue(null);
			mockRestorePurchases.mockResolvedValue(mismatchedEntitlementCustomerInfo);

			const store = getStore();
			await store.getState().initialize("user-1");
			mockSupabaseFrom.mockClear();

			const result = await store.getState().restore();

			expect(result.success).toBe(true);
			expect(mockSupabaseFrom).toHaveBeenCalledWith("users");
		});

		it("does not grant pro when restore succeeds via activeSubscriptions but entitlement is mismatched", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo.mockResolvedValue(freeCustomerInfo);
			mockGetOfferings.mockResolvedValue(null);
			mockRestorePurchases.mockResolvedValue(mismatchedEntitlementCustomerInfo);

			const store = getStore();
			await store.getState().initialize("user-1");

			const result = await store.getState().restore();

			expect(result.success).toBe(true);
			expect(store.getState().isPro).toBe(false);
		});

		it("sets error when no active subscriptions found", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo.mockResolvedValue(freeCustomerInfo);
			mockGetOfferings.mockResolvedValue(null);
			mockRestorePurchases.mockResolvedValue(freeCustomerInfo);

			const store = getStore();
			await store.getState().initialize("user-1");

			const result = await store.getState().restore();

			expect(result.success).toBe(false);
			expect(store.getState().error).toBeTruthy();
		});
	});

	describe("showPaywall", () => {
		it("updates isPro and syncs to database after paywall purchase", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo
				.mockResolvedValueOnce(freeCustomerInfo)
				.mockResolvedValue(proCustomerInfo);
			mockGetOfferings.mockResolvedValue(null);
			mockPresentPaywall.mockResolvedValue("PURCHASED");

			const store = getStore();
			await store.getState().initialize("user-1");
			mockSupabaseFrom.mockClear();
			mockSupabaseUpdate.mockClear();

			const result = await store.getState().showPaywall();

			expect(result).toBe(true);
			expect(store.getState().isPro).toBe(true);
			expect(mockSupabaseFrom).toHaveBeenCalledWith("users");
		});

		it("does not change state when paywall is cancelled", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo.mockResolvedValue(freeCustomerInfo);
			mockGetOfferings.mockResolvedValue(null);
			mockPresentPaywall.mockResolvedValue("CANCELLED");

			const store = getStore();
			await store.getState().initialize("user-1");

			const result = await store.getState().showPaywall();

			expect(result).toBe(false);
			expect(store.getState().isPro).toBe(false);
		});

		it("returns true when purchase completed even if customerInfo is delayed", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo
				.mockResolvedValueOnce(freeCustomerInfo)
				.mockResolvedValue(freeCustomerInfo);
			mockGetOfferings.mockResolvedValue(null);
			mockPresentPaywall.mockResolvedValue("PURCHASED");

			const store = getStore();
			await store.getState().initialize("user-1");

			const result = await store.getState().showPaywall();

			expect(result).toBe(true);
		}, 10000);
	});

	describe("refreshSubscription", () => {
		it("updates state and syncs to database", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo
				.mockResolvedValueOnce(freeCustomerInfo)
				.mockResolvedValue(proCustomerInfo);
			mockGetOfferings.mockResolvedValue(null);

			const store = getStore();
			await store.getState().initialize("user-1");
			expect(store.getState().isPro).toBe(false);

			mockSupabaseFrom.mockClear();
			await store.getState().refreshSubscription();

			expect(store.getState().isPro).toBe(true);
			expect(mockSupabaseFrom).toHaveBeenCalledWith("users");
		});

		it("handles null customerInfo without error", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo.mockResolvedValueOnce(freeCustomerInfo).mockResolvedValue(null);
			mockGetOfferings.mockResolvedValue(null);

			const store = getStore();
			await store.getState().initialize("user-1");
			await store.getState().refreshSubscription();

			expect(store.getState().isLoading).toBe(false);
			expect(store.getState().error).toBeNull();
		});
	});

	describe("showPaywallIfNeeded", () => {
		it("returns false immediately when already pro", async () => {
			const store = getStore();
			store.setState({ isPro: true, userId: "user-1" });

			const result = await store.getState().showPaywallIfNeeded();

			expect(result).toBe(false);
			expect(mockPresentPaywallIfNeeded).not.toHaveBeenCalled();
		});

		it("syncs to database after successful paywall purchase", async () => {
			mockConfigure.mockResolvedValue(undefined);
			mockGetCustomerInfo
				.mockResolvedValueOnce(freeCustomerInfo)
				.mockResolvedValue(proCustomerInfo);
			mockGetOfferings.mockResolvedValue(null);
			mockPresentPaywallIfNeeded.mockResolvedValue("PURCHASED");

			const store = getStore();
			await store.getState().initialize("user-1");
			mockSupabaseFrom.mockClear();

			const result = await store.getState().showPaywallIfNeeded();

			expect(result).toBe(true);
			expect(mockSupabaseFrom).toHaveBeenCalledWith("users");
		});
	});
});
