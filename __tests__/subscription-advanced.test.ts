import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from "react-native-purchases";

jest.mock("expo-constants", () => ({
	__esModule: true,
	default: { appOwnership: "standalone" },
}));

jest.mock("react-native", () => ({
	Platform: { OS: "ios" },
}));

const mockConfigure = jest.fn().mockResolvedValue(undefined);
const mockGetCustomerInfo = jest.fn();
const mockGetOfferings = jest.fn();
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();
const mockSetLogLevel = jest.fn();
const mockLogIn = jest.fn();
const mockLogOut = jest.fn();
const mockSetEmail = jest.fn();
const mockSetDisplayName = jest.fn();
const mockAddCustomerInfoUpdateListener = jest.fn();
const mockRemoveCustomerInfoUpdateListener = jest.fn();

jest.mock("react-native-purchases", () => ({
	__esModule: true,
	default: {
		configure: (...args: unknown[]) => mockConfigure(...args),
		getCustomerInfo: () => mockGetCustomerInfo(),
		getOfferings: () => mockGetOfferings(),
		purchasePackage: (...args: unknown[]) => mockPurchasePackage(...args),
		restorePurchases: () => mockRestorePurchases(),
		setLogLevel: (...args: unknown[]) => mockSetLogLevel(...args),
		logIn: (...args: unknown[]) => mockLogIn(...args),
		logOut: () => mockLogOut(),
		setEmail: (...args: unknown[]) => mockSetEmail(...args),
		setDisplayName: (...args: unknown[]) => mockSetDisplayName(...args),
		addCustomerInfoUpdateListener: (...args: unknown[]) =>
			mockAddCustomerInfoUpdateListener(...args),
		removeCustomerInfoUpdateListener: (...args: unknown[]) =>
			mockRemoveCustomerInfoUpdateListener(...args),
	},
	LOG_LEVEL: { DEBUG: 4 },
	PURCHASES_ERROR_CODE: {
		PURCHASE_CANCELLED_ERROR: 1,
		PURCHASE_NOT_ALLOWED_ERROR: 3,
		PURCHASE_INVALID_ERROR: 4,
		PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: 5,
		NETWORK_ERROR: 10,
		RECEIPT_ALREADY_IN_USE_ERROR: 7,
	},
}));

const mockPresentPaywall = jest.fn();
const mockPresentPaywallIfNeeded = jest.fn();
const mockPresentCustomerCenter = jest.fn();

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

const mockSupabaseEq = jest.fn().mockResolvedValue({ error: null });
const mockSupabaseUpdate = jest.fn().mockReturnValue({ eq: mockSupabaseEq });

jest.mock("@/lib/supabase", () => ({
	supabase: {
		from: jest.fn().mockReturnValue({
			update: (...args: unknown[]) => mockSupabaseUpdate(...args),
		}),
	},
}));

const makeCustomerInfo = (
	overrides: Partial<{
		isPro: boolean;
		expirationDate: string | null;
		productIdentifier: string;
		willRenew: boolean;
		activeSubscriptions: string[];
	}> = {}
): CustomerInfo => {
	const isPro = overrides.isPro ?? false;
	return {
		entitlements: {
			active: isPro
				? {
						"Recapd Pro": {
							isActive: true,
							expirationDate: overrides.expirationDate ?? "2025-12-31T00:00:00Z",
							productIdentifier: overrides.productIdentifier ?? "monthly",
							willRenew: overrides.willRenew ?? true,
						} as any,
					}
				: {},
			all: {},
			verification: "VERIFIED" as any,
		},
		activeSubscriptions: overrides.activeSubscriptions ?? (isPro ? ["monthly"] : []),
		originalAppUserId: "user-1",
		allPurchasedProductIdentifiers: [],
		latestExpirationDate: null,
		firstSeen: "2024-01-01",
		originalApplicationVersion: null,
		requestDate: "2024-01-01",
		allExpirationDates: {},
		allPurchaseDates: {},
		nonSubscriptionTransactions: [],
		managementURL: null,
		originalPurchaseDate: null,
	} as unknown as CustomerInfo;
};

