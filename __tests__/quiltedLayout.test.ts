import { buildQuiltedLayout, dayKeyFromIso } from "@/components/grid/quiltedLayout";
import type { GalleryMediaItem } from "@/types/media";

function makeItem(
	overrides: Partial<GalleryMediaItem> & { id: string; capture_time: string }
): GalleryMediaItem {
	return {
		event_id: "e1",
		owner_id: "u1",
		upload_time: overrides.capture_time,
		is_video: false,
		duration_ms: null,
		storage_path: `originals/${overrides.id}`,
		thumb_path: `thumbs/${overrides.id}`,
		width: 1000,
		height: 1000,
		status: "ready",
		hidden_by_host_at: null,
		deleted_at: null,
		...overrides,
	};
}

describe("buildQuiltedLayout", () => {
	it("groups by day in chronological order", () => {
		const items: GalleryMediaItem[] = [
			makeItem({ id: "b", capture_time: "2026-05-19T18:00:00.000Z" }),
			makeItem({ id: "a", capture_time: "2026-05-19T08:00:00.000Z" }),
			makeItem({ id: "c", capture_time: "2026-05-20T09:00:00.000Z" }),
		];
		const layout = buildQuiltedLayout(items, 360, 3, 3);
		expect(layout.clusters.length).toBe(2);
		expect(layout.clusters[0].dayKey).toBe(dayKeyFromIso(items[1].capture_time));
		expect(layout.clusters[1].dayKey).toBe(dayKeyFromIso(items[2].capture_time));
	});

	it("places tiles with positive size for landscape and portrait", () => {
		const items: GalleryMediaItem[] = [
			makeItem({ id: "p", capture_time: "2026-05-19T10:00:00.000Z", width: 600, height: 1200 }),
			makeItem({ id: "l", capture_time: "2026-05-19T10:05:00.000Z", width: 1600, height: 900 }),
			makeItem({ id: "s", capture_time: "2026-05-19T10:10:00.000Z", width: 1000, height: 1000 }),
		];
		const layout = buildQuiltedLayout(items, 360, 3, 3);
		const tiles = layout.clusters[0].tiles;
		expect(tiles).toHaveLength(3);
		for (const tile of tiles) {
			expect(tile.width).toBeGreaterThan(0);
			expect(tile.height).toBeGreaterThan(0);
		}
	});

	it("produces a contentHeight that covers all clusters", () => {
		const items: GalleryMediaItem[] = Array.from({ length: 9 }, (_, i) =>
			makeItem({ id: `i${i}`, capture_time: `2026-05-19T1${i % 9}:00:00.000Z` })
		);
		const layout = buildQuiltedLayout(items, 360, 3, 3);
		const lastTile = layout.clusters.at(-1)?.tiles.at(-1);
		expect(layout.contentHeight).toBeGreaterThanOrEqual(
			(lastTile?.y ?? 0) + (lastTile?.height ?? 0)
		);
	});
});
