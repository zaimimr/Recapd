import { addDays, max } from "date-fns";

export function safeDate(value: string | number | Date | undefined | null): Date {
	if (!value) return new Date();
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime()) || date.getTime() < 0 || date.getTime() > 8640000000000000) {
		return new Date();
	}
	return date;
}

export const EVENT_RETENTION_DAYS = 14;

export function computeEventExpiry(
	endsAt: string | number | Date,
	createdAt?: string | number | Date | null
): Date {
	const anchor = max([safeDate(endsAt), safeDate(createdAt)]);
	return addDays(anchor, EVENT_RETENTION_DAYS);
}