const makePkg = (id: string, price: number, priceString: string): PurchasesPackage =>
	({
		product: { identifier: id, price, priceString },
		identifier: id,
		packageType: "CUSTOM",
		offeringIdentifier: "default",
	}) as unknown as PurchasesPackage;

const makeOffering = (
	packages: PurchasesPackage[],
	monthly?: PurchasesPackage,
	annual?: PurchasesPackage
): PurchasesOffering =>
	({
		identifier: "default",
		availablePackages: packages,
		monthly: monthly || null,
		annual: annual || null,
	}) as unknown as PurchasesOffering;

beforeEach(() => {
	jest.clearAllMocks();
	jest.resetModules();
});

describe("RevenueCat must be configured before any purchase operation", () => {
	test("configuring RevenueCat sets up the SDK with the user ID", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat } = require("@/lib/subscription");

		const result = await configureRevenueCat("user-1");

		expect(result).toBe(true);
		expect(mockConfigure).toHaveBeenCalledWith(expect.objectContaining({ appUserID: "user-1" }));
		consoleSpy.mockRestore();
	});

	test("returns null/error from operations when not configured", async () => {
		const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		const { getCustomerInfo, getOfferings, purchasePackage } = require("@/lib/subscription");

		expect(await getCustomerInfo()).toBeNull();
		expect(await getOfferings()).toBeNull();

		const result = await purchasePackage({} as any);
		expect(result.success).toBe(false);
		expect(result.error).toContain("not configured");
		warnSpy.mockRestore();
	});

	test("skips reconfiguration if already set up for the same user", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat } = require("@/lib/subscription");

		await configureRevenueCat("user-1");
		await configureRevenueCat("user-1");

		expect(mockConfigure).toHaveBeenCalledTimes(1);
		consoleSpy.mockRestore();
	});
});

describe("retrieving available subscription packages", () => {
	test("returns the current offering with monthly and yearly options", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, getOfferings, getAllOfferings } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		const monthlyPkg = makePkg("monthly", 4.99, "$4.99");
		const yearlyPkg = makePkg("yearly", 39.99, "$39.99");
		const offering = makeOffering([monthlyPkg, yearlyPkg], monthlyPkg, yearlyPkg);

		mockGetOfferings.mockResolvedValue({ current: offering, all: { default: offering } });

		const current = await getOfferings();
		expect(current).toBeTruthy();
		expect(current.availablePackages).toHaveLength(2);

		const all = await getAllOfferings();
		expect(all).toBeTruthy();
		expect(all.default).toBeTruthy();
		consoleSpy.mockRestore();
	});
});

describe("purchasing a subscription", () => {
	test("successful purchase returns customer info with pro entitlement", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, purchasePackage } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		const proInfo = makeCustomerInfo({ isPro: true });
		mockPurchasePackage.mockResolvedValue({ customerInfo: proInfo });

		const pkg = makePkg("monthly", 4.99, "$4.99");
		const result = await purchasePackage(pkg);

		expect(result.success).toBe(true);
		expect(result.customerInfo).toBeTruthy();
		consoleSpy.mockRestore();
	});

	test("user cancellation is flagged separately from errors", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, purchasePackage } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		mockPurchasePackage.mockRejectedValue({ userCancelled: true });

		const pkg = makePkg("monthly", 4.99, "$4.99");
		const result = await purchasePackage(pkg);

		expect(result.success).toBe(false);
		expect(result.userCancelled).toBe(true);
		expect(result.error).toBe("Purchase cancelled");
		consoleSpy.mockRestore();
	});

	test("network errors give a user-friendly message", async () => {
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, purchasePackage } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		const { PURCHASES_ERROR_CODE } = require("react-native-purchases");
		mockPurchasePackage.mockRejectedValue({
			code: PURCHASES_ERROR_CODE.NETWORK_ERROR,
			message: "Network error",
		});

		const pkg = makePkg("monthly", 4.99, "$4.99");
		const result = await purchasePackage(pkg);

		expect(result.success).toBe(false);
		expect(result.error).toContain("Network error");
		consoleSpy.mockRestore();
		logSpy.mockRestore();
	});

	test("duplicate receipt error explains the issue", async () => {
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, purchasePackage } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		const { PURCHASES_ERROR_CODE } = require("react-native-purchases");
		mockPurchasePackage.mockRejectedValue({
			code: PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR,
			message: "Receipt already in use",
		});

		const pkg = makePkg("monthly", 4.99, "$4.99");
		const result = await purchasePackage(pkg);

		expect(result.error).toContain("already associated with another account");
		consoleSpy.mockRestore();
		logSpy.mockRestore();
	});
});

