import { Alert } from "react-native";
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from "react-native-purchases";
import { create } from "zustand";
import { logger } from "@/lib/logger";
import {
	checkProEntitlement,
	configureRevenueCat,
	getAllOfferings,
	getCustomerInfo,
	getLastRevenueCatError,
	getMonthlyPackage,
	getOfferings,
	getSubscriptionStatus,
	getYearlyPackage,
	isRevenueCatConfigured,
	type PurchaseResult,
	presentCustomerCenter,
	presentPaywall,
	presentPaywallIfNeeded,
	purchasePackage,
	restorePurchases,
	SUBSCRIPTIONS_ENABLED,
	setupCustomerInfoListener,
	syncSubscriptionToDatabase,
} from "@/lib/subscription";
import { fetchSubscriptionPlanCatalog } from "@/lib/subscriptionPlans";
import type { SubscriptionTier } from "@/types/database";
import { SUBSCRIPTION_PLAN_CATALOG, type SubscriptionPlanCatalog } from "@/types/subscription";

export interface SubscriptionStatus {
	isActive: boolean;
	expiresAt: Date | null;
	productId: string | null;
	willRenew: boolean;
}

interface SubscriptionState {
	isInitialized: boolean;
	isLoading: boolean;
	isPro: boolean;
	planId: SubscriptionTier;
	plans: SubscriptionPlanCatalog;
	userId: string | null;
	status: SubscriptionStatus;
	customerInfo: CustomerInfo | null;
	offerings: PurchasesOffering | null;
	error: string | null;

	initialize: (userId: string) => Promise<void>;
	refreshSubscription: () => Promise<void>;
	purchase: (pkg: PurchasesPackage) => Promise<PurchaseResult>;
	restore: () => Promise<PurchaseResult>;
	showPaywall: () => Promise<boolean>;
	showPaywallIfNeeded: () => Promise<boolean>;
	showCustomerCenter: () => Promise<boolean>;
	getMonthlyPackage: () => PurchasesPackage | null;
	getYearlyPackage: () => PurchasesPackage | null;
	clearError: () => void;
}

const DEFAULT_STATUS: SubscriptionStatus = {
	isActive: false,
	expiresAt: null,
	productId: null,
	willRenew: false,
};

let listenerCleanup: (() => void) | null = null;

function getProPlanRevenueCatConfig(plans: SubscriptionPlanCatalog): {
	entitlementId?: string | null;
} {
	return {
		entitlementId: plans.pro.revenueCatEntitlementIdentifier,
	};
}

async function ensureRevenueCatConfigured(userId: string | null): Promise<boolean> {
	if (isRevenueCatConfigured()) return true;
	if (!userId) return false;
	return await configureRevenueCat(userId);
}

