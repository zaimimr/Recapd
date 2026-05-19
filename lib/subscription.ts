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

export type SubscriptionEntitlement = "free" | "pro";
export type SubscriptionBillingPeriod = "per_event" | "monthly" | "yearly";

export type ProState = {
	entitlement: SubscriptionEntitlement;
	billingPeriod: SubscriptionBillingPeriod | null;
	expiresAt: Date | null;
	willRenew: boolean;
	productId: string | null;
};

export type ProductKind = "per_event" | "monthly" | "annual";

export type PaywallPackage = {
	kind: ProductKind;
	priceLabel: string;
	rawPrice: number;
	currencyCode: string;
	package: PurchasesPackage;
};

export type SubscriptionLimits = {
	entitlement: SubscriptionEntitlement;
	maxGuests: number | null;
	maxEventWindowHours: number | null;
	maxVideoDurationMs: number | null;
	maxActiveEvents: number | null;
	mediaTtlDays: number | null;
	allowsFullResolutionDownload: boolean;
	allowsMultiHost: boolean;
	allowsCustomBranding: boolean;
	allowsLiveSlideshow: boolean;
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

function billingPeriodFor(productId: string | null): SubscriptionBillingPeriod | null {
	if (!productId) return null;
	if (productId === PRODUCT_PER_EVENT_PRO) return "per_event";
	if (productId === PRODUCT_MONTHLY) return "monthly";
	if (productId === PRODUCT_ANNUAL) return "yearly";
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

export function readProState(info: CustomerInfo | null): ProState {
	if (!info) {
		return {
			entitlement: "free",
			billingPeriod: null,
			expiresAt: null,
			willRenew: false,
			productId: null,
		};
	}
	const sub = info.entitlements.active[ENTITLEMENT_PRO];
	const productId = sub?.productIdentifier ?? null;
	const isActive = Boolean(sub?.isActive);

	return {
		entitlement: isActive ? "pro" : "free",
		billingPeriod: isActive ? billingPeriodFor(productId) : null,
		expiresAt: sub?.expirationDate ? new Date(sub.expirationDate) : null,
		willRenew: Boolean(sub?.willRenew),
		productId,
	};
}

export async function fetchCurrentEntitlement(userId: string): Promise<SubscriptionEntitlement> {
	const { data, error } = await supabase.rpc("current_entitlement", {
		target_user_id: userId,
	});
	if (error || !data) return "free";
	return data as SubscriptionEntitlement;
}

export async function canDownloadFullResolution(eventId: string): Promise<boolean> {
	const { data, error } = await supabase.rpc("can_download_full_resolution", {
		target_event_id: eventId,
	});
	if (error || data == null) return false;
	return Boolean(data);
}

export async function fetchSubscriptionLimits(): Promise<SubscriptionLimits[]> {
	const { data, error } = await supabase
		.from("subscription_limits")
		.select(
			"entitlement, max_guests, max_event_window_hours, max_video_duration_ms, max_active_events, media_ttl_days, allows_full_resolution_download, allows_multi_host, allows_custom_branding, allows_live_slideshow"
		);
	if (error || !data) return [];
	return data.map((row) => ({
		entitlement: row.entitlement as SubscriptionEntitlement,
		maxGuests: row.max_guests,
		maxEventWindowHours: row.max_event_window_hours,
		maxVideoDurationMs: row.max_video_duration_ms,
		maxActiveEvents: row.max_active_events,
		mediaTtlDays: row.media_ttl_days,
		allowsFullResolutionDownload: row.allows_full_resolution_download,
		allowsMultiHost: row.allows_multi_host,
		allowsCustomBranding: row.allows_custom_branding,
		allowsLiveSlideshow: row.allows_live_slideshow,
	}));
}

export async function syncProStateToSupabase(
	userId: string,
	state: ProState,
	revenueCatAppUserId: string | null
): Promise<void> {
	const platform = Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";

	const { error } = await supabase.from("subscriptions").upsert(
		{
			user_id: userId,
			entitlement: state.entitlement,
			billing_period: state.billingPeriod,
			expires_at: state.expiresAt?.toISOString() ?? null,
			revenuecat_app_user_id: revenueCatAppUserId,
			revenuecat_entitlement_id: state.entitlement === "pro" ? ENTITLEMENT_PRO : null,
			platform: state.entitlement === "pro" ? platform : null,
			product_id: state.productId,
			last_synced_at: new Date().toISOString(),
		},
		{ onConflict: "user_id" }
	);

	if (error) {
		console.warn("syncProStateToSupabase failed", error.message);
	}
}
