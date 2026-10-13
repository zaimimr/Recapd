import { describe, expect, it } from "vitest";
import type { KitData } from "../event";
import { loadFonts } from "../fonts";
import { FORMAT_SIZE } from "../formats";
import { loadImageResponse } from "../og";
import { qrDataUri } from "../qr";
import { renderTemplate } from "../templates";

const data: KitData = {
	title: "Anna og Olas bryllupsfest",
	dateLabel: "Sat, Oct 10 · 6:00 PM",
	code: "ABC123",
	joinUrl: "https://recapd.app/join/ABC123",
	qrSrc: "",
};

describe("loadImageResponse", () => {
	it("renders a PNG under Node with the bundled fonts", async () => {
		data.qrSrc = await qrDataUri(data.joinUrl);
		const ImageResponse = await loadImageResponse();
		const image = new ImageResponse(renderTemplate("table", data), {
			...FORMAT_SIZE.table,
			fonts: await loadFonts(),
		});
		const png = Buffer.from(await image.arrayBuffer());
		expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	});
});
