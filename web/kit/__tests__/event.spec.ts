import { describe, expect, it } from "vitest";
import {
	buildJoinUrl,
	fitTitle,
	formatDateLabel,
	normalizeCode,
	resolveTimeZone,
	titleFontSize,
} from "../event";
import { isKitFormat, isPrintFormat } from "../formats";

describe("normalizeCode", () => {
	it("uppercases and strips non-alphanumerics", () => {
		expect(normalizeCode("abc123")).toBe("ABC123");
		expect(normalizeCode(" ab-c 1 23 ")).toBe("ABC123");
	});
	it("rejects wrong length and garbage", () => {
		expect(normalizeCode("ABC12")).toBeNull();
		expect(normalizeCode("ABC1234")).toBeNull();
		expect(normalizeCode("<script>")).toBeNull();
		expect(normalizeCode(undefined)).toBeNull();
	});
});

describe("resolveTimeZone", () => {
	it("keeps valid IANA zones", () => {
		expect(resolveTimeZone("Europe/Oslo")).toBe("Europe/Oslo");
	});
	it("falls back to UTC on invalid or missing zones", () => {
		expect(resolveTimeZone("Mars/Base")).toBe("UTC");
		expect(resolveTimeZone(undefined)).toBe("UTC");
	});
});

describe("formatDateLabel", () => {
	it("uses the given zone so after-midnight events keep their local date", () => {
		expect(formatDateLabel("2026-10-10T22:30:00Z", "Europe/Oslo")).toBe("Sun, Oct 11 · 12:30 AM");
		expect(formatDateLabel("2026-10-10T22:30:00Z", "UTC")).toBe("Sat, Oct 10 · 10:30 PM");
	});
});

describe("fitTitle and titleFontSize", () => {
	it("truncates long titles with an ellipsis", () => {
		const long = "A".repeat(80);
		expect(fitTitle(long)).toBe(`${"A".repeat(59)}…`);
		expect(fitTitle("Short")).toBe("Short");
	});
	it("counts emoji as single characters", () => {
		const title = `${"🎉".repeat(70)}`;
		expect(Array.from(fitTitle(title)).length).toBe(60);
	});
	it("steps font size down for longer titles", () => {
		expect(titleFontSize("Party", 100)).toBe(100);
		expect(titleFontSize("A".repeat(30), 100)).toBe(75);
		expect(titleFontSize("A".repeat(50), 100)).toBe(60);
	});
});

describe("formats and join url", () => {
	it("guards formats", () => {
		expect(isKitFormat("story")).toBe(true);
		expect(isKitFormat("banner")).toBe(false);
		expect(isPrintFormat("table")).toBe(true);
		expect(isPrintFormat("social")).toBe(false);
	});
	it("builds the https join url", () => {
		expect(buildJoinUrl("ABC123")).toBe("https://recapd.app/join/ABC123");
	});
});
