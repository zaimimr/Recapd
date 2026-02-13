jest.mock("@/lib/storage", () => ({ uploadMedia: jest.fn() }));

import { getAvatarColor } from "@/lib/colors";
import { safeDate } from "@/lib/dateUtils";
import { FREE_MAX_VIDEO_DURATION_MS, PRO_MAX_VIDEO_DURATION_MS } from "@/lib/mediaLibrary";
import { generateUploadId } from "@/lib/uploadQueue";
import { formatDuration } from "@/lib/utils";

jest.mock("expo-image-picker", () => ({}));
jest.mock("expo-media-library", () => ({}));

describe("safeDate", () => {
	const before = Date.now();

	function isRecentDate(date: Date) {
		const t = date.getTime();
		return t >= before && t <= Date.now();
	}

	it("returns current date for null", () => {
		expect(isRecentDate(safeDate(null))).toBe(true);
	});

	it("returns current date for undefined", () => {
		expect(isRecentDate(safeDate(undefined))).toBe(true);
	});

	it("returns current date for empty string", () => {
		expect(isRecentDate(safeDate(""))).toBe(true);
	});

	it("returns current date for 0 (falsy)", () => {
		expect(isRecentDate(safeDate(0))).toBe(true);
	});

	it("returns the same Date object when given a valid Date", () => {
		const d = new Date("2024-06-15T12:00:00Z");
		expect(safeDate(d)).toBe(d);
	});

	it("parses a valid ISO string", () => {
		const result = safeDate("2024-01-01T00:00:00Z");
		expect(result.getTime()).toBe(new Date("2024-01-01T00:00:00Z").getTime());
	});

	it("parses a valid timestamp number", () => {
		const ts = 1700000000000;
		expect(safeDate(ts).getTime()).toBe(ts);
	});

	it("returns current date for NaN-producing string", () => {
		expect(isRecentDate(safeDate("not-a-date"))).toBe(true);
	});

	it("returns current date for negative timestamp", () => {
		expect(isRecentDate(safeDate(-1))).toBe(true);
	});

	it("returns current date for timestamp exceeding max", () => {
		expect(isRecentDate(safeDate(8640000000000001))).toBe(true);
	});

	it("accepts timestamp at the max boundary", () => {
		expect(safeDate(8640000000000000).getTime()).toBe(8640000000000000);
	});
});

describe("formatDuration", () => {
	it("formats 0ms as 0:00", () => {
		expect(formatDuration(0)).toBe("0:00");
	});

	it("formats 5000ms as 0:05", () => {
		expect(formatDuration(5000)).toBe("0:05");
	});

	it("formats 500ms as 0:01 (rounds up)", () => {
		expect(formatDuration(500)).toBe("0:01");
	});

	it("formats 65000ms as 1:05", () => {
		expect(formatDuration(65000)).toBe("1:05");
	});

	it("formats 125000ms as 2:05", () => {
		expect(formatDuration(125000)).toBe("2:05");
	});

	it("formats 3661000ms with hours as 1:01:01", () => {
		expect(formatDuration(3661000)).toBe("1:01:01");
	});

	it("returns 0:00 for negative values", () => {
		expect(formatDuration(-1000)).toBe("0:00");
	});

	it("returns 0:00 for NaN", () => {
		expect(formatDuration(NaN)).toBe("0:00");
	});

	it("returns 0:00 for Infinity", () => {
		expect(formatDuration(Infinity)).toBe("0:00");
	});

	it("returns 0:00 for -Infinity", () => {
		expect(formatDuration(-Infinity)).toBe("0:00");
	});
});

describe("getAvatarColor", () => {
	it("returns a valid hex color", () => {
		expect(getAvatarColor("Alice")).toMatch(/^#[0-9a-f]{6}$/);
	});

	it("is deterministic for the same name", () => {
		expect(getAvatarColor("Bob")).toBe(getAvatarColor("Bob"));
	});

	it("returns a color for empty string", () => {
		expect(getAvatarColor("")).toMatch(/^#[0-9a-f]{6}$/);
	});

	it("empty string hashes to index 0", () => {
		expect(getAvatarColor("")).toBe("#f87171");
	});

	it("produces different colors for different names", () => {
		const colors = new Set(["Alice", "Bob", "Charlie", "Dave"].map(getAvatarColor));
		expect(colors.size).toBeGreaterThan(1);
	});
});

describe("generateUploadId", () => {
	it("starts with upload_ prefix", () => {
		expect(generateUploadId()).toMatch(/^upload_/);
	});

	it("matches expected format: upload_{timestamp}_{random}", () => {
		expect(generateUploadId()).toMatch(/^upload_\d+_[a-z0-9]+$/);
	});

	it("produces unique IDs on consecutive calls", () => {
		const ids = new Set(Array.from({ length: 20 }, () => generateUploadId()));
		expect(ids.size).toBe(20);
	});
});

describe("video duration constants", () => {
	it("PRO_MAX_VIDEO_DURATION_MS is 300 seconds", () => {
		expect(PRO_MAX_VIDEO_DURATION_MS).toBe(300000);
	});

	it("FREE_MAX_VIDEO_DURATION_MS is 30 seconds", () => {
		expect(FREE_MAX_VIDEO_DURATION_MS).toBe(30000);
	});
});
