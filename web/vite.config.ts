import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { type Occasion, occasions } from "./src/occasions";

const SITE = "https://recapd.app";

const escapeAttr = (value: string) =>
	value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function setMeta(html: string, pattern: RegExp, value: string) {
	return html.replace(pattern, (_, start, end) => `${start}${escapeAttr(value)}${end}`);
}

function occasionHtml(template: string, occasion: Occasion) {
	const url = `${SITE}/${occasion.slug}`;
	const faq = JSON.stringify({
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: occasion.faqs.map((faq) => ({
			"@type": "Question",
			name: faq.q,
			acceptedAnswer: { "@type": "Answer", text: faq.a },
		})),
	});
	let html = template
		.replace('<html lang="en">', `<html lang="${occasion.lang}">`)
		.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(occasion.metaTitle)}</title>`)
		.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (block, body: string) =>
			body.includes('"FAQPage"') ? `<script type="application/ld+json">${faq}</script>` : block
		);
	html = setMeta(html, /(<meta name="description" content=")[^"]*(")/, occasion.metaDescription);
	html = setMeta(html, /(<link rel="canonical" href=")[^"]*(")/, url);
	html = setMeta(html, /(<meta property="og:title" content=")[^"]*(")/, occasion.metaTitle);
	html = setMeta(html, /(<meta property="og:description" content=")[^"]*(")/, occasion.metaDescription);
	html = setMeta(html, /(<meta property="og:url" content=")[^"]*(")/, url);
	html = setMeta(html, /(<meta name="twitter:title" content=")[^"]*(")/, occasion.metaTitle);
	html = setMeta(html, /(<meta name="twitter:description" content=")[^"]*(")/, occasion.metaDescription);
	return html;
}

function occasionPages(): Plugin {
	let outDir = "dist";
	return {
		name: "occasion-pages",
		apply: "build",
		configResolved(config) {
			outDir = config.build.outDir;
		},
		closeBundle() {
			const template = readFileSync(join(outDir, "index.html"), "utf8");
			for (const occasion of occasions) {
				const dir = join(outDir, occasion.slug);
				mkdirSync(dir, { recursive: true });
				writeFileSync(join(dir, "index.html"), occasionHtml(template, occasion));
			}
		},
	};
}

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), occasionPages()],
});
