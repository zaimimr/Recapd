import { useSubscriptionStore } from "@/store/subscriptionStore";
import {
	FREE_ACTIVE_EVENT_LIMIT,
	FREE_EVENT_WINDOW_HOURS,
	FREE_GUEST_CAP,
	FREE_MEDIA_TTL_DAYS,
	FREE_VIDEO_SECONDS,
	PRO_EVENT_WINDOW_DAYS,
	PRO_VIDEO_SECONDS,
} from "./billing/config";
import type { SubscriptionLimits } from "./subscription";

export type BillingPeriod = "per_event" | "monthly" | "yearly" | null;

export type EntitlementSummary = {
	isPro: boolean;
	billingPeriod: BillingPeriod;
	guestCap: number;
	videoSecondsCap: number;
	eventWindowMs: number;
	mediaTtlDays: number | null;
	activeEventCap: number;
	allowsCustomBranding: boolean;
	allowsOutsideWindowUploads: boolean;
	allowsFullResDownload: boolean;
	allowsLiveSlideshow: boolean;
	allowsMultiHost: boolean;
};

function unboundedOr(value: number | null): number {
	if (value == null) return Number.POSITIVE_INFINITY;
	return value;
}

function resolveSummary(
	isPro: boolean,
	billingPeriod: BillingPeriod,
	limits: SubscriptionLimits | null,
): EntitlementSummary {
	if (limits) {
		return {
			isPro,
			billingPeriod,
			guestCap: unboundedOr(limits.maxGuests),
			videoSecondsCap:
				limits.maxVideoDurationMs == null
					? Number.POSITIVE_INFINITY
					: Math.round(limits.maxVideoDurationMs / 1000),
			eventWindowMs:
				limits.maxEventWindowHours == null
					? Number.POSITIVE_INFINITY
					: limits.maxEventWindowHours * 60 * 60 * 1000,
			mediaTtlDays: limits.mediaTtlDays,
			activeEventCap: unboundedOr(limits.maxActiveEvents),
			allowsCustomBranding: limits.allowsCustomBranding,
			allowsOutsideWindowUploads: isPro,
			allowsFullResDownload: limits.allowsFullResolutionDownload,
			allowsLiveSlideshow: limits.allowsLiveSlideshow,
			allowsMultiHost: limits.allowsMultiHost,
		};
	}
	return {
		isPro,
		billingPeriod,
		guestCap: isPro ? Number.POSITIVE_INFINITY : FREE_GUEST_CAP,
		videoSecondsCap: isPro ? PRO_VIDEO_SECONDS : FREE_VIDEO_SECONDS,
		eventWindowMs: isPro
			? PRO_EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000
			: FREE_EVENT_WINDOW_HOURS * 60 * 60 * 1000,
		mediaTtlDays: isPro ? null : FREE_MEDIA_TTL_DAYS,
		activeEventCap: isPro ? Number.POSITIVE_INFINITY : FREE_ACTIVE_EVENT_LIMIT,
		allowsCustomBranding: isPro,
		allowsOutsideWindowUploads: isPro,
		allowsFullResDownload: isPro,
		allowsLiveSlideshow: isPro,
		allowsMultiHost: isPro,
	};
}

export function buildEntitlement(): EntitlementSummary {
	const state = useSubscriptionStore.getState();
	const isPro = state.entitlement === "pro";
	const limits = isPro ? state.limits.pro : state.limits.free;
	return resolveSummary(isPro, state.billingPeriod, limits);
}

export function useEntitlement(): EntitlementSummary {
	const entitlement = useSubscriptionStore((s) => s.entitlement);
	const billingPeriod = useSubscriptionStore((s) => s.billingPeriod);
	const limits = useSubscriptionStore((s) => s.limits);
	const isPro = entitlement === "pro";
	return resolveSummary(isPro, billingPeriod, isPro ? limits.pro : limits.free);
}

export function isWithinFreeWindow(start: Date, end: Date): boolean {
	const ms = end.getTime() - start.getTime();
	return ms <= FREE_EVENT_WINDOW_HOURS * 60 * 60 * 1000;
}

export function isVideoAllowed(durationSeconds: number, isPro: boolean): boolean {
	return durationSeconds <= (isPro ? PRO_VIDEO_SECONDS : FREE_VIDEO_SECONDS);
}

export function canAddGuest(currentCount: number, isPro: boolean): boolean {
	if (isPro) return true;
	return currentCount < FREE_GUEST_CAP;
}

export function canCreateAnotherEvent(activeEventCount: number, isPro: boolean): boolean {
	if (isPro) return true;
	return activeEventCount < FREE_ACTIVE_EVENT_LIMIT;
}

export function daysUntilExpiry(createdAt: Date, ttlDays: number): number {
	const expires = createdAt.getTime() + ttlDays * 24 * 60 * 60 * 1000;
	const ms = expires - Date.now();
	return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function parsePurchaseRequiredError(message: string | undefined): boolean {
	if (!message) return false;
	const msg = message.toLowerCase();
	return (
		msg.includes("guest cap") ||
		msg.includes("guest_cap") ||
		msg.includes("event window") ||
		msg.includes("event_window") ||
		msg.includes("video duration") ||
		msg.includes("video_duration") ||
		msg.includes("active event") ||
		msg.includes("active_event") ||
		msg.includes("entitlement")
	);
}