async function resolvePaywallOffering(
	get: () => SubscriptionState,
	set: (partial: Partial<SubscriptionState>) => void
): Promise<PurchasesOffering | null> {
	const { offerings, plans } = get();
	const configuredOfferingId = plans.pro.revenueCatOfferingIdentifier;

	if (configuredOfferingId) {
		const allOfferings = await getAllOfferings();
		const configuredOffering = allOfferings?.[configuredOfferingId] ?? null;
		if (configuredOffering) {
			set({ offerings: configuredOffering });
			return configuredOffering;
		}
	}

	const currentOffering = offerings ?? (await getOfferings());
	if (currentOffering) {
		set({ offerings: currentOffering });
	}
	return currentOffering;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
	isInitialized: false,
	isLoading: false,
	isPro: false,
	planId: "free",
	plans: SUBSCRIPTION_PLAN_CATALOG,
	userId: null,
	status: DEFAULT_STATUS,
	customerInfo: null,
	offerings: null,
	error: null,

	initialize: async (userId: string) => {
		if (get().isLoading) return;
		if (get().isInitialized && get().userId === userId && !get().error) return;

		set({ isLoading: true, error: null });

		try {
			const plans = await fetchSubscriptionPlanCatalog();
			const { entitlementId } = getProPlanRevenueCatConfig(plans);
			set({ plans });
			const configured = await configureRevenueCat(userId);

			if (!configured) {
				const bootstrapError = getLastRevenueCatError() || "Failed to configure RevenueCat";
				set({
					isInitialized: false,
					isLoading: false,
					error: bootstrapError,
					planId: "free",
					userId,
				});
				return;
			}

			set({ userId });

			const [customerInfo, offerings] = await Promise.all([getCustomerInfo(), getOfferings()]);
			const bootstrapError = getLastRevenueCatError();

			if (offerings) {
				set({ offerings });
			}

			if (customerInfo) {
				const isPro = checkProEntitlement(customerInfo, entitlementId);
				const status = getSubscriptionStatus(customerInfo, entitlementId);

				await syncSubscriptionToDatabase(userId, customerInfo, entitlementId);

				set({
					isPro,
					planId: isPro ? "pro" : "free",
					status,
					customerInfo,
					offerings,
					isInitialized: true,
					isLoading: false,
					error: null,
				});

				if (listenerCleanup) {
					listenerCleanup();
				}

				listenerCleanup = setupCustomerInfoListener((updatedInfo) => {
					const newIsPro = checkProEntitlement(updatedInfo, entitlementId);
					const newStatus = getSubscriptionStatus(updatedInfo, entitlementId);

					set({
						isPro: newIsPro,
						planId: newIsPro ? "pro" : "free",
						status: newStatus,
						customerInfo: updatedInfo,
					});

					syncSubscriptionToDatabase(userId, updatedInfo, entitlementId);
				});
			} else {
				set({
					isPro: false,
					planId: "free",
					status: DEFAULT_STATUS,
					offerings,
					isInitialized: true,
					isLoading: false,
					error: bootstrapError || null,
				});
			}
		} catch (error: any) {
			logger.error("Failed to initialize subscriptions", error);
			set({
				error: getLastRevenueCatError() || error.message || "Failed to initialize subscriptions",
				isLoading: false,
				isInitialized: false,
			});
		}
	},

	refreshSubscription: async () => {
		set({ isLoading: true, error: null });

		try {
			const { entitlementId } = getProPlanRevenueCatConfig(get().plans);
			const customerInfo = await getCustomerInfo();

			if (customerInfo) {
				const isPro = checkProEntitlement(customerInfo, entitlementId);
				const status = getSubscriptionStatus(customerInfo, entitlementId);

				set({
					isPro,
					planId: isPro ? "pro" : "free",
					status,
					customerInfo,
					isLoading: false,
				});

				const { userId } = get();
				if (userId) {
					await syncSubscriptionToDatabase(userId, customerInfo, entitlementId);
				}
			} else {
				set({ isLoading: false });
			}
		} catch (error: any) {
			set({
				error: error.message || "Failed to refresh subscription",
				isLoading: false,
			});
		}
	},

	purchase: async (pkg: PurchasesPackage) => {
		set({ isLoading: true, error: null });
		const { userId } = get();

		if (!(await ensureRevenueCatConfigured(userId))) {
			set({
				error: getLastRevenueCatError() || "RevenueCat not configured",
				isLoading: false,
			});
			return { success: false, error: getLastRevenueCatError() || "RevenueCat not configured" };
		}

		const result = await purchasePackage(pkg);

		if (result.success && result.customerInfo) {
			const { entitlementId } = getProPlanRevenueCatConfig(get().plans);
			const isPro = checkProEntitlement(result.customerInfo, entitlementId);
			const status = getSubscriptionStatus(result.customerInfo, entitlementId);

			set({
				isPro,
				planId: isPro ? "pro" : "free",
				status,
				customerInfo: result.customerInfo,
				isLoading: false,
			});

			const { userId } = get();
			if (userId) {
				await syncSubscriptionToDatabase(userId, result.customerInfo, entitlementId);
			}
		} else if (!result.userCancelled) {
			set({
				error: result.error || "Purchase failed",
				isLoading: false,
			});
		} else {
			set({ isLoading: false });
		}

		return result;
	},

	restore: async () => {
		set({ isLoading: true, error: null });
		const { userId } = get();

		if (!(await ensureRevenueCatConfigured(userId))) {
			set({
				error: getLastRevenueCatError() || "RevenueCat not configured",
				isLoading: false,
			});
			return {
				success: false,
				error: getLastRevenueCatError() || "RevenueCat not configured",
			};
		}

		const { entitlementId } = getProPlanRevenueCatConfig(get().plans);
		const result = await restorePurchases(entitlementId);

		if (result.success && result.customerInfo) {
			const isPro = checkProEntitlement(result.customerInfo, entitlementId);
			const status = getSubscriptionStatus(result.customerInfo, entitlementId);

			set({
				isPro,
				planId: isPro ? "pro" : "free",
				status,
				customerInfo: result.customerInfo,
				isLoading: false,
			});

			const { userId } = get();
			if (userId) {
				await syncSubscriptionToDatabase(userId, result.customerInfo, entitlementId);
			}
		} else if (!result.userCancelled) {
			set({
				error: result.error || "No purchases to restore",
				isLoading: false,
			});
		} else {
			set({ isLoading: false });
		}

		return result;
	},

	showPaywall: async () => {
		const { userId } = get();
		if (!(await ensureRevenueCatConfigured(userId))) {
			const errorMessage = getLastRevenueCatError() || "RevenueCat not configured";
			set({ error: errorMessage });
			Alert.alert("Pro is unavailable", "We can't load the upgrade screen right now. Try again in a moment.");
			return false;
		}

		const offering = await resolvePaywallOffering(get, set);
		const { entitlementId } = getProPlanRevenueCatConfig(get().plans);
		const result = await presentPaywall(offering, entitlementId);

		if (!result.presented) {
			const errorMessage =
				result.error || getLastRevenueCatError() || "Unable to load the upgrade screen";
			set({ error: errorMessage });
			Alert.alert("Pro is unavailable", "We can't load the upgrade screen right now. Try again in a moment.");
			return false;
		}

		if (result.customerInfo) {
			const newIsPro = checkProEntitlement(result.customerInfo, entitlementId);
			const status = getSubscriptionStatus(result.customerInfo, entitlementId);

			if (newIsPro || !get().isPro) {
				set({
					isPro: newIsPro,
					planId: newIsPro ? "pro" : "free",
					status,
					customerInfo: result.customerInfo,
				});
			}

			const { userId } = get();
			if (userId) {
				await syncSubscriptionToDatabase(userId, result.customerInfo, entitlementId);
			}
		}

		if (result.purchased && !get().isPro) {
			setTimeout(() => get().refreshSubscription(), 3000);
		}

		return result.purchased;
	},

	showPaywallIfNeeded: async () => {
		const { isPro } = get();
		if (isPro) return false;

		const { userId } = get();
		if (!(await ensureRevenueCatConfigured(userId))) {
			const errorMessage = getLastRevenueCatError() || "RevenueCat not configured";
			set({ error: errorMessage });
			return false;
		}

		const offering = await resolvePaywallOffering(get, set);
		const { entitlementId } = getProPlanRevenueCatConfig(get().plans);
		const result = await presentPaywallIfNeeded(offering, entitlementId);

		if (result.customerInfo) {
			const newIsPro = checkProEntitlement(result.customerInfo, entitlementId);
			const status = getSubscriptionStatus(result.customerInfo, entitlementId);

			if (newIsPro || !get().isPro) {
				set({
					isPro: newIsPro,
					planId: newIsPro ? "pro" : "free",
					status,
					customerInfo: result.customerInfo,
				});
			}

			const { userId } = get();
			if (userId) {
				await syncSubscriptionToDatabase(userId, result.customerInfo, entitlementId);
			}

			if (result.purchased && !get().isPro) {
				setTimeout(() => get().refreshSubscription(), 3000);
			}

			return newIsPro || get().isPro;
		}

		if (!result.presented && (result.error || getLastRevenueCatError())) {
			set({
				error: result.error || getLastRevenueCatError() || "Unable to load the upgrade screen",
			});
		}

		return false;
	},

	showCustomerCenter: async () => {
		const { userId } = get();
		if (!(await ensureRevenueCatConfigured(userId))) {
			const errorMessage = getLastRevenueCatError() || "RevenueCat not configured";
			set({ error: errorMessage });
			return false;
		}

		const result = await presentCustomerCenter();
		if (!result.presented && result.error) {
			set({ error: result.error });
			return false;
		}

		return result.presented;
	},

	getMonthlyPackage: () => {
		const { offerings } = get();
		if (!offerings) return null;
		return getMonthlyPackage(offerings);
	},

	getYearlyPackage: () => {
		const { offerings } = get();
		if (!offerings) return null;
		return getYearlyPackage(offerings);
	},

	clearError: () => {
		set({ error: null });
	},
}));

export function useIsPro(): boolean {
	const isPro = useSubscriptionStore((state) => state.isPro);
	if (!SUBSCRIPTIONS_ENABLED) {
		return true;
	}
	return isPro;
}

export function useSubscriptionStatus(): SubscriptionStatus {
	return useSubscriptionStore((state) => state.status);
}

export function useSubscriptionPlanId(): SubscriptionTier {
	return useSubscriptionStore((state) => state.planId);
}

export function useSubscriptionPlans(): SubscriptionPlanCatalog {
	return useSubscriptionStore((state) => state.plans);
}