describe("purchasing by product ID", () => {
	test("finds the matching package from offerings and purchases it", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, purchaseProduct } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		const monthlyPkg = makePkg("monthly", 4.99, "$4.99");
		mockGetOfferings.mockResolvedValue({
			current: makeOffering([monthlyPkg]),
		});

		const proInfo = makeCustomerInfo({ isPro: true });
		mockPurchasePackage.mockResolvedValue({ customerInfo: proInfo });

		const result = await purchaseProduct("monthly");

		expect(result.success).toBe(true);
		consoleSpy.mockRestore();
	});

	test("fails when the product is not in the current offering", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, purchaseProduct } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		mockGetOfferings.mockResolvedValue({
			current: makeOffering([makePkg("monthly", 4.99, "$4.99")]),
		});

		const result = await purchaseProduct("yearly");

		expect(result.success).toBe(false);
		expect(result.error).toContain("not found");
		consoleSpy.mockRestore();
	});
});

describe("restoring previous purchases", () => {
	test("restores active subscription and returns customer info", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, restorePurchases } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		mockRestorePurchases.mockResolvedValue(makeCustomerInfo({ isPro: true }));

		const result = await restorePurchases();

		expect(result.success).toBe(true);
		expect(result.customerInfo).toBeTruthy();
		consoleSpy.mockRestore();
	});

	test("reports no active subscriptions when restore finds nothing", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, restorePurchases } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		mockRestorePurchases.mockResolvedValue(makeCustomerInfo({ isPro: false }));

		const result = await restorePurchases();

		expect(result.success).toBe(false);
		expect(result.error).toContain("No active subscriptions");
		consoleSpy.mockRestore();
	});
});

describe("checking Pro entitlement from customer info", () => {
	test("returns true when 'Recapd Pro' entitlement is active", () => {
		const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { checkProEntitlement } = require("@/lib/subscription");
		const info = makeCustomerInfo({ isPro: true });

		expect(checkProEntitlement(info)).toBe(true);
		logSpy.mockRestore();
	});

	test("returns false when no active entitlements exist", () => {
		const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { checkProEntitlement } = require("@/lib/subscription");
		const info = makeCustomerInfo({ isPro: false });

		expect(checkProEntitlement(info)).toBe(false);
		logSpy.mockRestore();
	});
});

describe("subscription status details", () => {
	test("extracts expiration date, product ID, and renewal status", () => {
		const { getSubscriptionStatus, getSubscriptionExpirationDate, getProEntitlement } =
			require("@/lib/subscription");
		const info = makeCustomerInfo({
			isPro: true,
			expirationDate: "2025-06-01T00:00:00Z",
			productIdentifier: "yearly",
			willRenew: false,
		});

		const status = getSubscriptionStatus(info);
		expect(status.isActive).toBe(true);
		expect(status.productId).toBe("yearly");
		expect(status.willRenew).toBe(false);
		expect(status.expiresAt).toEqual(new Date("2025-06-01T00:00:00Z"));

		const expDate = getSubscriptionExpirationDate(info);
		expect(expDate).toEqual(new Date("2025-06-01T00:00:00Z"));

		const entitlement = getProEntitlement(info);
		expect(entitlement).toBeTruthy();
	});

	test("returns default inactive status when no entitlement exists", () => {
		const { getSubscriptionStatus, getProEntitlement } = require("@/lib/subscription");
		const info = makeCustomerInfo({ isPro: false });

		const status = getSubscriptionStatus(info);
		expect(status.isActive).toBe(false);
		expect(status.expiresAt).toBeNull();
		expect(status.productId).toBeNull();

		expect(getProEntitlement(info)).toBeNull();
	});
});

