import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FEATURE, POSTERS } from "./copy.mjs";
import { SCREENS } from "./screens.mjs";
import { C, GRAD, icon, photo, SCREEN_CSS } from "./ui.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const LOGO = fs.readFileSync(path.join(here, "../../assets/recapd-logo.svg"), "utf8");

export const VARIANTS = {
	iphone: {
		w: 440,
		h: 956,
		dsf: 3,
		sw: 390,
		sh: 844,
		cols: 3,
		h1: 40,
		sub: 15.5,
		eb: 11,
		pad: 26,
		top: 58,
		gap: 30,
		bottom: 26,
		bezel: 11,
		radius: 60,
		cls: "ios",
	},
	android: {
		w: 414,
		h: 736,
		dsf: 3,
		sw: 390,
		sh: 844,
		cols: 3,
		h1: 34,
		sub: 14,
		eb: 10,
		pad: 24,
		top: 34,
		gap: 20,
		bottom: 18,
		bezel: 9,
		radius: 44,
		cls: "android",
	},
	ipad: {
		w: 1024,
		h: 1366,
		dsf: 2,
		sw: 768,
		sh: 1024,
		cols: 5,
		h1: 68,
		sub: 22,
		eb: 15,
		pad: 70,
		top: 58,
		gap: 34,
		bottom: 36,
		bezel: 18,
		radius: 46,
		cls: "ipad",
	},
	duoInner: {
		w: 669,
		h: 951,
		dsf: 3,
		sw: 540,
		sh: 768,
		cols: 4,
		h1: 54,
		sub: 19,
		eb: 13,
		pad: 50,
		top: 52,
		gap: 30,
		bottom: 30,
		bezel: 14,
		radius: 52,
		cls: "ios duo",
	},
	duoOuter: {
		w: 466,
		h: 678,
		dsf: 3,
		sw: 390,
		sh: 568,
		cols: 3,
		h1: 36,
		sub: 14,
		eb: 10.5,
		pad: 24,
		top: 34,
		gap: 20,
		bottom: 16,
		bezel: 10,
		radius: 50,
		cls: "ios",
	},
};

export const BASE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:var(--pw);height:var(--ph);overflow:hidden;background:${C.page}}
body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',sans-serif;color:#fff;-webkit-font-smoothing:antialiased;position:relative}
.bloom{position:absolute;inset:0;background:
 radial-gradient(70% 38% at 50% -4%,rgba(255,94,98,.34),rgba(255,94,98,0) 70%),
 radial-gradient(55% 34% at 92% 26%,rgba(139,47,224,.30),rgba(139,47,224,0) 70%),
 radial-gradient(55% 36% at 4% 62%,rgba(255,45,142,.22),rgba(255,45,142,0) 70%),
 radial-gradient(80% 30% at 50% 108%,rgba(139,47,224,.26),rgba(139,47,224,0) 70%)}
