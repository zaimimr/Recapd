import {
  checkProEntitlement,
  configureRevenueCat,
  getCustomerInfo,
  getMonthlyPackage,
  getOfferings,
  getSubscriptionStatus,
  getYearlyPackage,
  presentCustomerCenter,
  presentPaywall,
  presentPaywallIfNeeded,
  purchasePackage,
  PurchaseResult,
  restorePurchases,
  setupCustomerInfoListener,
  syncSubscriptionToDatabase,
} from "@/lib/subscription";
import {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
} from "react-native-purchases";
import { create } from "zustand";

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

const IS_PAYMENTS_ENABLED = process.env.EXPO_PUBLIC_PAYMENTS_ENABLED === "true";

let listenerCleanup: (() => void) | null = null;

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  isInitialized: false,
  isLoading: false,
  isPro: false,
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

      const [customerInfo, offerings] = await Promise.all([
        getCustomerInfo(),
        getOfferings(),
      ]);

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
    } else {
      set({
        error: result.error || "No purchases to restore",
        isLoading: false,
      });
    }

    return result;
  },

  showPaywall: async () => {
    const result = await presentPaywall();

    if (result.customerInfo) {
      const isPro = checkProEntitlement(result.customerInfo);
      const status = getSubscriptionStatus(result.customerInfo);

      set({
        isPro,
        status,
        customerInfo: result.customerInfo,
      });
    }

    return result.presented && !!result.customerInfo;
  },

  showPaywallIfNeeded: async () => {
    const { isPro } = get();
    if (isPro) return false;

    const result = await presentPaywallIfNeeded();

    if (result.customerInfo) {
      const newIsPro = checkProEntitlement(result.customerInfo);
      const status = getSubscriptionStatus(result.customerInfo);

      set({
        isPro: newIsPro,
        status,
        customerInfo: result.customerInfo,
      });

      return newIsPro;
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
  if (!IS_PAYMENTS_ENABLED) {
    return true;
  }
  return useSubscriptionStore((state) => state.isPro);
}

export function useSubscriptionStatus(): SubscriptionStatus {
  return useSubscriptionStore((state) => state.status);
}