describe("syncing subscription to database", () => {
	test("updates the user record with subscription details", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, syncSubscriptionToDatabase } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		const info = makeCustomerInfo({ isPro: true, productIdentifier: "monthly" });

		await syncSubscriptionToDatabase("user-1", info);

		expect(mockSupabaseUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				subscription_tier: "pro",
				subscription_platform: "ios",
			})
		);
		consoleSpy.mockRestore();
	});

	test("sets tier to 'free' when subscription is inactive", async () => {
		const { syncSubscriptionToDatabase } = require("@/lib/subscription");
		const info = makeCustomerInfo({ isPro: false });

		await syncSubscriptionToDatabase("user-1", info);

		expect(mockSupabaseUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				subscription_tier: "free",
				subscription_platform: null,
			})
		);
	});
});

describe("presenting the paywall", () => {
	test("returns purchased=true when user completes a purchase", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, presentPaywall } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		mockPresentPaywall.mockResolvedValue("PURCHASED");
		mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo({ isPro: true }));

		const result = await presentPaywall();

		expect(result.presented).toBe(true);
		expect(result.purchased).toBe(true);
		consoleSpy.mockRestore();
	});

	test("returns purchased=false when user dismisses the paywall", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, presentPaywall } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		mockPresentPaywall.mockResolvedValue("CANCELLED");

		const result = await presentPaywall();

		expect(result.presented).toBe(true);
		expect(result.purchased).toBe(false);
		consoleSpy.mockRestore();
	});

	test("returns error when paywall fails to load", async () => {
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, presentPaywall } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		mockPresentPaywall.mockRejectedValue(new Error("Network error"));

		const result = await presentPaywall();

		expect(result.presented).toBe(false);
		expect(result.error).toBeTruthy();
		consoleSpy.mockRestore();
		logSpy.mockRestore();
	});
});

describe("conditional paywall (show only if not Pro)", () => {
	test("skips paywall when user already has Pro entitlement", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, presentPaywallIfNeeded } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		mockPresentPaywallIfNeeded.mockResolvedValue("NOT_PRESENTED");

		const result = await presentPaywallIfNeeded();

		expect(result.presented).toBe(false);
		expect(result.purchased).toBe(false);
		consoleSpy.mockRestore();
	});

	test("presents paywall and returns purchased when user subscribes", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, presentPaywallIfNeeded } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		mockPresentPaywallIfNeeded.mockResolvedValue("PURCHASED");
		mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo({ isPro: true }));

		const result = await presentPaywallIfNeeded();

		expect(result.presented).toBe(true);
		expect(result.purchased).toBe(true);
		consoleSpy.mockRestore();
	});
});

describe("customer center for managing subscriptions", () => {
	test("opens the RevenueCat customer center UI", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, presentCustomerCenter } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		await presentCustomerCenter();

		expect(mockPresentCustomerCenter).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	test("does nothing when RevenueCat is not configured", async () => {
		const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
		const { presentCustomerCenter } = require("@/lib/subscription");

		await presentCustomerCenter();

		expect(mockPresentCustomerCenter).not.toHaveBeenCalled();
		warnSpy.mockRestore();
	});
});

describe("RevenueCat user management", () => {
	test("logInUser identifies the user in RevenueCat", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, logInUser } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		const info = makeCustomerInfo({ isPro: true });
		mockLogIn.mockResolvedValue({ customerInfo: info });

		const result = await logInUser("user-1");

		expect(result).toBeTruthy();
		expect(mockLogIn).toHaveBeenCalledWith("user-1");
		consoleSpy.mockRestore();
	});

	test("logOutUser clears the RevenueCat user", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, logOutUser } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		const anonInfo = makeCustomerInfo({ isPro: false });
		mockLogOut.mockResolvedValue(anonInfo);

		const result = await logOutUser();

		expect(result).toBeTruthy();
		expect(mockLogOut).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	test("handles login failure gracefully", async () => {
		const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
		const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, logInUser } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		mockLogIn.mockRejectedValue(new Error("Login failed"));

		const result = await logInUser("user-1");

		expect(result).toBeNull();
		consoleSpy.mockRestore();
		logSpy.mockRestore();
	});
});

