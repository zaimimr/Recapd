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

export type EntitlementSummary = {
	isPro: boolean;
	tier: "free" | "monthly" | "annual";
	hasProForEvent: (eventId: string) => boolean;
	guestCap: number;
	videoSecondsCap: number;
	eventWindowMs: number;
	mediaTtlDays: number | null;
	activeEventCap: number;
	allowsCustomBranding: boolean;
	allowsOutsideWindowUploads: (eventId: string) => boolean;
	allowsFullResDownload: (eventId: string) => boolean;
	allowsLiveSlideshow: (eventId: string) => boolean;
	allowsMultiHost: (eventId: string) => boolean;
};

export function buildEntitlement(): EntitlementSummary {
	const state = useSubscriptionStore.getState();
	const isPro = state.subscriptionActive;
	const perEvent = (id: string) => isPro || state.perEventPro.includes(id);

	return {
		isPro,
		tier: state.tier,
		hasProForEvent: perEvent,
		guestCap: isPro ? Number.POSITIVE_INFINITY : FREE_GUEST_CAP,
		videoSecondsCap: isPro ? PRO_VIDEO_SECONDS : FREE_VIDEO_SECONDS,
		eventWindowMs: isPro
			? PRO_EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000
			: FREE_EVENT_WINDOW_HOURS * 60 * 60 * 1000,
		mediaTtlDays: isPro ? null : FREE_MEDIA_TTL_DAYS,
		activeEventCap: isPro ? Number.POSITIVE_INFINITY : FREE_ACTIVE_EVENT_LIMIT,
		allowsCustomBranding: isPro,
		allowsOutsideWindowUploads: perEvent,
		allowsFullResDownload: perEvent,
		allowsLiveSlideshow: perEvent,
		allowsMultiHost: perEvent,
	};
}

export function useEntitlement(): EntitlementSummary {
	const tier = useSubscriptionStore((s) => s.tier);
	const subscriptionActive = useSubscriptionStore((s) => s.subscriptionActive);
	const perEventPro = useSubscriptionStore((s) => s.perEventPro);

	const isPro = subscriptionActive;
	const hasProForEvent = (id: string) => isPro || perEventPro.includes(id);

	return {
		isPro,
		tier,
		hasProForEvent,
		guestCap: isPro ? Number.POSITIVE_INFINITY : FREE_GUEST_CAP,
		videoSecondsCap: isPro ? PRO_VIDEO_SECONDS : FREE_VIDEO_SECONDS,
		eventWindowMs: isPro
			? PRO_EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000
			: FREE_EVENT_WINDOW_HOURS * 60 * 60 * 1000,
		mediaTtlDays: isPro ? null : FREE_MEDIA_TTL_DAYS,
		activeEventCap: isPro ? Number.POSITIVE_INFINITY : FREE_ACTIVE_EVENT_LIMIT,
		allowsCustomBranding: isPro,
		allowsOutsideWindowUploads: hasProForEvent,
		allowsFullResDownload: hasProForEvent,
		allowsLiveSlideshow: hasProForEvent,
		allowsMultiHost: hasProForEvent,
	};
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
