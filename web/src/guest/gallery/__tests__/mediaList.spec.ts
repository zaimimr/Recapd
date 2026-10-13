import { describe, expect, it } from "vitest";
import {
	applyMediaChange,
	countLabel,
	createLoadBuffer,
	formatDuration,
	type GalleryItem,
	sortNewestFirst,
} from "../mediaList";

function item(overrides: Partial<GalleryItem> = {}): GalleryItem {
	const id = overrides.id ?? "a";
	return {
		id,
		event_id: "e",
		uploaded_by_user_id: "u1",
		captured_at: "2026-09-30T10:00:00Z",
		uploaded_at: "2026-09-30T10:05:00Z",
		media_type: "photo",
		width: 100,
		height: 100,
		duration_milliseconds: null,
		file_size_bytes: null,
		storage_path: `e/u1/1_${id}.jpg`,
		thumbnail_path: `e/u1/1_${id}_thumb.jpg`,
		visibility: "shared",
		deleted_at: null,
		uploader: { display_name: "Ana" },
		...overrides,
	};
}

describe("sortNewestFirst", () => {
	it("orders by captured_at descending", () => {
		const older = item({ id: "old", captured_at: "2026-09-29T10:00:00Z" });
		const newer = item({ id: "new", captured_at: "2026-09-30T12:00:00Z" });
		expect(sortNewestFirst([older, newer]).map((entry) => entry.id)).toEqual(["new", "old"]);
	});

	it("breaks ties on uploaded_at, then id, so the order is stable", () => {
		const first = item({ id: "b", uploaded_at: "2026-09-30T10:06:00Z" });
		const second = item({ id: "a", uploaded_at: "2026-09-30T10:06:00Z" });
		const third = item({ id: "c", uploaded_at: "2026-09-30T10:01:00Z" });
		expect(sortNewestFirst([third, first, second]).map((entry) => entry.id)).toEqual([
			"a",
			"b",
			"c",
		]);
	});

	it("does not mutate the input", () => {
		const input = [item({ id: "x", captured_at: "2026-01-01T00:00:00Z" }), item({ id: "y" })];
		sortNewestFirst(input);
		expect(input[0].id).toBe("x");
	});
});

describe("applyMediaChange", () => {
	it("inserts a new shared item in sorted position", () => {
		const existing = [item({ id: "a", captured_at: "2026-09-30T09:00:00Z" })];
		const incoming = item({ id: "b", captured_at: "2026-09-30T11:00:00Z" });
		const next = applyMediaChange(existing, { type: "INSERT", row: incoming });
		expect(next.map((entry) => entry.id)).toEqual(["b", "a"]);
	});

	it("does not duplicate an item that is already present by id", () => {
		const existing = [item({ id: "a" })];
		const next = applyMediaChange(existing, { type: "INSERT", row: item({ id: "a" }) });
		expect(next).toHaveLength(1);
	});

	it("merges an insert with the same storage_path into the existing entry", () => {
		const existing = [item({ id: "a", storage_path: "e/u1/same.jpg" })];
		const incoming = item({ id: "b", storage_path: "e/u1/same.jpg", uploader: null });
		const next = applyMediaChange(existing, { type: "INSERT", row: incoming });
		expect(next).toHaveLength(1);
		expect(next[0].id).toBe("b");
		expect(next[0].uploader).toEqual({ display_name: "Ana" });
	});

	it("ignores inserts that are not shared or are deleted", () => {
		const existing = [item({ id: "a" })];
		const privateRow = item({ id: "p", visibility: "private" });
		const deletedRow = item({ id: "d", deleted_at: "2026-09-30T12:00:00Z" });
		expect(applyMediaChange(existing, { type: "INSERT", row: privateRow })).toHaveLength(1);
		expect(applyMediaChange(existing, { type: "INSERT", row: deletedRow })).toHaveLength(1);
	});

	it("updates an item and keeps the uploader when the row has none", () => {
		const existing = [item({ id: "a", thumbnail_path: null })];
		const updated = item({ id: "a", thumbnail_path: "e/u1/new_thumb.jpg", uploader: null });
		const next = applyMediaChange(existing, { type: "UPDATE", row: updated });
		expect(next[0].thumbnail_path).toBe("e/u1/new_thumb.jpg");
		expect(next[0].uploader).toEqual({ display_name: "Ana" });
	});

	it("removes an item when an update soft deletes or hides it", () => {
		const existing = [item({ id: "a" }), item({ id: "b" })];
		const softDeleted = item({ id: "a", deleted_at: "2026-09-30T12:00:00Z" });
		const hidden = item({ id: "b", visibility: "private" });
		expect(
			applyMediaChange(existing, { type: "UPDATE", row: softDeleted }).map((entry) => entry.id)
		).toEqual(["b"]);
		expect(
			applyMediaChange(existing, { type: "UPDATE", row: hidden }).map((entry) => entry.id)
		).toEqual(["a"]);
	});

	it("removes an item on delete by id", () => {
		const existing = [item({ id: "a" }), item({ id: "b" })];
		const next = applyMediaChange(existing, { type: "DELETE", id: "a" });
		expect(next.map((entry) => entry.id)).toEqual(["b"]);
	});

	it("returns the same array when a delete matches nothing", () => {
		const existing = [item({ id: "a" })];
		expect(applyMediaChange(existing, { type: "DELETE", id: "zzz" })).toBe(existing);
	});
});

describe("formatDuration", () => {
	it("formats minutes and zero padded seconds", () => {
		expect(formatDuration(3000)).toBe("0:03");
		expect(formatDuration(65_400)).toBe("1:05");
		expect(formatDuration(300_000)).toBe("5:00");
	});
	it("returns null when the duration is unknown", () => {
		expect(formatDuration(null)).toBeNull();
		expect(formatDuration(0)).toBeNull();
	});
	it("never shows 0:00 for a very short clip", () => {
		expect(formatDuration(200)).toBe("0:01");
	});
});

describe("countLabel", () => {
	it("uses the singular for one", () => {
		expect(countLabel(1, "photo", "photos")).toBe("1 photo");
		expect(countLabel(0, "photo", "photos")).toBe("0 photos");
		expect(countLabel(12, "guest", "guests")).toBe("12 guests");
	});
});

describe("createLoadBuffer", () => {
	it("replays changes received during a load onto the fetched snapshot", () => {
		const buffer = createLoadBuffer();
		buffer.begin();
		buffer.record({
			type: "INSERT",
			row: item({ id: "late", captured_at: "2026-09-30T12:00:00Z" }),
		});
		buffer.record({ type: "DELETE", id: "gone" });
		const fetched = [item({ id: "gone" }), item({ id: "kept" })];
		expect(buffer.finish(fetched).map((entry) => entry.id)).toEqual(["late", "kept"]);
	});

	it("does not replay a change twice when the snapshot already has it", () => {
		const buffer = createLoadBuffer();
		buffer.begin();
		buffer.record({ type: "INSERT", row: item({ id: "a" }) });
		expect(buffer.finish([item({ id: "a" })])).toHaveLength(1);
	});

	it("ignores changes recorded outside a load and starts empty on each load", () => {
		const buffer = createLoadBuffer();
		buffer.record({ type: "DELETE", id: "a" });
		buffer.begin();
		expect(buffer.finish([item({ id: "a" })])).toHaveLength(1);
		buffer.begin();
		buffer.record({ type: "DELETE", id: "a" });
		buffer.begin();
		expect(buffer.finish([item({ id: "a" })])).toHaveLength(1);
	});
});