describe("user profile sync with RevenueCat", () => {
	test("setUserEmail sends email to RevenueCat", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, setUserEmail } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		await setUserEmail("alice@example.com");

		expect(mockSetEmail).toHaveBeenCalledWith("alice@example.com");
		consoleSpy.mockRestore();
	});

	test("setUserDisplayName sends name to RevenueCat", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, setUserDisplayName } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		await setUserDisplayName("Alice");

		expect(mockSetDisplayName).toHaveBeenCalledWith("Alice");
		consoleSpy.mockRestore();
	});
});

describe("package selection helpers", () => {
	test("finds monthly package from offering", () => {
		const { getMonthlyPackage, getYearlyPackage, getPackageByProductId } =
			require("@/lib/subscription");

		const monthlyPkg = makePkg("monthly", 4.99, "$4.99");
		const yearlyPkg = makePkg("yearly", 39.99, "$39.99");
		const offering = makeOffering([monthlyPkg, yearlyPkg], monthlyPkg, yearlyPkg);

		expect(getMonthlyPackage(offering)).toEqual(monthlyPkg);
		expect(getYearlyPackage(offering)).toEqual(yearlyPkg);
		expect(getPackageByProductId(offering, "monthly")).toEqual(monthlyPkg);
	});

	test("falls back to searching available packages when shortcuts are null", () => {
		const { getMonthlyPackage, getYearlyPackage } = require("@/lib/subscription");

		const monthlyPkg = makePkg("monthly", 4.99, "$4.99");
		const yearlyPkg = makePkg("yearly", 39.99, "$39.99");
		const offering = makeOffering([monthlyPkg, yearlyPkg]);

		expect(getMonthlyPackage(offering)).toEqual(monthlyPkg);
		expect(getYearlyPackage(offering)).toEqual(yearlyPkg);
	});

	test("returns null when package is not available", () => {
		const { getPackageByProductId } = require("@/lib/subscription");

		const offering = makeOffering([makePkg("monthly", 4.99, "$4.99")]);

		expect(getPackageByProductId(offering, "yearly")).toBeNull();
	});
});

describe("price formatting and savings calculation", () => {
	test("formatPrice returns the localized price string", () => {
		const { formatPrice } = require("@/lib/subscription");
		const pkg = makePkg("monthly", 4.99, "$4.99/mo");

		expect(formatPrice(pkg)).toBe("$4.99/mo");
	});

	test("calculateYearlySavings computes the percentage saved vs monthly", () => {
		const { calculateYearlySavings } = require("@/lib/subscription");

		const monthlyPkg = makePkg("monthly", 4.99, "$4.99");
		const yearlyPkg = makePkg("yearly", 39.99, "$39.99");

		const savings = calculateYearlySavings(monthlyPkg, yearlyPkg);

		expect(savings).toBeGreaterThan(0);
		expect(savings).toBeLessThan(100);
		// $4.99 * 12 = $59.88, yearly $39.99, savings ~33%
		expect(savings).toBe(33);
	});
});

