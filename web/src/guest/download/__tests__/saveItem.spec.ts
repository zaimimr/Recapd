import { describe, expect, it } from "vitest";
import { extensionOf, fileNameFor, mimeFor, uniqueNames, withDownloadParam } from "../saveItem";

describe("extensionOf", () => {
	it("reads the lowercase extension from a storage path", () => {
		expect(extensionOf("e/p/1727000000000_ab12cd34.JPG")).toBe("jpg");
		expect(extensionOf("e/p/1727000000000_ab12cd34.mov")).toBe("mov");
	});

	it("falls back by media type when there is no extension", () => {
		expect(extensionOf("e/p/noext", "photo")).toBe("jpg");
		expect(extensionOf("e/p/noext", "video")).toBe("mp4");
	});
});

describe("mimeFor", () => {
	it("maps common photo and video extensions", () => {
		expect(mimeFor("jpg")).toBe("image/jpeg");
		expect(mimeFor("jpeg")).toBe("image/jpeg");
		expect(mimeFor("heic")).toBe("image/heic");
		expect(mimeFor("png")).toBe("image/png");
		expect(mimeFor("mov")).toBe("video/quicktime");
		expect(mimeFor("mp4")).toBe("video/mp4");
	});

	it("falls back to a generic type", () => {
		expect(mimeFor("xyz")).toBe("application/octet-stream");
	});
});

describe("fileNameFor", () => {
	it("uses the captured time in the given time zone and the original extension", () => {
		expect(
			fileNameFor(
				{
					storage_path: "e/p/1727000000000_ab12cd34.jpg",
					captured_at: "2026-09-22T12:02:00Z",
					media_type: "photo",
				},
				"Europe/Oslo"
			)
		).toBe("recapd-2026-09-22-1402.jpg");
	});

	it("pads single digits and keeps midnight as 00", () => {
		expect(
			fileNameFor(
				{
					storage_path: "e/p/1_x.MOV",
					captured_at: "2026-01-05T00:07:00Z",
					media_type: "video",
				},
				"UTC"
			)
		).toBe("recapd-2026-01-05-0007.mov");
	});

	it("falls back to a plain name when the date is invalid", () => {
		expect(
			fileNameFor({ storage_path: "e/p/1_x.png", captured_at: "nope", media_type: "photo" }, "UTC")
		).toBe("recapd.png");
	});
});

describe("uniqueNames", () => {
	it("adds a counter before the extension for repeated names", () => {
		expect(uniqueNames(["a.jpg", "a.jpg", "b.jpg", "a.jpg"])).toEqual([
			"a.jpg",
			"a-2.jpg",
			"b.jpg",
			"a-3.jpg",
		]);
	});

	it("does not collide with a name that already has a counter", () => {
		expect(uniqueNames(["a-2.jpg", "a.jpg", "a.jpg"])).toEqual(["a-2.jpg", "a.jpg", "a-3.jpg"]);
	});
});

describe("withDownloadParam", () => {
	it("adds an encoded download name to a signed url", () => {
		expect(
			withDownloadParam("https://x.supabase.co/object/sign/a.jpg?token=t", "recapd 1.jpg")
		).toBe("https://x.supabase.co/object/sign/a.jpg?token=t&download=recapd+1.jpg");
	});
});
