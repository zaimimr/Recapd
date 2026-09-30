import { describe, expect, it } from "vitest";
import { fitWithin } from "../thumbnail";

describe("fitWithin", () => {
	it("scales the longest side to 512", () => {
		expect(fitWithin(4032, 3024)).toEqual({ width: 512, height: 384 });
		expect(fitWithin(1080, 1920)).toEqual({ width: 288, height: 512 });
	});
	it("never upscales", () => {
		expect(fitWithin(300, 200)).toEqual({ width: 300, height: 200 });
	});
});
