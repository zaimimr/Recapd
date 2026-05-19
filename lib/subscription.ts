import { Platform } from "react-native";
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from "react-native-purchases";
import {
	ENTITLEMENT_PRO,
	PRODUCT_ANNUAL,
	PRODUCT_MONTHLY,
	PRODUCT_PER_EVENT_PRO,
} from "./billing/config";
import * as provider from "./billing/provider";
import { supabase } from "./supabase";

export type SubscriptionTier = "free" | "monthly" | "annual";

export type ProState = {
	tier: SubscriptionTier;
	subscriptionActive: boolean;
	expiresAt: Date | null;
	willRenew: boolean;
	perEventPro: string[];
};

export type ProductKind = "per_event" | "monthly" | "annual";

export type PaywallPackage = {
	kind: ProductKind;
	priceLabel: string;
	rawPrice: number;
	currencyCode: string;
	package: PurchasesPackage;
};

export async function configureBilling(userId: string): Promise<boolean> {
	return provider.configure(userId);
}

export async function teardownBilling(): Promise<void> {
	return provider.logOut();
}

export async function fetchOfferings(): Promise<PurchasesOffering | null> {
	return provider.getOfferings();
}

export async function fetchCustomerInfo(): Promise<CustomerInfo | null> {
	return provider.getCustomerInfo();
}

export function listenCustomerInfo(cb: (info: CustomerInfo) => void): () => void {
	return provider.addCustomerInfoListener(cb);
}

export async function purchase(
	pkg: PurchasesPackage,
	eventId?: string
): Promise<provider.PurchaseResult> {
	return provider.purchasePackage(pkg, eventId);
}

export async function restorePurchases() {
	return provider.restorePurchases();
}

function productKindFor(productId: string): ProductKind | null {
	if (productId === PRODUCT_PER_EVENT_PRO) return "per_event";
	if (productId === PRODUCT_MONTHLY) return "monthly";
	if (productId === PRODUCT_ANNUAL) return "annual";
	return null;
}

export function classifyOffering(offering: PurchasesOffering): PaywallPackage[] {
	const out: PaywallPackage[] = [];
	for (const pkg of offering.availablePackages) {
		const kind = productKindFor(pkg.product.identifier);
		if (!kind) continue;
		out.push({
			kind,
			priceLabel: pkg.product.priceString,
			rawPrice: pkg.product.price,
			currencyCode: pkg.product.currencyCode,
			package: pkg,
		});
	}
	const order: ProductKind[] = ["per_event", "annual", "monthly"];
	out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
	return out;
}

export function readProState(info: CustomerInfo | null, perEventPro: string[] = []): ProState {
	if (!info) {
		return {
			tier: "free",
			subscriptionActive: false,
			expiresAt: null,
			willRenew: false,
			perEventPro,
		};
	}
	const sub = info.entitlements.active[ENTITLEMENT_PRO];

	let tier: SubscriptionTier = "free";
	if (sub?.isActive) {
		tier = sub.productIdentifier === PRODUCT_ANNUAL ? "annual" : "monthly";
	}

	return {
		tier,
		subscriptionActive: Boolean(sub?.isActive),
		expiresAt: sub?.expirationDate ? new Date(sub.expirationDate) : null,
		willRenew: Boolean(sub?.willRenew),
		perEventPro,
	};
}

export async function fetchPerEventPro(userId: string): Promise<string[]> {
	const { data, error } = await supabase
		.from("event_pro_unlocks")
		.select("event_id")
		.eq("user_id", userId);
	if (error || !data) return [];
	return data.map((r) => r.event_id as string);
}

export async function recordPerEventPro(userId: string, eventId: string): Promise<void> {
	const { error } = await supabase.from("event_pro_unlocks").upsert(
		{
			user_id: userId,
			event_id: eventId,
			unlocked_at: new Date().toISOString(),
		},
		{ onConflict: "user_id,event_id" }
	);
	if (error) {
		console.warn("recordPerEventPro failed", error.message);
	}
}

export async function syncProStateToSupabase(userId: string, state: ProState): Promise<void> {
	const platform = Platform.OS === "ios" ? "ios" : "android";
	const tier = state.subscriptionActive ? "pro" : "free";

	const { error } = await supabase.from("subscriptions").upsert(
		{
			user_id: userId,
			tier,
			subscription_kind: state.subscriptionActive ? state.tier : null,
			expires_at: state.expiresAt?.toISOString() ?? null,
			will_renew: state.willRenew,
			platform: state.subscriptionActive ? platform : null,
			per_event_pro: state.perEventPro,
			updated_at: new Date().toISOString(),
		},
		{ onConflict: "user_id" }
	);

	if (error) {
		console.warn("syncProStateToSupabase failed", error.message);
	}
}