.grain{position:absolute;inset:0;opacity:.06;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
.gtext{background:${GRAD};-webkit-background-clip:text;background-clip:text;color:transparent}
`;

function posterCSS(v) {
	return `${BASE_CSS}
.wrap{position:relative;height:100%;display:flex;flex-direction:column;align-items:center;padding:${v.top}px ${v.pad}px ${v.bottom}px}
.eb{display:inline-flex;align-items:center;gap:${v.eb * 0.7}px;padding:${v.eb * 0.62}px ${v.eb * 1.25}px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.12);font-size:${v.eb}px;font-weight:800;letter-spacing:${v.eb * 0.16}px;text-transform:uppercase;color:#fff;white-space:nowrap}
.eb i{width:${v.eb * 0.6}px;height:${v.eb * 0.6}px;border-radius:9px;background:${GRAD}}
h1{margin-top:${v.eb * 1.5}px;font-size:${v.h1}px;line-height:1.04;font-weight:800;letter-spacing:-.035em;text-align:center;width:100%}
h1 span{display:block;white-space:nowrap}
.sub{margin-top:${v.h1 * 0.36}px;font-size:${v.sub}px;line-height:1.42;font-weight:500;color:${C.muted};text-align:center;max-width:${v.cls === "ipad" ? 720 : v.w > 600 ? 520 : 360}px}
.stage{flex:1;width:100%;margin-top:${v.gap}px;position:relative;min-height:0}
.fit{position:absolute;left:50%;top:0;transform-origin:top left}
.dev{position:relative;padding:${v.bezel}px;border-radius:${v.radius}px;background:linear-gradient(160deg,#2B2B38,#14141C 40%,#1D1D27);box-shadow:0 0 0 1.5px rgba(255,255,255,.12) inset,0 40px 90px -20px rgba(0,0,0,.8),0 0 0 1px #000}
.dev .screen{border-radius:${v.radius - v.bezel}px}
.co{position:absolute;z-index:20;display:flex;align-items:center;gap:8px;padding:9px 14px 9px 10px;border-radius:999px;background:rgba(21,21,31,.94);border:1px solid rgba(255,255,255,.14);box-shadow:0 14px 30px -10px rgba(0,0,0,.7);font-size:15px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;transform:translateY(-50%)}
.co b{width:26px;height:26px;border-radius:99px;background:${GRAD};display:flex;align-items:center;justify-content:center}
.co.l{left:-26px}.co.r{right:-26px}
body.ipad .co{font-size:19px;padding:12px 20px 12px 13px;gap:11px}
body.ipad .co b{width:34px;height:34px}
body.duo .dev .screen:after{content:'';position:absolute;top:0;bottom:0;left:50%;width:14px;margin-left:-7px;z-index:30;pointer-events:none;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.07) 45%,rgba(0,0,0,.18) 55%,rgba(0,0,0,0))}
${SCREEN_CSS}`;
}

const FIT_SCRIPT = `
const h1=document.querySelector('h1');
for(const s of h1.querySelectorAll('span')){let f=parseFloat(getComputedStyle(h1).fontSize);s.style.fontSize=f+'px';while(s.scrollWidth>h1.clientWidth&&f>10){f-=1;s.style.fontSize=f+'px'}}
const st=document.querySelector('.stage'),fit=document.querySelector('.fit'),dev=fit.querySelector('.dev');
const k=Math.min(st.clientHeight/dev.offsetHeight,(st.clientWidth+40)/dev.offsetWidth);
fit.style.transform='scale('+k+') translateX(-50%)';
`;

export async function posterHTML(i, lang, vk) {
	const v = VARIANTS[vk];
	const p = POSTERS[lang][i];
	const screen = await SCREENS[i](lang);
	const callouts = p.callouts
		.map(
			([ic, t, side, y]) =>
				`<div class="co ${side}" style="top:${y * 100}%"><b>${icon(ic, vk === "ipad" ? 17 : 14, "#fff", 2.6)}</b>${t}</div>`
		)
		.join("");
	return `<!doctype html><html lang="${lang === "nb" ? "nb" : "en"}"><head><meta charset="utf-8"><style>:root{--pw:${v.w}px;--ph:${v.h}px}${posterCSS(v)}</style></head>
<body class="${v.cls}"><div class="bloom"></div><div class="grain"></div>
<div class="wrap"><div class="eb"><i></i>${p.eyebrow}</div><h1><span>${p.a}</span><span class="gtext">${p.b}</span></h1><div class="sub">${p.sub}</div>
<div class="stage"><div class="fit"><div class="dev"><div class="screen" style="--sw:${v.sw}px;--sh:${v.sh}px;--cols3:${v.cols}">${screen}</div>${callouts}</div></div></div></div>
<script>${FIT_SCRIPT}</script></body></html>`;
}

export function featureHTML(lang) {
	const f = FEATURE[lang];
	const cards = [
		["wedding-02", -11, 338, 52],
		["halloween-01", -2, 398, 34],
		["party-05", 8, 458, 50],
	];
	return `<!doctype html><html><head><meta charset="utf-8"><style>:root{--pw:512px;--ph:250px}${BASE_CSS}
.bloom{background:radial-gradient(60% 80% at 8% 0%,rgba(255,94,98,.30),rgba(255,94,98,0) 70%),radial-gradient(50% 90% at 100% 100%,rgba(139,47,224,.34),rgba(139,47,224,0) 70%),radial-gradient(40% 60% at 70% 20%,rgba(255,45,142,.18),rgba(255,45,142,0) 70%)}
.txt{position:absolute;left:32px;top:0;bottom:0;width:250px;display:flex;flex-direction:column;justify-content:center}
.brand{display:flex;align-items:center;gap:8px;font-size:19px;font-weight:800;letter-spacing:-.5px}
.brand svg{width:30px;height:30px}
h1{margin-top:12px;font-size:27px;line-height:1.05;font-weight:800;letter-spacing:-.035em}
h1 span{display:block;white-space:nowrap}
.sub{margin-top:9px;font-size:10.5px;line-height:1.45;color:${C.muted};font-weight:500}
.chips{display:flex;gap:5px;margin-top:12px}
.chips span{padding:4px 9px;border-radius:99px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);font-size:9px;font-weight:700;white-space:nowrap}
.card{position:absolute;width:118px;height:160px;border-radius:14px;background-size:cover;background-position:center;border:3px solid #1E1E2B;box-shadow:0 18px 36px -10px rgba(0,0,0,.8)}
</style></head><body><div class="bloom"></div><div class="grain"></div>
${cards.map(([p, r, x, y]) => `<div class="card" style="left:${x - 30}px;top:${y}px;transform:rotate(${r}deg);background-image:url('${photo(p)}')"></div>`).join("")}
<div class="txt"><div class="brand">${LOGO.replace(/width="512" height="512"/, "")}Recapd</div><h1><span>${f.a}</span><span class="gtext">${f.b}</span></h1><div class="sub">${f.sub}</div><div class="chips">${f.chips.map((c) => `<span>${c}</span>`).join("")}</div></div>
<script>const h1=document.querySelector('h1');for(const s of h1.querySelectorAll('span')){let f=27;while(s.scrollWidth>250&&f>10){f-=.5;s.style.fontSize=f+'px'}}</script>
</body></html>`;
}
