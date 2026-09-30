import { describe, expect, it } from "vitest";
import {
	BATCH_SIZE,
	batchLabel,
	planBatches,
	progressPercent,
	shouldStreamToDisk,
	zipName,
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
