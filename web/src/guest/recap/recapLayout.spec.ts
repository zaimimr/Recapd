import { describe, expect, it } from "vitest";
import { coverCrop, fitText, RECAP_MAX_TILES, RECAP_WIDTH, recapTiles } from "./recapLayout";

describe("recapTiles", () => {
	it("returns nothing for zero photos", () => {
		expect(recapTiles(0)).toEqual([]);
	});

	it("caps at the max tile count", () => {
		expect(recapTiles(40)).toHaveLength(RECAP_MAX_TILES);
	});

	it("keeps every tile inside the canvas width", () => {
		for (let count = 1; count <= RECAP_MAX_TILES; count += 1) {
			for (const tile of recapTiles(count)) {
				expect(tile.x).toBeGreaterThanOrEqual(0);
				expect(tile.x + tile.size).toBeLessThanOrEqual(RECAP_WIDTH);
			}
		}
	});

	it("centers a short last row", () => {
		const tiles = recapTiles(5);
		const last = tiles.slice(3);
		const left = last[0].x;
		const right = RECAP_WIDTH - (last[1].x + last[1].size);
		expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
	});
});

describe("coverCrop", () => {
	it("crops landscape to a centered square", () => {
		expect(coverCrop(400, 200)).toEqual({ sx: 100, sy: 0, side: 200 });
	});

	it("crops portrait to a centered square", () => {
		expect(coverCrop(200, 400)).toEqual({ sx: 0, sy: 100, side: 200 });
	});
});

describe("fitText", () => {
	const measure = (value: string) => value.length * 10;

	it("keeps text that fits", () => {
		expect(fitText("Party", 100, measure)).toBe("Party");
	});

	it("truncates with an ellipsis", () => {
		const result = fitText("A very long party name", 100, measure);
		expect(result.endsWith("…")).toBe(true);
		expect(measure(result)).toBeLessThanOrEqual(100);
	});
});
