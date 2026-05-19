import type { CustomerInfo, PurchasesOffering } from "react-native-purchases";
import { create } from "zustand";
import {
	classifyOffering,
	configureBilling,
	fetchCurrentEntitlement,
	fetchCustomerInfo,
	fetchOfferings,
	fetchSubscriptionLimits,
	listenCustomerInfo,
	type PaywallPackage,
	type ProState,
	purchase,
	readProState,
	restorePurchases,
	type SubscriptionLimits,
	syncProStateToSupabase,
	teardownBilling,
} from "@/lib/subscription";

type State = ProState & {
	ready: boolean;
	configuring: boolean;
	offering: PurchasesOffering | null;
	packages: PaywallPackage[];
	userId: string | null;
	revenueCatAppUserId: string | null;
	limits: Record<"free" | "pro", SubscriptionLimits | null>;
	lastError: string | null;
};

type Actions = {
	init: (userId: string) => Promise<void>;
	teardown: () => Promise<void>;
	refresh: () => Promise<void>;
	loadOfferings: () => Promise<void>;
	loadLimits: () => Promise<void>;
	purchase: (
		pkg: PaywallPackage,
		eventId?: string
	) => Promise<{ success: boolean; cancelled?: boolean; error?: string }>;
	restore: () => Promise<{ success: boolean; error?: string }>;
};

const initialState: State = {
	entitlement: "free",
	billingPeriod: null,
	expiresAt: null,
	willRenew: false,
	productId: null,
	ready: false,
	configuring: false,
	offering: null,
	packages: [],
	userId: null,
	revenueCatAppUserId: null,
	limits: { free: null, pro: null },
	lastError: null,
};

let listenerCleanup: (() => void) | null = null;

export const useSubscriptionStore = create<State & Actions>((set, get) => ({
	...initialState,

	init: async (userId) => {
		if (get().configuring) return;
		set({ configuring: true, userId, lastError: null });
		const ok = await configureBilling(userId);
		if (!ok) {
			const entitlement = await fetchCurrentEntitlement(userId);
			set({
				configuring: false,
				ready: true,
				entitlement,
			});
			return;
		}
		listenerCleanup?.();
		listenerCleanup = listenCustomerInfo((info) => {
			void applyInfo(info, userId, set);
		});
		const info = await fetchCustomerInfo();
		await applyInfo(info, userId, set);
		set({ configuring: false, ready: true });
	},

	teardown: async () => {
		listenerCleanup?.();
		listenerCleanup = null;
		await teardownBilling();
		set({ ...initialState });
	},

	refresh: async () => {
		const { userId } = get();
		const info = await fetchCustomerInfo();
		await applyInfo(info, userId, set);
	},

	loadOfferings: async () => {
		const offering = await fetchOfferings();
		set({
			offering,
			packages: offering ? classifyOffering(offering) : [],
		});
	},

	loadLimits: async () => {
		const rows = await fetchSubscriptionLimits();
		const free = rows.find((r) => r.entitlement === "free") ?? null;
		const pro = rows.find((r) => r.entitlement === "pro") ?? null;
		set({ limits: { free, pro } });
	},

	purchase: async (pkg, eventId) => {
		const result = await purchase(pkg.package, eventId);
		const userId = get().userId;
		if (result.success && result.customerInfo) {
			await applyInfo(result.customerInfo, userId, set);
		}
		if (!result.success && !result.cancelled) {
			set({ lastError: result.error ?? "Purchase failed" });
		}
		return {
			success: result.success,
			cancelled: result.cancelled,
			error: result.error,
		};
	},

	restore: async () => {
		const result = await restorePurchases();
		if (result.success && result.customerInfo) {
			await applyInfo(result.customerInfo, get().userId, set);
		}
		if (!result.success) {
			set({ lastError: result.error ?? "Restore failed" });
		}
		return { success: result.success, error: result.error };
	},
}));

async function applyInfo(
	info: CustomerInfo | null,
	userId: string | null,
	set: (partial: Partial<State>) => void
): Promise<void> {
	const state = readProState(info);
	const rcAppUserId = info?.originalAppUserId ?? null;
	set({ ...state, revenueCatAppUserId: rcAppUserId });
	if (userId) {
		await syncProStateToSupabase(userId, state, rcAppUserId);
	}
}
