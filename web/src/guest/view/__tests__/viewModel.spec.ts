import { describe, expect, it } from "vitest";
import { fullUrlFor, parseViewResponse, thumbUrlMap } from "../viewModel";

const photo = {
	id: "p1",
	media_type: "photo",
	width: 4000,
	height: 3000,
	duration_milliseconds: null,
	captured_at: "2026-09-01T10:00:00Z",
	uploader: { display_name: "Ada" },
	thumb: "https://x.supabase.co/storage/v1/object/sign/thumbnails/a.jpg?token=t",
	display: "https://x.supabase.co/storage/v1/render/image/sign/event-photos/a.jpg?token=d",
};

const video = {
	id: "v1",
	media_type: "video",
	width: 1920,
	height: 1080,
	duration_milliseconds: 12000,
	captured_at: "2026-09-01T11:00:00Z",
	uploader: null,
	thumb: "https://x.supabase.co/storage/v1/object/sign/thumbnails/v.jpg?token=t",
	display: null,
};

const event = {
	title: "Summer party",
	starts_at: "2026-09-01T08:00:00Z",
	ends_at: "2026-09-01T23:00:00Z",
	timezone: "Europe/Oslo",
	participant_count: 12,
};

describe("parseViewResponse", () => {
	it("maps the edge function payload into view items", () => {
		const data = parseViewResponse({ event, items: [photo, video], truncated: false });
		expect(data.event).toEqual(event);
		expect(data.truncated).toBe(false);
		expect(data.items).toEqual([
			{ ...photo, media_type: "photo" },
			{ ...video, media_type: "video" },
		]);
	});

	it("drops entries without an id or with an unknown media type", () => {
		const data = parseViewResponse({
			event,
			items: [photo, { ...photo, id: "" }, { ...photo, id: "x", media_type: "audio" }, null],
		});
		expect(data.items.map((item) => item.id)).toEqual(["p1"]);
	});

	it("never carries storage paths or extra fields through", () => {
		const data = parseViewResponse({
			event,
			items: [{ ...photo, storage_path: "e/a.jpg", original: "https://orig" }],
		});
		expect(Object.keys(data.items[0]).sort()).toEqual(
			[
				"captured_at",
				"display",
				"duration_milliseconds",
				"height",
				"id",
				"media_type",
				"thumb",
				"uploader",
				"width",
			].sort()
		);
	});

	it("defaults missing fields safely", () => {
		const data = parseViewResponse({
			event: { title: "T", starts_at: "2026-09-01T08:00:00Z" },
			items: [{ id: "a", media_type: "photo" }],
		});
		expect(data.event.participant_count).toBe(0);
		expect(data.event.timezone).toBeNull();
		expect(data.truncated).toBe(false);
		expect(data.items[0]).toMatchObject({
			thumb: null,
			display: null,
			uploader: null,
			width: null,
			duration_milliseconds: null,
		});
	});

	it("throws on a payload without an event", () => {
		expect(() => parseViewResponse({ items: [] })).toThrow();
		expect(() => parseViewResponse(null)).toThrow();
	});
});

describe("thumbUrlMap", () => {
	it("keys thumbnails by id and skips missing ones", () => {
		const data = parseViewResponse({ event, items: [photo, { ...video, thumb: null }] });
		expect(thumbUrlMap(data.items)).toEqual({ p1: photo.thumb });
	});
});

describe("fullUrlFor", () => {
	it("uses the display url for photos", () => {
		const [item] = parseViewResponse({ event, items: [photo] }).items;
		expect(fullUrlFor(item)).toBe(photo.display);
	});

	it("falls back to the thumbnail when a photo has no display url", () => {
		const [item] = parseViewResponse({ event, items: [{ ...photo, display: null }] }).items;
		expect(fullUrlFor(item)).toBe(photo.thumb);
	});

	it("never returns a playable url for videos", () => {
		const [item] = parseViewResponse({ event, items: [video] }).items;
		expect(fullUrlFor(item)).toBeNull();
	});
});
