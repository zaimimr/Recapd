import { describe, expect, it } from "vitest";
import { buildStoragePath, fileExtension, randomSuffix, resolveMedia, thumbPath } from "../paths";

describe("buildStoragePath", () => {
	it("matches the app format", () => {
		expect(buildStoragePath("ev", "pr", "jpg", 1700000000000, "abcd1234")).toBe(
			"ev/pr/1700000000000_abcd1234.jpg"
		);
	});
	it("generates an 8 character suffix by default", () => {
		const path = buildStoragePath("ev", "pr", "mp4");
		expect(path).toMatch(/^ev\/pr\/\d{13}_[a-z0-9]{8}\.mp4$/);
		expect(randomSuffix()).toMatch(/^[a-z0-9]{8}$/);
	});
});

describe("thumbPath", () => {
	it("replaces the extension with _thumb.jpg", () => {
		expect(thumbPath("ev/pr/1700000000000_abcd1234.mov")).toBe(
			"ev/pr/1700000000000_abcd1234_thumb.jpg"
		);
	});
	it("appends when there is no extension", () => {
		expect(thumbPath("ev/pr/1700000000000_abcd1234")).toBe(
			"ev/pr/1700000000000_abcd1234_thumb.jpg"
		);
	});
});

describe("fileExtension", () => {
	it("uses the lowercased file name extension", () => {
		expect(fileExtension("IMG_0001.JPEG", "image/jpeg")).toBe("jpeg");
		expect(fileExtension("clip.MOV", "video/quicktime")).toBe("mov");
	});
	it("falls back to the mime type", () => {
		expect(fileExtension("image", "image/png")).toBe("png");
		expect(fileExtension("photo.jfif", "image/jpeg")).toBe("jpg");
		expect(fileExtension("clip", "video/quicktime")).toBe("mov");
	});
});

describe("resolveMedia", () => {
	it("accepts allowlisted mime types", () => {
		expect(resolveMedia("a.jpg", "image/jpeg")).toEqual({
			mediaType: "photo",
			contentType: "image/jpeg",
			ext: "jpg",
		});
		expect(resolveMedia("b.mp4", "video/mp4")).toEqual({
			mediaType: "video",
			contentType: "video/mp4",
			ext: "mp4",
		});
	});
	it("maps empty or generic types from the extension", () => {
		expect(resolveMedia("c.HEIC", "")).toEqual({
			mediaType: "photo",
			contentType: "image/heic",
			ext: "heic",
		});
		expect(resolveMedia("d.mov", "application/octet-stream")).toEqual({
			mediaType: "video",
			contentType: "video/quicktime",
			ext: "mov",
		});
		expect(resolveMedia("e.m4v", "video/x-m4v")?.contentType).toBe("video/mp4");
	});
	it("rejects types outside the bucket allowlist", () => {
		expect(resolveMedia("f.webm", "video/webm")).toBeNull();
		expect(resolveMedia("g.gif", "image/gif")).toBeNull();
		expect(resolveMedia("h", "")).toBeNull();
	});
});
