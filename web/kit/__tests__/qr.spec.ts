import { describe, expect, it } from "vitest";
import { qrDataUri } from "../qr";

describe("qrDataUri", () => {
	it("returns a base64 svg data uri", async () => {
		const uri = await qrDataUri("https://recapd.app/join/ABC123");
		expect(uri.startsWith("data:image/svg+xml;base64,")).toBe(true);
		const svg = Buffer.from(uri.split(",")[1], "base64").toString("utf8");
		expect(svg).toContain("<svg");
	});
});
