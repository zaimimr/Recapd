import { describe, expect, it } from "vitest";
import { checkFile, formatBytes, formatDuration } from "../limits";

const limits = { maxFileSizeBytes: 524288000, maxVideoDurationMs: 30000 };
const MB = 1024 * 1024;

describe("checkFile", () => {
	it("accepts a photo within the size limit", () => {
		expect(checkFile({ size: 5 * MB }, { mediaType: "photo", durationMs: null }, limits)).toEqual({
			ok: true,
		});
	});
	it("accepts a video exactly at the limits", () => {
		expect(
			checkFile({ size: 524288000 }, { mediaType: "video", durationMs: 30000 }, limits)
		).toEqual({ ok: true });
	});
	it("rejects an oversized file and names the limit", () => {
		expect(
			checkFile({ size: 612 * MB }, { mediaType: "video", durationMs: 10000 }, limits)
		).toEqual({ ok: false, reason: "too_large", message: "Video is 612 MB, max is 500 MB" });
	});
	it("rejects a video over the duration limit and names the limit", () => {
		expect(checkFile({ size: 20 * MB }, { mediaType: "video", durationMs: 45000 }, limits)).toEqual(
			{ ok: false, reason: "too_long", message: "Video is 45 s, max is 30 s" }
		);
	});
	it("rounds a barely-over duration up so it never reads as equal", () => {
		const result = checkFile({ size: MB }, { mediaType: "video", durationMs: 30020 }, limits);
		expect(result).toEqual({
			ok: false,
			reason: "too_long",
			message: "Video is 31 s, max is 30 s",
		});
	});
	it("rejects a video whose duration could not be read", () => {
		expect(checkFile({ size: MB }, { mediaType: "video", durationMs: null }, limits)).toEqual({
			ok: false,
			reason: "unsupported",
			message: "Could not read this video's length. Try a different file.",
		});
	});
	it("rejects unsupported files", () => {
		expect(checkFile({ size: MB }, { mediaType: null, durationMs: null }, limits)).toMatchObject({
			ok: false,
			reason: "unsupported",
		});
	});
	it("uses minutes for Pro limits", () => {
		const pro = { maxFileSizeBytes: 5368709120, maxVideoDurationMs: 300000 };
		expect(checkFile({ size: MB }, { mediaType: "video", durationMs: 312000 }, pro)).toMatchObject({
			message: "Video is 5 min 12 s, max is 5 min",
		});
	});
});

describe("formatBytes", () => {
	it("formats megabytes and gigabytes", () => {
		expect(formatBytes(500 * MB)).toBe("500 MB");
		expect(formatBytes(5368709120)).toBe("5 GB");
		expect(formatBytes(1.25 * 1024 * MB)).toBe("1.3 GB");
		expect(formatBytes(500 * MB + 1)).toBe("500.1 MB");
	});
});

describe("formatDuration", () => {
	it("formats seconds and minutes", () => {
		expect(formatDuration(30000)).toBe("30 s");
		expect(formatDuration(300000)).toBe("5 min");
		expect(formatDuration(65000)).toBe("1 min 5 s");
	});
});
