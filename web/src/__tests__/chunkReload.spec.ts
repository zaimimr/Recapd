import { describe, expect, it } from "vitest";
import { isChunkLoadError, shouldReloadForChunkError } from "../chunkReload";

describe("isChunkLoadError", () => {
	it("recognises lazy chunk failures across browsers", () => {
		expect(
			isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: /assets/x.js"))
		).toBe(true);
		expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
		expect(isChunkLoadError(new Error("error loading dynamically imported module"))).toBe(true);
		expect(isChunkLoadError(new Error("Unable to preload CSS for /assets/x.css"))).toBe(true);
	});
	it("ignores other errors", () => {
		expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
		expect(isChunkLoadError(null)).toBe(false);
	});
});

describe("shouldReloadForChunkError", () => {
	const chunkError = new TypeError("Failed to fetch dynamically imported module");
	it("reloads once for a chunk error", () => {
		expect(shouldReloadForChunkError(chunkError, false)).toBe(true);
	});
	it("does not reload again after a reload", () => {
		expect(shouldReloadForChunkError(chunkError, true)).toBe(false);
	});
	it("does not reload for other errors", () => {
		expect(shouldReloadForChunkError(new Error("boom"), false)).toBe(false);
	});
});
