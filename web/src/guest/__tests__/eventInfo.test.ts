import { mapsUrl, scheduleItems } from "../gallery/eventInfoModel";

describe("scheduleItems", () => {
	it("drops entries missing a time, title, or with an unparsable time", () => {
		expect(
			scheduleItems([
				{ time: "2026-10-09T18:00:00Z", title: "Dinner" },
				{ time: "2026-10-09T20:00:00Z", title: "" },
				{ time: "not-a-date", title: "Cake" },
				{ title: "No time" },
				"not an object",
			])
		).toEqual([{ time: "2026-10-09T18:00:00Z", title: "Dinner" }]);
	});

	it("returns an empty list for non-array input", () => {
		expect(scheduleItems(null)).toEqual([]);
	});

	it("sorts entries chronologically", () => {
		expect(
			scheduleItems([
				{ time: "2026-10-09T20:00:00Z", title: "Cake" },
				{ time: "2026-10-09T18:00:00Z", title: "Dinner" },
			])
		).toEqual([
			{ time: "2026-10-09T18:00:00Z", title: "Dinner" },
			{ time: "2026-10-09T20:00:00Z", title: "Cake" },
		]);
	});
});

describe("mapsUrl", () => {
	it("builds a Google Maps search URL for the location", () => {
		expect(mapsUrl("Oslo, Norway")).toBe(
			"https://www.google.com/maps/search/?api=1&query=Oslo%2C%20Norway"
		);
	});
});
