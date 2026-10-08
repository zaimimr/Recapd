import {
	buildIcs,
	buildMapsUrl,
	emptyToNull,
	formatCountdown,
	fromEventDetailsDraft,
	hasEventDetails,
	normalizeSchedule,
	toEventDetailsDraft,
} from "@/lib/eventDetails";

describe("formatCountdown", () => {
	const now = new Date("2026-10-08T12:00:00Z");

	it("shows days and hours when more than a day away", () => {
		expect(formatCountdown("2026-10-10T16:00:00Z", now)).toBe("Starts in 2d 4h");
	});

	it("shows hours and minutes within a day", () => {
		expect(formatCountdown("2026-10-08T15:12:00Z", now)).toBe("Starts in 3h 12m");
	});

	it("shows minutes within an hour and rounds up partial minutes", () => {
		expect(formatCountdown("2026-10-08T12:04:30Z", now)).toBe("Starts in 5m");
	});

	it("returns null once started or for invalid input", () => {
		expect(formatCountdown("2026-10-08T12:00:00Z", now)).toBeNull();
		expect(formatCountdown("2026-10-08T11:00:00Z", now)).toBeNull();
		expect(formatCountdown("not a date", now)).toBeNull();
	});
});

describe("normalizeSchedule", () => {
	it("returns an empty list for non-arrays", () => {
		expect(normalizeSchedule(null)).toEqual([]);
		expect(normalizeSchedule({})).toEqual([]);
	});

	it("drops invalid items, trims titles and sorts by time", () => {
		const result = normalizeSchedule([
			{ time: "2026-10-08T20:00:00Z", title: "  Dinner  " },
			{ time: "bad", title: "Nope" },
			{ time: "2026-10-08T18:00:00Z", title: "Ceremony" },
			{ time: "2026-10-08T19:00:00Z", title: "   " },
			{ title: "No time" },
			"string",
		]);
		expect(result).toEqual([
			{ time: "2026-10-08T18:00:00.000Z", title: "Ceremony" },
			{ time: "2026-10-08T20:00:00.000Z", title: "Dinner" },
		]);
	});

	it("caps items at 20 and titles at 80 characters", () => {
		const items = Array.from({ length: 25 }, (_, i) => ({
			time: new Date(Date.UTC(2026, 9, 8, 0, i)).toISOString(),
			title: "x".repeat(100),
		}));
		const result = normalizeSchedule(items);
		expect(result).toHaveLength(20);
		expect(result[0].title).toHaveLength(80);
	});
});

describe("hasEventDetails", () => {
	it("is false when nothing is set", () => {
		expect(hasEventDetails({ location: null, dress_code: " ", details: null, schedule: [] })).toBe(
			false
		);
	});

	it("is true when any field is set", () => {
		expect(hasEventDetails({ location: "Oslo" })).toBe(true);
		expect(hasEventDetails({ schedule: [{ time: "2026-10-08T18:00:00Z", title: "Toast" }] })).toBe(
			true
		);
	});
});

describe("emptyToNull", () => {
	it("trims, caps and nulls empty strings", () => {
		expect(emptyToNull("   ", 10)).toBeNull();
		expect(emptyToNull("  hello  ", 10)).toBe("hello");
		expect(emptyToNull("abcdef", 3)).toBe("abc");
	});
});

describe("buildMapsUrl", () => {
	it("uses Apple Maps on iOS, geo on Android and Google Maps elsewhere", () => {
		expect(buildMapsUrl("Karl Johans gate 1, Oslo", "ios")).toBe(
			"https://maps.apple.com/?q=Karl%20Johans%20gate%201%2C%20Oslo"
		);
		expect(buildMapsUrl("Oslo", "android")).toBe("geo:0,0?q=Oslo");
		expect(buildMapsUrl("Oslo", "web")).toBe(
			"https://www.google.com/maps/search/?api=1&query=Oslo"
		);
	});
});

describe("buildIcs", () => {
	const base = {
		id: "evt-1",
		title: "Sarah, James; party",
		starts_at: "2026-10-10T16:00:00.000Z",
		ends_at: "2026-10-10T22:30:00.000Z",
	};
	const now = new Date("2026-10-08T12:00:00.000Z");

	it("builds a minimal VEVENT with escaped summary and UTC times", () => {
		const ics = buildIcs(base, now);
		expect(ics).toContain("BEGIN:VCALENDAR\r\n");
		expect(ics).toContain("UID:evt-1@recapd.app\r\n");
		expect(ics).toContain("DTSTAMP:20261008T120000Z\r\n");
		expect(ics).toContain("DTSTART:20261010T160000Z\r\n");
		expect(ics).toContain("DTEND:20261010T223000Z\r\n");
		expect(ics).toContain("SUMMARY:Sarah\\, James\\; party\r\n");
		expect(ics).not.toContain("LOCATION:");
		expect(ics).not.toContain("DESCRIPTION:");
		expect(ics.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n")).toBe(true);
	});

	it("includes location and a description with dress code and details", () => {
		const ics = buildIcs(
			{ ...base, location: "Oslo", dress_code: "Black tie", details: "Bring\nshoes" },
			now
		);
		expect(ics).toContain("LOCATION:Oslo\r\n");
		expect(ics).toContain("DESCRIPTION:Dress code: Black tie\\n\\nBring\\nshoes");
	});

	it("folds lines longer than 75 octets", () => {
		const ics = buildIcs({ ...base, details: "a".repeat(200) }, now);
		for (const line of ics.split("\r\n")) {
			expect(line.length).toBeLessThanOrEqual(75);
		}
		expect(ics).toContain("\r\n a");
	});
});

describe("event details draft", () => {
	it("round-trips and cleans fields for saving", () => {
		const draft = toEventDetailsDraft({ location: null, dress_code: "Smart", schedule: [] });
		expect(draft).toEqual({ location: "", dressCode: "Smart", details: "", schedule: [] });
		expect(
			fromEventDetailsDraft({
				...draft,
				location: "  Oslo ",
				schedule: [
					{ time: "2026-10-08T18:00:00Z", title: "" },
					{ time: "2026-10-08T19:00:00Z", title: "Toast" },
				],
			})
		).toEqual({
			location: "Oslo",
			dress_code: "Smart",
			details: null,
			schedule: [{ time: "2026-10-08T19:00:00.000Z", title: "Toast" }],
		});
	});
});
