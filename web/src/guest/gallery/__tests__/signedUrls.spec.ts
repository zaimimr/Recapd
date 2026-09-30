import { describe, expect, it, vi } from "vitest";
import type { GalleryItem } from "../mediaList";
import {
	createSignedUrlResolver,
	pickThumbSource,
	SIGNED_URL_TTL_SECONDS,
	THUMBNAIL_TRANSFORM,
} from "../signedUrls";

type ItemInput = Pick<GalleryItem, "id" | "media_type" | "storage_path" | "thumbnail_path">;

function item(overrides: Partial<ItemInput> = {}): ItemInput {
	return {
		id: "a",
		media_type: "photo",
		storage_path: "e/u/1_a.jpg",
		thumbnail_path: "e/u/1_a_thumb.jpg",
		...overrides,
	};
}

describe("pickThumbSource", () => {
	it("uses the thumbnail when there is one", () => {
		expect(pickThumbSource(item())).toEqual({
			kind: "thumbnail",
			path: "e/u/1_a_thumb.jpg",
		});
	});

	it("uses a video thumbnail when there is one", () => {
		const video = item({ media_type: "video", storage_path: "e/u/1_a.mov" });
		expect(pickThumbSource(video).kind).toBe("thumbnail");
	});

	it("falls back to the transformed original for a photo without a thumbnail", () => {
		expect(pickThumbSource(item({ thumbnail_path: null }))).toEqual({
			kind: "transform",
			path: "e/u/1_a.jpg",
		});
		expect(THUMBNAIL_TRANSFORM).toEqual({ width: 720, height: 720, resize: "cover", quality: 60 });
	});

	it("shows a placeholder for HEIC or HEIF without a thumbnail", () => {
		expect(pickThumbSource(item({ thumbnail_path: null, storage_path: "e/u/1_a.HEIC" }))).toEqual({
			kind: "placeholder",
		});
		expect(pickThumbSource(item({ thumbnail_path: null, storage_path: "e/u/1_a.heif" }))).toEqual({
			kind: "placeholder",
		});
	});

	it("shows a placeholder for a video without a thumbnail", () => {
		const video = item({ media_type: "video", storage_path: "e/u/1_a.mp4", thumbnail_path: null });
		expect(pickThumbSource(video)).toEqual({ kind: "placeholder" });
	});
});

function fakeStorage() {
	const batch = vi.fn(async (paths: string[]) => ({
		data: paths.map((path) => ({
			path,
			signedUrl: `https://t/${path}?n=${batch.mock.calls.length}`,
		})),
		error: null,
	}));
	const single = vi.fn(async (path: string) => ({
		data: { signedUrl: `https://o/${path}?n=${single.mock.calls.length}` },
		error: null,
	}));
	const buckets: string[] = [];
	const storage = {
		from(bucket: string) {
			buckets.push(bucket);
			return { createSignedUrls: batch, createSignedUrl: single };
		},
	};
	return { storage, batch, single, buckets };
}

describe("createSignedUrlResolver", () => {
	it("signs all thumbnails in one batch call for one hour", async () => {
		const fake = fakeStorage();
		const resolver = createSignedUrlResolver(fake.storage, () => 0);
		const urls = await resolver.thumbnails([
			item({ id: "a", thumbnail_path: "e/u/a_thumb.jpg" }),
			item({ id: "b", thumbnail_path: "e/u/b_thumb.jpg" }),
		]);
		expect(fake.batch).toHaveBeenCalledTimes(1);
		expect(fake.batch).toHaveBeenCalledWith(
			["e/u/a_thumb.jpg", "e/u/b_thumb.jpg"],
			SIGNED_URL_TTL_SECONDS
		);
		expect(fake.buckets).toContain("thumbnails");
		expect(urls.a).toContain("e/u/a_thumb.jpg");
		expect(urls.b).toContain("e/u/b_thumb.jpg");
	});

	it("signs the transformed original for photos without a thumbnail and skips placeholders", async () => {
		const fake = fakeStorage();
		const resolver = createSignedUrlResolver(fake.storage, () => 0);
		const urls = await resolver.thumbnails([
			item({ id: "p", thumbnail_path: null, storage_path: "e/u/p.jpg" }),
			item({ id: "h", thumbnail_path: null, storage_path: "e/u/h.heic" }),
		]);
		expect(fake.batch).not.toHaveBeenCalled();
		expect(fake.single).toHaveBeenCalledTimes(1);
		expect(fake.single).toHaveBeenCalledWith("e/u/p.jpg", SIGNED_URL_TTL_SECONDS, {
			transform: THUMBNAIL_TRANSFORM,
		});
		expect(fake.buckets).toContain("event-photos");
		expect(urls.p).toContain("e/u/p.jpg");
		expect(urls.h).toBeUndefined();
	});

	it("reuses cached urls until 60 s before they expire", async () => {
		const fake = fakeStorage();
		let now = 0;
		const resolver = createSignedUrlResolver(fake.storage, () => now);
		const first = await resolver.thumbnails([item()]);
		now = SIGNED_URL_TTL_SECONDS * 1000 - 61_000;
		const second = await resolver.thumbnails([item()]);
		expect(fake.batch).toHaveBeenCalledTimes(1);
		expect(second.a).toBe(first.a);
		now = SIGNED_URL_TTL_SECONDS * 1000 - 59_000;
		const third = await resolver.thumbnails([item()]);
		expect(fake.batch).toHaveBeenCalledTimes(2);
		expect(third.a).not.toBe(first.a);
	});

	it("signs originals without a transform and caches them", async () => {
		const fake = fakeStorage();
		const resolver = createSignedUrlResolver(fake.storage, () => 0);
		const first = await resolver.original("e/u/v.mp4");
		const second = await resolver.original("e/u/v.mp4");
		expect(fake.single).toHaveBeenCalledTimes(1);
		expect(fake.single).toHaveBeenCalledWith("e/u/v.mp4", SIGNED_URL_TTL_SECONDS, undefined);
		expect(fake.buckets).toEqual(["event-photos"]);
		expect(second).toBe(first);
	});

	it("leaves out thumbnails the batch could not sign", async () => {
		const fake = fakeStorage();
		fake.batch.mockResolvedValueOnce({
			data: [
				{ path: "e/u/a_thumb.jpg", signedUrl: "https://t/a" },
				{ path: "e/u/b_thumb.jpg", signedUrl: null as unknown as string },
			],
			error: null,
		});
		const resolver = createSignedUrlResolver(fake.storage, () => 0);
		const urls = await resolver.thumbnails([
			item({ id: "a", thumbnail_path: "e/u/a_thumb.jpg" }),
			item({ id: "b", thumbnail_path: "e/u/b_thumb.jpg" }),
		]);
		expect(urls).toEqual({ a: "https://t/a" });
	});
});
