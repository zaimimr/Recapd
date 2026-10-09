import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { BASE_CSS, LOGO } from "./build.mjs";
import { NAMES } from "./copy.mjs";
import { SCREENS } from "./screens.mjs";
import { photo, SCREEN_CSS } from "./ui.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT || path.join(here, "out-creative");
const CHROME =
	process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const [found, invite, feed, viewer, upload] = SCREENS;

const party = Array.from({ length: 12 }, (_, i) => `party-${String(i + 1).padStart(2, "0")}`);
const wedding = Array.from({ length: 10 }, (_, i) => `wedding-${String(i + 1).padStart(2, "0")}`);

const THEMES = {
	wedding: {
		photos: wedding,
		en: { title: "Sarah & James", sub: "Grand Hotel · Oslo", big: "The Wedding" },
		nb: { title: "Sarah & James", sub: "Grand Hotel · Oslo", big: "Bryllupet" },
	},
	birthday: {
		photos: party,
		en: { title: "Mia’s 30th", sub: "Saturday · Oslo", big: "The Birthday" },
		nb: { title: "Mia 30 år", sub: "Lørdag · Oslo", big: "Bursdagen" },
	},
	halloween: {
		photos: [
			"halloween-01",
			"party-03",
			"halloween-02",
			"party-08",
			"halloween-03",
			"party-05",
			"halloween-04",
			"party-10",
		],
		en: { title: "Halloween at Mia’s", sub: "Friday · Oslo", big: "Halloween" },
		nb: { title: "Halloween hos Mia", sub: "Fredag · Oslo", big: "Halloween" },
	},
	christmas: {
		photos: [
			"christmas-01",
			"party-02",
			"christmas-02",
			"nye-01",
			"christmas-03",
			"party-06",
			"christmas-04",
			"nye-02",
		],
		en: { title: "Office Christmas party", sub: "Friday · Oslo", big: "Christmas party" },
		nb: { title: "Julebord", sub: "Fredag · Oslo", big: "Julebordet" },
	},
};

export const SETS = {
	default: {
		screens: [found, feed, viewer],
		cards: ["party-05", "wedding-02", "party-08", "nye-01"],
		en: {
			a: "Everyone’s photos.",
			b: "One album.",
			sub: "Guests scan a QR code. Every photo lands in one place.",
		},
		nb: {
			a: "Alles bilder.",
			b: "Ett album.",
			sub: "Gjestene skanner en QR-kode. Alle bildene havner på ett sted.",
		},
	},
	"ppo-find": {
		screens: [upload, found, feed],
		cards: ["party-01", "festival-02", "party-11", "nye-02"],
		en: {
			a: "It finds the photos.",
			b: "You tap share.",
			sub: "Every shot from the event, picked from your camera roll.",
		},
		nb: {
			a: "Den finner bildene.",
			b: "Du trykker del.",
			sub: "Alle bildene fra kvelden, plukket fra kamerarullen din.",
		},
	},
	"ppo-noapp": {
		screens: [feed, invite, viewer],
		cards: ["party-03", "wedding-05", "party-09", "halloween-03"],
		en: {
			a: "Guests just scan.",
			b: "No app needed.",
			sub: "They join from the browser with a first name.",
		},
		nb: {
			a: "Gjestene skanner.",
			b: "Ingen app trengs.",
			sub: "De blir med fra nettleseren med bare fornavn.",
		},
	},
	wedding: {
		theme: "wedding",
		screens: [found, feed, viewer],
		en: {
			a: "Your wedding day,",
			b: "from every guest.",
			sub: "Every guest’s photos and videos in one private album.",
		},
		nb: {
			a: "Bryllupsdagen,",
			b: "fra alle gjestene.",
			sub: "Alle gjestenes bilder og videoer i ett privat album.",
		},
	},
	birthday: {
		theme: "birthday",
		screens: [found, feed, viewer],
		en: {
			a: "The whole party.",
			b: "One album.",
			sub: "Every guest’s photos from the birthday, in full quality.",
		},
		nb: {
			a: "Hele festen.",
			b: "Ett album.",
			sub: "Alle gjestenes bilder fra bursdagen, i full kvalitet.",
		},
	},
	halloween: {
		theme: "halloween",
		screens: [found, feed, viewer],
		en: {
			a: "Every costume.",
			b: "One album.",
			sub: "All the photos from the party, from every guest’s phone.",
		},
		nb: {
			a: "Alle kostymene.",
			b: "Ett album.",
			sub: "Alle bildene fra festen, fra alles mobiler.",
		},
	},
	christmas: {
		theme: "christmas",
		screens: [found, feed, viewer],
		en: {
			a: "The Christmas party.",
			b: "One album.",
			sub: "Every photo from the night, shared by everyone there.",
		},
		nb: {
			a: "Hele julebordet.",
			b: "Ett album.",
			sub: "Alle bildene fra kvelden, delt av alle som var der.",
		},
	},
};

