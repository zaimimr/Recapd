export type ViewItem = {
	id: string;
	media_type: "photo" | "video";
	width: number | null;
	height: number | null;
	duration_milliseconds: number | null;
	captured_at: string;
	uploader: { display_name: string } | null;
	thumb: string | null;
	display: string | null;
};

export type ViewEvent = {
	title: string;
	starts_at: string;
	ends_at: string | null;
	timezone: string | null;
	participant_count: number;
};

export type ViewData = { event: ViewEvent; items: ViewItem[]; truncated: boolean };

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
	return typeof value === "object" && value !== null;
}

function text(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toItem(raw: unknown): ViewItem | null {
	if (!isObject(raw)) return null;
	const id = text(raw.id);
	const mediaType = raw.media_type;
	if (!id || (mediaType !== "photo" && mediaType !== "video")) return null;
	const uploaderName = isObject(raw.uploader) ? text(raw.uploader.display_name) : null;
	return {
		id,
		media_type: mediaType,
		width: num(raw.width),
		height: num(raw.height),
		duration_milliseconds: num(raw.duration_milliseconds),
		captured_at: text(raw.captured_at) ?? "",
		uploader: uploaderName ? { display_name: uploaderName } : null,
		thumb: text(raw.thumb),
		display: text(raw.display),
	};
}

export function parseViewResponse(raw: unknown): ViewData {
	if (!isObject(raw) || !isObject(raw.event)) throw new Error("Invalid view response");
	const event = raw.event;
	const items = Array.isArray(raw.items) ? raw.items : [];
	return {
		event: {
			title: text(event.title) ?? "",
			starts_at: text(event.starts_at) ?? "",
			ends_at: text(event.ends_at),
			timezone: text(event.timezone),
			participant_count: num(event.participant_count) ?? 0,
		},
		items: items.map(toItem).filter((item): item is ViewItem => item !== null),
		truncated: raw.truncated === true,
	};
}

export function thumbUrlMap(items: ViewItem[]): Record<string, string> {
	const urls: Record<string, string> = {};
	for (const item of items) if (item.thumb) urls[item.id] = item.thumb;
	return urls;
}

export function fullUrlFor(item: ViewItem): string | null {
	if (item.media_type !== "photo") return null;
	return item.display ?? item.thumb;
}

export class ViewNotFoundError extends Error {}

export async function fetchGuestView(code: string): Promise<ViewData> {
	const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
	const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/guest-view`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			apikey: key,
			Authorization: `Bearer ${key}`,
		},
		body: JSON.stringify({ code }),
	});
	if (response.status === 404) throw new ViewNotFoundError("Event not available");
	if (!response.ok) throw new Error(`guest-view failed with ${response.status}`);
	return parseViewResponse(await response.json());
}
