import { describe, expect, it, vi } from "vitest";
import {
	BATCH_SIZE,
	batchLabel,
	type DownloadItem,
	planBatches,
	planZipParts,
	progressPercent,
	saveZipPart,
	shouldStreamToDisk,
	ZIP_PART_MAX_BYTES,
	zipName,
	zipPartName,
} from "../downloadAll";

const MB = 1024 * 1024;

function sized(sizes: (number | null)[]) {
	return sizes.map((file_size_bytes) => ({ file_size_bytes }));
}

describe("planBatches", () => {
	it("slices 187 items into batches of 20 with a short last batch", () => {
		const batches = planBatches(sized(Array(187).fill(MB)));
		expect(BATCH_SIZE).toBe(20);
		expect(batches).toHaveLength(10);
		expect(batches[0]).toEqual({ start: 0, end: 20 });
		expect(batches[1]).toEqual({ start: 20, end: 40 });
		expect(batches[9]).toEqual({ start: 180, end: 187 });
	});

	it("covers every item exactly once", () => {
		const batches = planBatches(sized(Array(41).fill(null)));
		const covered = batches.flatMap(({ start, end }) =>
			Array.from({ length: end - start }, (_, offset) => start + offset)
		);
		expect(covered).toEqual(Array.from({ length: 41 }, (_, index) => index));
	});

	it("returns no batches for no items", () => {
		expect(planBatches([])).toEqual([]);
	});

	it("closes a batch early when it would pass the byte cap", () => {
		const batches = planBatches(sized([100 * MB, 100 * MB, 100 * MB, MB]), 20, 250 * MB);
		expect(batches).toEqual([
			{ start: 0, end: 2 },
			{ start: 2, end: 4 },
		]);
	});

	it("keeps an item bigger than the cap in a batch of its own", () => {
		const batches = planBatches(sized([MB, 900 * MB, MB]), 20, 250 * MB);
		expect(batches).toEqual([
			{ start: 0, end: 1 },
			{ start: 1, end: 2 },
			{ start: 2, end: 3 },
		]);
	});
});

describe("batchLabel", () => {
	it("labels a range with one-based numbers", () => {
		expect(batchLabel({ start: 20, end: 40 }, 187)).toBe("Save 21-40 of 187");
	});

	it("labels a batch of one item", () => {
		expect(batchLabel({ start: 186, end: 187 }, 187)).toBe("Save 187 of 187");
	});

	it("labels a gallery that fits in one batch", () => {
		expect(batchLabel({ start: 0, end: 7 }, 7)).toBe("Save all 7");
	});
});

describe("progressPercent", () => {
	it("uses bytes when the total size is known", () => {
		expect(progressPercent({ done: 1, total: 4, bytes: 30, totalBytes: 120 })).toBe(25);
	});

	it("falls back to item counts when sizes are unknown", () => {
		expect(progressPercent({ done: 3, total: 4, bytes: 0, totalBytes: 0 })).toBe(75);
	});

	it("never passes 100 and handles an empty total", () => {
		expect(progressPercent({ done: 5, total: 4, bytes: 200, totalBytes: 100 })).toBe(100);
		expect(progressPercent({ done: 0, total: 0, bytes: 0, totalBytes: 0 })).toBe(0);
	});

	it("rounds down so it only reads 100 when finished", () => {
		expect(progressPercent({ done: 0, total: 3, bytes: 999, totalBytes: 1000 })).toBe(99);
	});
});

describe("zip helpers", () => {
	it("names the zip after the join code", () => {
		expect(zipName("W6DD5K")).toBe("recapd-W6DD5K.zip");
	});

	it("streams to disk only for large galleries", () => {
		expect(shouldStreamToDisk(sized([400 * MB, 99 * MB]))).toBe(false);
		expect(shouldStreamToDisk(sized([400 * MB, 200 * MB]))).toBe(true);
		expect(shouldStreamToDisk(sized([null, null]))).toBe(false);
	});
});