const FORMATS = {
	header: { w: 1920, h: 823, dsf: 2, px: [3840, 1646], ext: "jpg" },
	search: { w: 1920, h: 1280, dsf: 2, px: [3840, 2560], ext: "jpg" },
	universal: { w: 2622, h: 1475, dsf: 2, px: [5244, 2950], ext: "png" },
};

function applyTheme(html, key, lang) {
	if (!key) return html;
	const t = THEMES[key];
	const t0 = t[lang];
	const N = NAMES[lang];
	let i = 0;
	let out = html.replace(
		/photos\/(wedding|grad|party|nye|festival|halloween|christmas|concert|trip)-\d+\.jpg/g,
		() => `photos/${t.photos[i++ % t.photos.length]}.jpg`
	);
	for (const [from, to] of [
		[N.weddingTitle, t0.big],
		[N.weddingSub, t0.sub],
		[N.wedding, t0.title],
		[N.mia30, t0.title],
		[N.halloween, t0.title],
		[N.grad, t0.title],
	]) {
		out = out.split(from).join(to);
	}
	return out;
}

function device(screen, style) {
	return `<div class="dev" style="${style}"><div class="screen" style="--sw:390px;--sh:844px;--cols3:3">${screen}</div></div>`;
}

const CSS = `${BASE_CSS}
.dev{position:absolute;padding:11px;border-radius:60px;background:linear-gradient(160deg,#2B2B38,#14141C 40%,#1D1D27);box-shadow:0 0 0 1.5px rgba(255,255,255,.12) inset,0 50px 110px -20px rgba(0,0,0,.85),0 0 0 1px #000;transform-origin:top center}
.dev .screen{border-radius:49px}
.pcard{position:absolute;border-radius:22px;background-size:cover;background-position:center;border:5px solid #1E1E2B;box-shadow:0 30px 60px -16px rgba(0,0,0,.85)}
.txt{position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center;text-align:center;z-index:10}
.brand{display:flex;align-items:center;gap:.32em;font-weight:800;letter-spacing:-.02em}
.brand svg{width:1.45em;height:1.45em}
h1{font-weight:800;line-height:1.02;letter-spacing:-.04em}
h1 span{display:block;white-space:nowrap}
.sub{font-weight:500;color:rgba(255,255,255,.72);line-height:1.35;text-wrap:balance}
${SCREEN_CSS}`;

function layout(fmt, screens, cards, copy) {
	const [s1, s2, s3] = screens;
	const logo = LOGO.replace(/width="512" height="512"/, "");
	if (fmt === "header") {
		return `<div class="bloom"></div><div class="grain"></div>
${cards.map(([p, r, x, y, w]) => `<div class="pcard" style="left:${x}px;top:${y}px;width:${w}px;height:${w * 1.33}px;transform:rotate(${r}deg);background-image:url('${photo(p)}')"></div>`).join("")}
${device(s1, "left:120px;top:150px;transform:rotate(-7deg) scale(.86)")}
${device(s3, "right:120px;top:150px;transform:rotate(7deg) scale(.86)")}
<div class="txt" style="top:0;bottom:0;justify-content:center;padding:0 560px">
<div class="brand" style="font-size:34px">${logo}Recapd</div>
<h1 style="font-size:92px;margin-top:26px"><span>${copy.a}</span><span class="gtext">${copy.b}</span></h1>
<div class="sub" style="font-size:28px;margin-top:22px;max-width:640px">${copy.sub}</div></div>`;
	}
	const k = fmt === "universal" ? 2622 / 1920 : 1;
	const H = fmt === "universal" ? 1475 : 1280;
	const top = fmt === "universal" ? 560 : 520;
	const sc = fmt === "universal" ? 1.08 : 0.92;
	const sideSc = sc * 0.9;
	const cx = 960 * k;
	const devW = 412;
	return `<div class="bloom"></div><div class="grain"></div>
${cards.map(([p, r, x, y, w]) => `<div class="pcard" style="left:${x * k}px;top:${y * (H / 1280)}px;width:${w * k}px;height:${w * k * 1.33}px;transform:rotate(${r}deg);background-image:url('${photo(p)}')"></div>`).join("")}
${device(s1, `left:${cx - devW / 2 - 470 * k}px;top:${top + 90}px;transform:rotate(-6deg) scale(${sideSc})`)}
${device(s3, `left:${cx - devW / 2 + 470 * k}px;top:${top + 90}px;transform:rotate(6deg) scale(${sideSc})`)}
${device(s2, `left:${cx - devW / 2}px;top:${top}px;transform:scale(${sc});z-index:5`)}
<div class="txt" style="top:${fmt === "universal" ? 96 : 78}px">
<div class="brand" style="font-size:${40 * k}px">${logo}Recapd</div>
<h1 style="font-size:${126 * k}px;margin-top:${24 * k}px"><span>${copy.a}</span><span class="gtext">${copy.b}</span></h1></div>`;
}

