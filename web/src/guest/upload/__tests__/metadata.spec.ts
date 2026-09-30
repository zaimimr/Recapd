import { describe, expect, it } from "vitest";
import { pickDurationMs, readContainerDurationMs, resolveCapturedAt } from "../metadata";

const lastModified = Date.parse("2026-09-29T18:00:00Z");
const now = new Date("2026-09-30T12:00:00Z");

describe("resolveCapturedAt", () => {
	it("prefers the EXIF DateTimeOriginal", () => {
		const exif = new Date("2026-09-28T20:15:00Z");
		expect(resolveCapturedAt(exif, lastModified, now).toISOString()).toBe(exif.toISOString());
	});
	it("falls back to lastModified when EXIF is missing", () => {
		expect(resolveCapturedAt(undefined, lastModified, now).getTime()).toBe(lastModified);
	});
	it("falls back to lastModified when EXIF is invalid", () => {
		expect(resolveCapturedAt(new Date(Number.NaN), lastModified, now).getTime()).toBe(lastModified);
		expect(resolveCapturedAt("2026:09:28 20:15:00", lastModified, now).getTime()).toBe(
			lastModified
		);
		expect(resolveCapturedAt(new Date(0), lastModified, now).getTime()).toBe(lastModified);
	});
	it("uses now when nothing usable exists", () => {
		expect(resolveCapturedAt(undefined, 0, now).getTime()).toBe(now.getTime());
	});
});

function box(type: string, body: Uint8Array): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(8 + body.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, out.length);
	for (let index = 0; index < 4; index += 1) out[4 + index] = type.charCodeAt(index);
	out.set(body, 8);
	return out;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
	let offset = 0;
	for (const part of parts) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
}

function mvhdV0(timescale: number, duration: number): Uint8Array<ArrayBuffer> {
	const body = new Uint8Array(100);
	const view = new DataView(body.buffer);
	view.setUint32(12, timescale);
	view.setUint32(16, duration);
	return box("mvhd", body);
}

function mvhdV1(timescale: number, duration: number): Uint8Array<ArrayBuffer> {
	const body = new Uint8Array(112);
	const view = new DataView(body.buffer);
	body[0] = 1;
	view.setUint32(20, timescale);
	view.setBigUint64(24, BigInt(duration));
	return box("mvhd", body);
}

describe("readContainerDurationMs", () => {
	it("reads the movie header duration", async () => {
		const file = concat(box("ftyp", new Uint8Array(12)), box("moov", mvhdV0(600, 27000)));
		expect(await readContainerDurationMs(new Blob([file]))).toBe(45000);
	});
	it("finds moov after mdat and reads version 1 headers", async () => {
		const file = concat(
			box("ftyp", new Uint8Array(12)),
			box("mdat", new Uint8Array(5000)),
			box("moov", concat(box("udta", new Uint8Array(20)), mvhdV1(1000, 30020)))
		);
		expect(await readContainerDurationMs(new Blob([file]))).toBe(30020);
	});
	it("returns null for files without a movie header", async () => {
		expect(await readContainerDurationMs(new Blob([new Uint8Array(64)]))).toBeNull();
		expect(await readContainerDurationMs(new Blob([box("ftyp", new Uint8Array(12))]))).toBeNull();
	});
});

describe("pickDurationMs", () => {
	it("uses the longer duration when both are known", () => {
		expect(pickDurationMs(30000, 31200)).toBe(31200);
		expect(pickDurationMs(45000, 30000)).toBe(45000);
	});
	it("uses whichever is known", () => {
		expect(pickDurationMs(null, 3000)).toBe(3000);
		expect(pickDurationMs(3000, null)).toBe(3000);
		expect(pickDurationMs(null, null)).toBeNull();
	});
});
