import type { CustomerInfo, PurchasesOffering } from "react-native-purchases";
import { create } from "zustand";
import {
	classifyOffering,
	configureBilling,
	fetchCustomerInfo,
	fetchOfferings,
	fetchPerEventPro,
	listenCustomerInfo,
	type PaywallPackage,
	type ProState,
	purchase,
	readProState,
	recordPerEventPro,
	restorePurchases,
	syncProStateToSupabase,
	teardownBilling,
} from "@/lib/subscription";

type State = ProState & {
	ready: boolean;
	configuring: boolean;
	offering: PurchasesOffering | null;
	packages: PaywallPackage[];
	userId: string | null;
	lastError: string | null;
};

type Actions = {
	init: (userId: string) => Promise<void>;
	teardown: () => Promise<void>;
	refresh: () => Promise<void>;
	loadOfferings: () => Promise<void>;
	purchase: (
		pkg: PaywallPackage,
		eventId?: string
	) => Promise<{ success: boolean; cancelled?: boolean; error?: string }>;
	restore: () => Promise<{ success: boolean; error?: string }>;
	hasProForEvent: (eventId: string) => boolean;
};

const initialState: State = {
	tier: "free",
	subscriptionActive: false,
	expiresAt: null,
	willRenew: false,
	perEventPro: [],
	ready: false,
	configuring: false,
	offering: null,
	packages: [],
	userId: null,
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
			set({ configuring: false, ready: true });
			return;
		}
		listenerCleanup?.();
		listenerCleanup = listenCustomerInfo((info) => {
			void applyInfo(info, userId, set, get);
		});
		const info = await fetchCustomerInfo();
		await applyInfo(info, userId, set, get);
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
		await applyInfo(info, userId, set, get);
	},

	loadOfferings: async () => {
		const offering = await fetchOfferings();
		set({
			offering,
			packages: offering ? classifyOffering(offering) : [],
		});
	},

	purchase: async (pkg, eventId) => {
		const result = await purchase(pkg.package, eventId);
		const userId = get().userId;
		if (result.success && pkg.kind === "per_event" && userId && eventId) {
			await recordPerEventPro(userId, eventId);
			set({ perEventPro: [...get().perEventPro, eventId] });
		}
		if (result.success && result.customerInfo) {
			await applyInfo(result.customerInfo, userId, set, get);
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
			await applyInfo(result.customerInfo, get().userId, set, get);
		}
		if (!result.success) {
			set({ lastError: result.error ?? "Restore failed" });
		}
		return { success: result.success, error: result.error };
	},

	hasProForEvent: (eventId) => {
		const { subscriptionActive, perEventPro } = get();
		return subscriptionActive || perEventPro.includes(eventId);
	},
}));

async function applyInfo(
	info: CustomerInfo | null,
	userId: string | null,
	set: (partial: Partial<State>) => void,
	get: () => State & Actions
): Promise<void> {
	let perEventIds = get().perEventPro;
	if (userId) {
		const fetched = await fetchPerEventPro(userId);
		if (fetched.length > 0 || perEventIds.length === 0) {
			perEventIds = fetched;
		}
	}
	const state = readProState(info, perEventIds);
	set(state);
	if (userId) {
		await syncProStateToSupabase(userId, state);
	}
}