const CARD_POS = {
	header: [
		[-12, 450, 60, 165],
		[9, 1300, 40, 165],
		[-5, 470, 600, 145],
		[11, 1310, 610, 145],
	],
	stack: [
		[-12, 70, 420, 250],
		[10, 1600, 400, 250],
		[-4, 40, 860, 230],
		[8, 1640, 840, 230],
	],
};

async function html(setKey, fmt, lang) {
	const set = SETS[setKey];
	const copy = set[lang];
	const screens = await Promise.all(
		set.screens.map(async (fn) => applyTheme(await fn(lang), set.theme, lang))
	);
	const pics = set.theme ? THEMES[set.theme].photos : set.cards;
	const pos = CARD_POS[fmt === "header" ? "header" : "stack"];
	const cards = pos.map(([r, x, y, w], i) => [
		pics[set.theme ? (i * 2) % pics.length : i],
		r,
		x,
		y,
		w,
	]);
	const f = FORMATS[fmt];
	return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>:root{--pw:${f.w}px;--ph:${f.h}px}${CSS}</style></head><body class="ios">${layout(fmt, screens, cards, copy)}
<script>for(const h of document.querySelectorAll('h1')){const max=h.parentElement.clientWidth*.92;for(const s of h.querySelectorAll('span')){let z=parseFloat(getComputedStyle(h).fontSize);while(s.scrollWidth>max&&z>20){z-=2;s.style.fontSize=z+'px'}}}</script></body></html>`;
}

const langs = (process.env.LANGS || "en,nb").split(",");
const sets = process.env.SETS ? process.env.SETS.split(",") : Object.keys(SETS);
const fmts = process.env.FORMATS ? process.env.FORMATS.split(",") : Object.keys(FORMATS);

const browser = await chromium.launch({ executablePath: CHROME });
for (const lang of langs) {
	for (const s of sets) {
		for (const fmt of fmts) {
			const f = FORMATS[fmt];
			const dir = path.join(OUT, lang, s);
			fs.mkdirSync(path.join(OUT, "html"), { recursive: true });
			fs.mkdirSync(dir, { recursive: true });
			const tmp = path.join(OUT, "html", `${lang}_${s}_${fmt}.html`);
			fs.writeFileSync(tmp, await html(s, fmt, lang));
			const page = await browser.newPage({
				viewport: { width: f.w, height: f.h },
				deviceScaleFactor: f.dsf,
			});
			await page.goto(`file://${tmp}`, { waitUntil: "load" });
			await page.evaluate(() => document.fonts.ready);
			await page.waitForTimeout(150);
			const buf = await page.screenshot({ type: "png" });
			await page.close();
			const img = sharp(buf).resize(f.px[0], f.px[1], { fit: "cover" }).removeAlpha();
			const file = path.join(dir, `${fmt}.${f.ext}`);
			await (f.ext === "jpg" ? img.jpeg({ quality: 92 }) : img.png()).toFile(file);
			console.log(lang, s, fmt);
		}
	}
}
await browser.close();
