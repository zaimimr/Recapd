import { extensionFor, originalObjectPath, thumbObjectPath } from "@/lib/upload/storage";

describe("originalObjectPath", () => {
	it("uses event/owner/media-id key matching RLS prefix", () => {
		expect(originalObjectPath("evt", "owner", "med", "photo.heic", "image/heic")).toBe(
			"evt/owner/med.heic"
		);
	});

	it("falls back to mime when filename has no extension", () => {
		expect(originalObjectPath("evt", "owner", "med", "noext", "image/jpeg")).toBe(
			"evt/owner/med.jpg"
		);
	});

	it("keeps HEIC extension intact", () => {
		expect(originalObjectPath("evt", "owner", "med", "IMG_0001.HEIC", "image/heic")).toBe(
			"evt/owner/med.heic"
		);
	});

	it("uses mov extension for QuickTime videos", () => {
		expect(originalObjectPath("evt", "owner", "med", "clip.mov", "video/quicktime")).toBe(
			"evt/owner/med.mov"
		);
	});
});

describe("thumbObjectPath", () => {
	it("uses event/owner/media-id_thumb.jpg key", () => {
		expect(thumbObjectPath("evt", "owner", "med")).toBe("evt/owner/med_thumb.jpg");
	});
});

describe("extensionFor", () => {
	it("prefers filename extension when present", () => {
		expect(extensionFor("foo.png", "image/jpeg")).toBe("png");
	});

	it("falls back to mime type when filename lacks an extension", () => {
		expect(extensionFor("foo", "image/webp")).toBe("webp");
	});
});
