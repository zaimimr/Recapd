import { originalObjectPath, thumbObjectPath } from "@/lib/upload/storage";

describe("originalObjectPath", () => {
	it("namespaces by event and item id", () => {
		expect(originalObjectPath("evt", "item", "photo.heic")).toBe("evt/item/photo.heic");
	});

	it("sanitizes unsafe characters", () => {
		expect(originalObjectPath("evt", "item", "my photo (1).jpg")).toBe("evt/item/my_photo__1_.jpg");
	});

	it("keeps dots, dashes, underscores", () => {
		expect(originalObjectPath("evt", "item", "IMG-001_x.JPG")).toBe("evt/item/IMG-001_x.JPG");
	});
});

describe("thumbObjectPath", () => {
	it("returns single jpg per item", () => {
		expect(thumbObjectPath("evt", "item")).toBe("evt/item.jpg");
	});
});
