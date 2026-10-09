import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { featureHTML, posterHTML, VARIANTS } from "./build.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT || path.join(here, "out");
const CHROME =
	process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const langs = (process.env.LANGS || "en,nb").split(",");
const only = process.env.ONLY
	? process.env.ONLY.split(",")
	: Object.keys(VARIANTS).concat("feature");
const slides = process.env.SLIDES
	? process.env.SLIDES.split(",").map(Number)
	: [1, 2, 3, 4, 5, 6, 7, 8];

const browser = await chromium.launch({ executablePath: CHROME });

async function shoot(html, w, h, dsf, file) {
	const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
	const tmp = path.join(
		OUT,
		"html",
		path.relative(OUT, file).replace(/\//g, "_").replace(".png", ".html")
	);
	fs.mkdirSync(path.dirname(tmp), { recursive: true });
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(tmp, html);
	await page.goto(`file://${tmp}`, { waitUntil: "load" });
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(150);
	await page.screenshot({ path: file, type: "png" });
	await page.close();
	await sharp(file).removeAlpha().png().toFile(`${file}.tmp`);
	fs.renameSync(`${file}.tmp`, file);
}

for (const lang of langs) {
	for (const vk of Object.keys(VARIANTS)) {
		if (!only.includes(vk)) continue;
		const v = VARIANTS[vk];
		for (const n of slides) {
			const file = path.join(OUT, lang, vk === "duoInner" ? "duo-inner" : vk === "duoOuter" ? "duo-outer" : vk, `${String(n).padStart(2, "0")}.png`);
			await shoot(await posterHTML(n - 1, lang, vk), v.w, v.h, v.dsf, file);
			if (vk === "iphone") {
				const f65 = path.join(OUT, lang, "iphone65", path.basename(file));
				fs.mkdirSync(path.dirname(f65), { recursive: true });
				await sharp(file).resize(1242, 2688, { fit: "cover" }).png().toFile(f65);
			}
			console.log(lang, vk, n);
		}
	}
	if (only.includes("feature")) {
		await shoot(featureHTML(lang), 512, 250, 2, path.join(OUT, lang, "feature", "feature.png"));
		console.log(lang, "feature");
	}
}

await browser.close();
