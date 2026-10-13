import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { pages, renderPage, sitemap } from "./src/seo";

function staticPages(): Plugin {
	let outDir = "dist";
	return {
		name: "static-pages",
		apply: "build",
		configResolved(config) {
			outDir = config.build.outDir;
		},
		closeBundle() {
			const template = readFileSync(join(outDir, "index.html"), "utf8");
			for (const page of pages) {
				const dir = join(outDir, page.path);
				mkdirSync(dir, { recursive: true });
				writeFileSync(join(dir, "index.html"), renderPage(template, page));
			}
			writeFileSync(join(outDir, "sitemap.xml"), sitemap(new Date().toISOString().slice(0, 10)));
		},
	};
}

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), staticPages()],
});
