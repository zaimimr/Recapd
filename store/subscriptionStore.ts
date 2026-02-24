import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from "react-native-purchases";
import { Alert } from "react-native";
import { create } from "zustand";
import {
	checkProEntitlement,
	configureRevenueCat,
	getCustomerInfo,
	getMonthlyPackage,
	getOfferings,
	getSubscriptionStatus,
	getYearlyPackage,
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
	showCustomerCenter: () => Promise<void>;
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

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
	isInitialized: false,
	isLoading: false,
	isPro: false,
	userId: null,
	status: DEFAULT_STATUS,
	customerInfo: null,
	offerings: null,
	error: null,

	initialize: async (userId: string) => {
		if (get().isInitialized) return;

		set({ isLoading: true, error: null });

		try {
			const configured = await configureRevenueCat(userId);

			if (!configured) {
				set({
					isInitialized: true,
					isLoading: false,
					error: "Failed to configure RevenueCat",
				});
				return;
			}

			set({ userId });

			const [customerInfo, offerings] = await Promise.all([getCustomerInfo(), getOfferings()]);

			if (customerInfo) {
				const isPro = checkProEntitlement(customerInfo);
				const status = getSubscriptionStatus(customerInfo);

				await syncSubscriptionToDatabase(userId, customerInfo);

				set({
					isPro,
					status,
					customerInfo,
					offerings,
					isInitialized: true,
					isLoading: false,
				});

				if (listenerCleanup) {
					listenerCleanup();
				}

				listenerCleanup = setupCustomerInfoListener((updatedInfo) => {
					const newIsPro = checkProEntitlement(updatedInfo);
					const newStatus = getSubscriptionStatus(updatedInfo);

					set({
						isPro: newIsPro,
						status: newStatus,
						customerInfo: updatedInfo,
					});

					syncSubscriptionToDatabase(userId, updatedInfo);
				});
			} else {
				set({
					isPro: false,
					status: DEFAULT_STATUS,
					offerings,
					isInitialized: true,
					isLoading: false,
				});
			}
		} catch (error: any) {
			console.error("Failed to initialize subscriptions:", error);
			set({
				error: error.message || "Failed to initialize subscriptions",
				isLoading: false,
				isInitialized: true,
			});
		}
	},

	refreshSubscription: async () => {
		set({ isLoading: true, error: null });

		try {
			const customerInfo = await getCustomerInfo();

			if (customerInfo) {
				const isPro = checkProEntitlement(customerInfo);
				const status = getSubscriptionStatus(customerInfo);

				set({
					isPro,
					status,
					customerInfo,
					isLoading: false,
				});

				const { userId } = get();
				if (userId) {
					await syncSubscriptionToDatabase(userId, customerInfo);
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

		const result = await purchasePackage(pkg);

		if (result.success && result.customerInfo) {
			const isPro = checkProEntitlement(result.customerInfo);
			const status = getSubscriptionStatus(result.customerInfo);

			set({
				isPro,
				status,
				customerInfo: result.customerInfo,
				isLoading: false,
			});

			const { userId } = get();
			if (userId) {
				await syncSubscriptionToDatabase(userId, result.customerInfo);
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

		const result = await restorePurchases();

		if (result.success && result.customerInfo) {
			const isPro = checkProEntitlement(result.customerInfo);
			const status = getSubscriptionStatus(result.customerInfo);

			set({
				isPro,
				status,
				customerInfo: result.customerInfo,
				isLoading: false,
			});

			const { userId } = get();
			if (userId) {
				await syncSubscriptionToDatabase(userId, result.customerInfo);
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
		const result = await presentPaywall();

		if (!result.presented && result.error) {
			Alert.alert(
				"Unable to Load",
				"The upgrade screen couldn't be loaded. Please check your internet connection and try again."
			);
			return false;
		}

		if (result.customerInfo) {
			const newIsPro = checkProEntitlement(result.customerInfo);
			const status = getSubscriptionStatus(result.customerInfo);

			if (newIsPro || !get().isPro) {
				set({
					isPro: newIsPro,
					status,
					customerInfo: result.customerInfo,
				});
			}

			const { userId } = get();
			if (userId) {
				await syncSubscriptionToDatabase(userId, result.customerInfo);
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

		const result = await presentPaywallIfNeeded();

		if (result.customerInfo) {
			const newIsPro = checkProEntitlement(result.customerInfo);
			const status = getSubscriptionStatus(result.customerInfo);

			if (newIsPro || !get().isPro) {
				set({
					isPro: newIsPro,
					status,
					customerInfo: result.customerInfo,
				});
			}

			const { userId } = get();
			if (userId) {
				await syncSubscriptionToDatabase(userId, result.customerInfo);
			}

			if (result.purchased && !get().isPro) {
				setTimeout(() => get().refreshSubscription(), 3000);
			}

			return newIsPro || get().isPro;
		}

		return false;
	},

	showCustomerCenter: async () => {
		await presentCustomerCenter();
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
