import { readFile } from "node:fs/promises";
import { kitTheme } from "./theme.js";

export async function loadFonts() {
	return Promise.all(
		kitTheme.fonts.map(async ({ file, weight }) => ({
			name: kitTheme.fontFamily,
			data: await readFile(new URL(`./fonts/${file}`, import.meta.url)),
			weight,
			style: "normal" as const,
		}))
	);
}
