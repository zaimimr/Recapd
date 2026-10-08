import type { ScheduleItem } from "../types";

export function scheduleItems(raw: unknown): ScheduleItem[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter(
			(item): item is ScheduleItem =>
				typeof item?.time === "string" &&
				typeof item?.title === "string" &&
				item.title.trim() !== "" &&
				!Number.isNaN(Date.parse(item.time))
		)
		.sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

export function mapsUrl(location: string): string {
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}
