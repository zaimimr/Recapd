import { createRequire } from "node:module";
import { dirname } from "node:path";

export async function loadImageResponse() {
	const require = createRequire(import.meta.url);
	const g = globalThis as Record<string, unknown>;
	g.require ??= require;
	g.__dirname ??= dirname(require.resolve("harfbuzzjs/hb.wasm"));
	return (await import("@vercel/og")).ImageResponse;
}