describe("planZipParts", () => {
	it("keeps a small gallery in one part", () => {
		expect(planZipParts(sized([MB, 2 * MB, 3 * MB]))).toEqual([{ start: 0, end: 3 }]);
	});

	it("starts a new part before passing about 400 MB", () => {
		expect(ZIP_PART_MAX_BYTES).toBe(400 * MB);
		expect(planZipParts(sized([300 * MB, 300 * MB, 50 * MB, 40 * MB]))).toEqual([
			{ start: 0, end: 1 },
			{ start: 1, end: 4 },
		]);
	});

	it("counts unknown sizes as 50 MB", () => {
		expect(planZipParts(sized(Array(9).fill(null)))).toEqual([
			{ start: 0, end: 8 },
			{ start: 8, end: 9 },
		]);
	});

	it("does not cap the number of items in a part", () => {
		expect(planZipParts(sized(Array(500).fill(MB / 2)))).toEqual([{ start: 0, end: 500 }]);
	});

	it("keeps an item bigger than a part on its own", () => {
		expect(planZipParts(sized([MB, 900 * MB, MB]))).toEqual([
			{ start: 0, end: 1 },
			{ start: 1, end: 2 },
			{ start: 2, end: 3 },
		]);
	});

	it("covers every item exactly once", () => {
		const parts = planZipParts(sized([null, 390 * MB, 20 * MB, null, 399 * MB, MB]));
		const covered = parts.flatMap(({ start, end }) =>
			Array.from({ length: end - start }, (_, offset) => start + offset)
		);
		expect(covered).toEqual([0, 1, 2, 3, 4, 5]);
	});
});

describe("zipPartName", () => {
	it("keeps the plain name when there is one part", () => {
		expect(zipPartName("W6DD5K", 0, 1)).toBe("recapd-W6DD5K.zip");
	});

	it("numbers parts from one", () => {
		expect(zipPartName("W6DD5K", 0, 3)).toBe("recapd-W6DD5K-part1.zip");
		expect(zipPartName("W6DD5K", 2, 3)).toBe("recapd-W6DD5K-part3.zip");
	});
});

describe("saveZipPart", () => {
	const items: DownloadItem[] = [
		{ storage_path: "e/u/a.jpg", captured_at: "2026-09-30T10:00:00Z", media_type: "photo" },
		{ storage_path: "e/u/b.jpg", captured_at: "2026-09-30T10:01:00Z", media_type: "photo" },
	];
	const names = ["a.jpg", "b.jpg"];

	function run(fetchImpl: typeof fetch) {
		const tracker = { onBytes: vi.fn(), onItemDone: vi.fn(), onItemFailed: vi.fn() };
		const deliver = vi.fn();
		const saved = saveZipPart(
			items,
			names,
			"recapd-TEST.zip",
			{
				originalUrl: async (path) => `https://example.test/${path}`,
				fetchImpl,
				signal: new AbortController().signal,
			},
			tracker,
			{ deliver }
		);
		return { saved, tracker, deliver };
	}

	it("saves nothing when every item fails", async () => {
		const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }));
		const { saved, tracker, deliver } = run(fetchImpl as unknown as typeof fetch);
		expect(await saved).toBe(0);
		expect(deliver).not.toHaveBeenCalled();
		expect(tracker.onItemFailed).toHaveBeenCalledTimes(2);
		expect(tracker.onItemDone).not.toHaveBeenCalled();
	});

	it("saves the ZIP with the items that worked", async () => {
		const fetchImpl = vi.fn(async (url: string) =>
			url.endsWith("a.jpg")
				? new Response(new Uint8Array([1, 2, 3]), { status: 200 })
				: new Response(null, { status: 404 })
		);
		const { saved, tracker, deliver } = run(fetchImpl as unknown as typeof fetch);
		expect(await saved).toBe(1);
		expect(tracker.onItemFailed).toHaveBeenCalledTimes(1);
		expect(deliver).toHaveBeenCalledTimes(1);
		const [blob, name] = deliver.mock.calls[0];
		expect(name).toBe("recapd-TEST.zip");
		expect((blob as Blob).size).toBeGreaterThan(3);
	});
});
