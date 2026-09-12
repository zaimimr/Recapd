import { differenceInCalendarDays, isFuture, isPast, isWithinInterval } from "date-fns";
import type { PillTone } from "@/components/ui";
import type { Event } from "@/types/database";

export type EventStatusKey = "live" | "upcoming" | "ended" | "expired";

export interface EventStatus {
	key: EventStatusKey;
	label: string;
	tone: PillTone;
	/** Live is the only state that earns the pulsing dot. */
	dot: boolean;
}

const STATUS: Record<EventStatusKey, EventStatus> = {
	live: { key: "live", label: "Live", tone: "live", dot: true },
	upcoming: { key: "upcoming", label: "Upcoming", tone: "warning", dot: false },
	ended: { key: "ended", label: "Ended", tone: "neutral", dot: false },
	expired: { key: "expired", label: "Expired", tone: "neutral", dot: false },
};

export function getEventStatus(event: Pick<Event, "starts_at" | "ends_at" | "status">): EventStatus {
	if (event.status === "expired") return STATUS.expired;

	const now = new Date();
	const startsAt = new Date(event.starts_at);
	const endsAt = new Date(event.ends_at);

	if (isWithinInterval(now, { start: startsAt, end: endsAt })) return STATUS.live;
	if (isFuture(startsAt)) return STATUS.upcoming;
	if (isPast(endsAt)) return STATUS.ended;
	return STATUS.ended;
}

/**
 * Days until the album deletes itself. Null when the event has no expiry set.
 * Never returns a negative number; an album past expiry reads as 0.
 */
export function daysUntilExpiry(expiresAt: string | null | undefined): number | null {
	if (!expiresAt) return null;
	return Math.max(0, differenceInCalendarDays(new Date(expiresAt), new Date()));
}

export function expiryTone(days: number | null): PillTone {
	if (days === null) return "neutral";
	if (days <= 2) return "danger";
	if (days <= 5) return "warning";
	return "neutral";
}

export function expiryLabel(days: number | null): string | null {
	if (days === null) return null;
	if (days === 0) return "Closes today";
	if (days === 1) return "1 day left";
	return `${days} days left`;
}
