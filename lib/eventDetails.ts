import { cacheDirectory, EncodingType, writeAsStringAsync } from "expo-file-system/legacy";
import { shareAsync } from "expo-sharing";
import type { Event, EventScheduleItem } from "@/types/database";

export const EVENT_DETAIL_LIMITS = {
	location: 200,
	dressCode: 120,
	details: 1000,
	scheduleItems: 20,
	scheduleTitle: 80,
} as const;

type EventDetailFields = Pick<Event, "location" | "dress_code" | "details" | "schedule">;

export function emptyToNull(value: string, maxLength: number): string | null {
	const trimmed = value.trim().slice(0, maxLength);
	return trimmed.length > 0 ? trimmed : null;
}

function isValidTime(value: unknown): value is string {
	return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

export function normalizeSchedule(raw: unknown): EventScheduleItem[] {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter(
			(item): item is EventScheduleItem =>
				!!item &&
				typeof item === "object" &&
				isValidTime((item as EventScheduleItem).time) &&
				typeof (item as EventScheduleItem).title === "string"
		)
		.map((item) => ({
			time: new Date(item.time).toISOString(),
			title: item.title.trim().slice(0, EVENT_DETAIL_LIMITS.scheduleTitle),
		}))
		.filter((item) => item.title.length > 0)
		.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
		.slice(0, EVENT_DETAIL_LIMITS.scheduleItems);
}

export function hasEventDetails(event: Partial<EventDetailFields>): boolean {
	return (
		!!event.location?.trim() ||
		!!event.dress_code?.trim() ||
		!!event.details?.trim() ||
		normalizeSchedule(event.schedule).length > 0
	);
}

export function formatCountdown(startsAt: string | Date, now: Date = new Date()): string | null {
	const diffMs = new Date(startsAt).getTime() - now.getTime();
	if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
	const totalMinutes = Math.ceil(diffMs / 60000);
	const days = Math.floor(totalMinutes / 1440);
	const hours = Math.floor((totalMinutes % 1440) / 60);
	const minutes = totalMinutes % 60;
	if (days > 0) return `Starts in ${days}d ${hours}h`;
	if (hours > 0) return `Starts in ${hours}h ${minutes}m`;
	return `Starts in ${minutes}m`;
}

export function buildMapsUrl(location: string, platform: string): string {
	const query = encodeURIComponent(location.trim());
	if (platform === "ios") return `https://maps.apple.com/?q=${query}`;
	if (platform === "android") return `geo:0,0?q=${query}`;
	return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function escapeIcsText(value: string): string {
	return value
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\r?\n/g, "\\n");
}

function formatIcsDate(value: string | Date): string {
	return new Date(value)
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}/, "");
}

function foldIcsLine(line: string): string {
	const chunks: string[] = [];
	let rest = line;
	while (rest.length > 74) {
		chunks.push(rest.slice(0, 74));
		rest = rest.slice(74);
	}
	chunks.push(rest);
	return chunks.join("\r\n ");
}

export function buildIcs(
	event: Pick<Event, "id" | "title" | "starts_at" | "ends_at"> & Partial<EventDetailFields>,
	now: Date = new Date()
): string {
	const descriptionParts: string[] = [];
	if (event.dress_code?.trim()) descriptionParts.push(`Dress code: ${event.dress_code.trim()}`);
	if (event.details?.trim()) descriptionParts.push(event.details.trim());
	const schedule = normalizeSchedule(event.schedule);
	if (schedule.length > 0) {
		descriptionParts.push(
			schedule
				.map(
					(item) =>
						`${new Date(item.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ${item.title}`
				)
				.join("\n")
		);
	}

	const lines = [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Recapd//Recapd//EN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		"BEGIN:VEVENT",
		`UID:${event.id}@recapd.app`,
		`DTSTAMP:${formatIcsDate(now)}`,
		`DTSTART:${formatIcsDate(event.starts_at)}`,
		`DTEND:${formatIcsDate(event.ends_at)}`,
		`SUMMARY:${escapeIcsText(event.title)}`,
	];
	if (event.location?.trim()) lines.push(`LOCATION:${escapeIcsText(event.location.trim())}`);
	if (descriptionParts.length > 0) {
		lines.push(`DESCRIPTION:${escapeIcsText(descriptionParts.join("\n\n"))}`);
	}
	lines.push("END:VEVENT", "END:VCALENDAR");

	return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

export async function shareEventToCalendar(
	event: Pick<Event, "id" | "title" | "starts_at" | "ends_at"> & Partial<EventDetailFields>
): Promise<void> {
	const uri = `${cacheDirectory}recapd-${event.id}.ics`;
	await writeAsStringAsync(uri, buildIcs(event), { encoding: EncodingType.UTF8 });
	await shareAsync(uri, {
		mimeType: "text/calendar",
		UTI: "com.apple.ical.ics",
		dialogTitle: "Add to calendar",
	});
}