describe("subscription store integration", () => {
	test("initialize sets up RevenueCat and loads subscription state", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { useSubscriptionStore } = require("@/store/subscriptionStore");
		useSubscriptionStore.setState({ isInitialized: false });

		mockConfigure.mockResolvedValue(undefined);
		const proInfo = makeCustomerInfo({ isPro: true });
		mockGetCustomerInfo.mockResolvedValue(proInfo);
		mockGetOfferings.mockResolvedValue(null);

		await useSubscriptionStore.getState().initialize("user-1");

		const state = useSubscriptionStore.getState();
		expect(state.isInitialized).toBe(true);
		expect(state.isPro).toBe(true);
		consoleSpy.mockRestore();
	});

	test("purchase updates store with pro status on success", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { useSubscriptionStore } = require("@/store/subscriptionStore");
		useSubscriptionStore.setState({ isInitialized: false });

		mockConfigure.mockResolvedValue(undefined);
		mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo({ isPro: false }));
		mockGetOfferings.mockResolvedValue(null);
		await useSubscriptionStore.getState().initialize("user-1");

		const proInfo = makeCustomerInfo({ isPro: true });
		mockPurchasePackage.mockResolvedValue({ customerInfo: proInfo });

		const pkg = makePkg("monthly", 4.99, "$4.99");
		const result = await useSubscriptionStore.getState().purchase(pkg);

		expect(result.success).toBe(true);
		expect(useSubscriptionStore.getState().isPro).toBe(true);
		consoleSpy.mockRestore();
	});

	test("restore updates store when active subscription found", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { useSubscriptionStore } = require("@/store/subscriptionStore");
		useSubscriptionStore.setState({ isInitialized: false });

		mockConfigure.mockResolvedValue(undefined);
		mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo({ isPro: false }));
		mockGetOfferings.mockResolvedValue(null);
		await useSubscriptionStore.getState().initialize("user-1");

		mockRestorePurchases.mockResolvedValue(makeCustomerInfo({ isPro: true }));

		const result = await useSubscriptionStore.getState().restore();

		expect(result.success).toBe(true);
		expect(useSubscriptionStore.getState().isPro).toBe(true);
		consoleSpy.mockRestore();
	});

	test("showCustomerCenter delegates to RevenueCat UI", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { useSubscriptionStore } = require("@/store/subscriptionStore");
		useSubscriptionStore.setState({ isInitialized: false });

		mockConfigure.mockResolvedValue(undefined);
		mockGetCustomerInfo.mockResolvedValue(makeCustomerInfo({ isPro: true }));
		mockGetOfferings.mockResolvedValue(null);
		await useSubscriptionStore.getState().initialize("user-1");

		await useSubscriptionStore.getState().showCustomerCenter();

		expect(mockPresentCustomerCenter).toHaveBeenCalled();
		consoleSpy.mockRestore();
	});

	test("clearError resets the error state", async () => {
		const { useSubscriptionStore } = require("@/store/subscriptionStore");
		useSubscriptionStore.setState({ error: "Something went wrong" });

		useSubscriptionStore.getState().clearError();

		expect(useSubscriptionStore.getState().error).toBeNull();
	});

	test("getMonthlyPackage and getYearlyPackage use store offerings", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { useSubscriptionStore } = require("@/store/subscriptionStore");

		const monthlyPkg = makePkg("monthly", 4.99, "$4.99");
		const yearlyPkg = makePkg("yearly", 39.99, "$39.99");
		const offering = makeOffering([monthlyPkg, yearlyPkg], monthlyPkg, yearlyPkg);

		useSubscriptionStore.setState({ offerings: offering });

		expect(useSubscriptionStore.getState().getMonthlyPackage()).toEqual(monthlyPkg);
		expect(useSubscriptionStore.getState().getYearlyPackage()).toEqual(yearlyPkg);
		consoleSpy.mockRestore();
	});

	test("returns null for packages when no offerings loaded", () => {
		const { useSubscriptionStore } = require("@/store/subscriptionStore");
		useSubscriptionStore.setState({ offerings: null });

		expect(useSubscriptionStore.getState().getMonthlyPackage()).toBeNull();
		expect(useSubscriptionStore.getState().getYearlyPackage()).toBeNull();
	});
});

describe("PRODUCT_IDS constants", () => {
	test("defines monthly and yearly product identifiers", () => {
		const { PRODUCT_IDS } = require("@/lib/subscription");

		expect(PRODUCT_IDS.MONTHLY).toBe("monthly");
		expect(PRODUCT_IDS.YEARLY).toBe("yearly");
	});
});

describe("customer info listener for real-time subscription changes", () => {
	test("sets up and tears down listener when configured", async () => {
		const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
		const { configureRevenueCat, setupCustomerInfoListener } = require("@/lib/subscription");
		await configureRevenueCat("user-1");

		const callback = jest.fn();
		const cleanup = setupCustomerInfoListener(callback);

		expect(mockAddCustomerInfoUpdateListener).toHaveBeenCalledWith(callback);
		expect(typeof cleanup).toBe("function");

		cleanup();
		expect(mockRemoveCustomerInfoUpdateListener).toHaveBeenCalledWith(callback);
		consoleSpy.mockRestore();
	});

	test("returns no-op when not configured", () => {
		const { setupCustomerInfoListener } = require("@/lib/subscription");

		const cleanup = setupCustomerInfoListener(jest.fn());

		expect(typeof cleanup).toBe("function");
		expect(mockAddCustomerInfoUpdateListener).not.toHaveBeenCalled();
	});
});
