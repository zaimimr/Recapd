import { describe, expect, it } from "vitest";
import { mapsUrl, scheduleItems } from "../gallery/eventInfoModel";

describe("scheduleItems", () => {
	it("keeps only items with a valid time and a non-empty title", () => {
		const raw = [
			{ time: "2026-10-10T18:00:00Z", title: "Dinner" },
			{ time: "not-a-date", title: "Broken" },
			{ time: "2026-10-10T20:00:00Z", title: "   " },
			{ time: "2026-10-10T20:00:00Z" },
			"not-an-object",
		];
		expect(scheduleItems(raw)).toEqual([{ time: "2026-10-10T18:00:00Z", title: "Dinner" }]);
	});

	it("sorts items chronologically", () => {
		const raw = [
			{ time: "2026-10-10T20:00:00Z", title: "Later" },
			{ time: "2026-10-10T18:00:00Z", title: "Earlier" },
		];
		expect(scheduleItems(raw).map((item) => item.title)).toEqual(["Earlier", "Later"]);
	});

	it("returns an empty array for non-array input", () => {
		expect(scheduleItems(null)).toEqual([]);
		expect(scheduleItems(undefined)).toEqual([]);
		expect(scheduleItems("nope")).toEqual([]);
	});
});

describe("mapsUrl", () => {
	it("builds a Google Maps search URL for the location", () => {
		expect(mapsUrl("Oslo, Norway")).toBe(
			"https://www.google.com/maps/search/?api=1&query=Oslo%2C%20Norway"
		);
	});
});
