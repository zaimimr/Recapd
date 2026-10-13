import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const photo = (name) => `file://${here}/photos/${name}.jpg`;

export const C = {
	coral: "#FF5E62",
	pink: "#FF2D8E",
	violet: "#8B2FE0",
	pinkSoft: "#FF7FB4",
	page: "#0B0B12",
	deep: "#07070C",
	card: "#15151F",
	raised: "#1E1E2B",
	border: "#2A2A38",
	text: "#FFFFFF",
	muted: "#A0A0B2",
	faint: "#6B6B7E",
	success: "#22C55E",
	warning: "#F59E0B",
};

export const GRAD = `linear-gradient(135deg, ${C.coral} 0%, ${C.pink} 52%, ${C.violet} 100%)`;

const P = {
	check: '<polyline points="20 6 9 17 4 12"/>',
	x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
	plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
	upload:
		'<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>',
	download:
		'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
	lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
	pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
	calendar:
		'<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
	clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
	tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
	camera:
		'<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
	share:
		'<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>',
	users:
		'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
	home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
	settings:
		'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
	left: '<polyline points="15 18 9 12 15 6"/>',
	right: '<polyline points="9 18 15 12 9 6"/>',
	shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
	trash:
		'<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
	zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
	play: '<polygon points="6 3 20 12 6 21 6 3"/>',
	search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
	globe:
		'<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
	refresh:
		'<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l5.13 4.64A9 9 0 0 0 20.49 15"/>',
	image:
		'<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
	bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
	checkCircle:
		'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
	list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
	eyeOff:
		'<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
	smartphone:
		'<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
	maximize:
		'<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
	rotate: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
};

export function icon(name, size = 18, color = "currentColor", stroke = 2) {
	return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" style="flex:none;display:block">${P[name]}</svg>`;
}

export const AVATAR_COLORS = [
	"#FF2D8E",
	"#8B2FE0",
	"#FF7A45",
	"#22C55E",
	"#3B82F6",
	"#F59E0B",
	"#14B8A6",
	"#E11D48",
];

export function avatar(letter, i, size = 22, ring = C.page) {
	return `<span class="av" style="width:${size}px;height:${size}px;background:${AVATAR_COLORS[i % AVATAR_COLORS.length]};font-size:${size * 0.46}px;box-shadow:0 0 0 2px ${ring}">${letter}</span>`;
}

export function statusBar(time = "21:47", light = true) {
	const c = light ? "#fff" : "#000";
	return `<div class="status"><span class="time">${time}</span><span class="island"></span><span class="sicons">
  <svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="${c}"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="${c}"/><rect x="10" y="3" width="3" height="9" rx="1" fill="${c}"/><rect x="15" y="0" width="3" height="12" rx="1" fill="${c}"/></svg>
  <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.5l2.4-2.9a3.6 3.6 0 0 0-4.8 0z" fill="${c}"/><path d="M3.6 6.7a6.6 6.6 0 0 1 8.8 0l1.5-1.8a9 9 0 0 0-11.8 0z" fill="${c}"/><path d="M1.2 3.9a10.3 10.3 0 0 1 13.6 0l1.2-1.4a12.2 12.2 0 0 0-16 0z" fill="${c}"/></svg>
  <svg width="26" height="12" viewBox="0 0 26 12"><rect x="0.5" y="0.5" width="22" height="11" rx="3.5" stroke="${c}" stroke-opacity=".4" fill="none"/><rect x="2" y="2" width="16" height="8" rx="2" fill="${c}"/><rect x="23.5" y="4" width="1.6" height="4" rx=".8" fill="${c}" fill-opacity=".4"/></svg>
  </span></div>`;
}

export function navBar(title, sub, left = "left", right = null) {
	const btn = (n) =>
		n ? `<span class="ibtn">${icon(n, 18)}</span>` : '<span class="ibtn ghost"></span>';
	return `<div class="nav">${btn(left)}<div class="navt"><div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>${btn(right)}</div>`;
}

export function tabBar(active, L) {
	const tab = (n, label, k) =>
		`<div class="tab ${k === active ? "on" : ""}">${icon(n, 22, "currentColor", 1.8)}<span>${label}</span></div>`;
	return `<div class="tabbar">${tab("home", L.tabHome, "home")}${tab("calendar", L.tabEvents, "events")}${tab("settings", L.tabSettings, "settings")}</div>`;
}

export function homeIndicator() {
	return '<div class="homeind"></div>';
}

export const SCREEN_CSS = `
.screen{position:relative;width:var(--sw);height:var(--sh);background:${C.page};color:${C.text};overflow:hidden;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif;-webkit-font-smoothing:antialiased}
.screen *{box-sizing:border-box}
.status{height:54px;display:flex;align-items:center;justify-content:space-between;padding:0 30px 0 38px;position:relative;z-index:5}
.status .time{font-weight:600;font-size:17px;letter-spacing:-.3px;width:60px}
.status .island{position:absolute;left:50%;top:11px;width:124px;height:36px;margin-left:-62px;background:#000;border-radius:20px}
.status .sicons{display:flex;gap:6px;align-items:center}
body.android .status .island{width:12px;height:12px;margin-left:-6px;top:20px;border-radius:50%}
body.ipad .status{height:30px;padding:0 24px}
body.ipad .status .island{display:none}
.nav{display:flex;align-items:center;justify-content:space-between;padding:6px 16px 10px}
.ibtn{width:38px;height:38px;border-radius:999px;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;color:#fff}
.ibtn.ghost{background:transparent}
.navt{text-align:center;min-width:0}
.navt .t{font-weight:700;font-size:17px;letter-spacing:-.3px;white-space:nowrap}
.navt .s{font-weight:600;font-size:12px;color:${C.muted};margin-top:2px;white-space:nowrap}
.av{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;color:#fff;font-weight:800;flex:none}
.eyebrow{font-size:11px;font-weight:800;letter-spacing:1.4px;color:${C.pinkSoft};text-transform:uppercase}
.card{background:${C.card};border:1px solid ${C.border};border-radius:20px}
.raised{background:${C.raised};border:1px solid ${C.border};border-radius:16px}
.btn{height:54px;border-radius:16px;background:${GRAD};display:flex;align-items:center;justify-content:center;gap:10px;font-weight:700;font-size:16px;letter-spacing:-.3px;color:#fff;box-shadow:0 10px 30px -8px rgba(255,45,142,.55)}
.btn2{height:50px;border-radius:16px;background:${C.raised};border:1px solid ${C.border};display:flex;align-items:center;justify-content:center;gap:10px;font-weight:700;font-size:15px;color:#fff}
.pill{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border-radius:999px;font-size:12px;font-weight:700;background:rgba(255,255,255,.08);color:${C.muted};white-space:nowrap}
.pill.live{background:rgba(34,197,94,.16);color:${C.success}}
.pill.live:before{content:'';width:6px;height:6px;border-radius:9px;background:${C.success}}
.pill.accent{background:rgba(255,45,142,.14);color:${C.pinkSoft}}
.pill.warn{background:rgba(245,158,11,.16);color:${C.warning}}
.tabbar{position:absolute;left:0;right:0;bottom:0;height:84px;background:rgba(11,11,18,.96);border-top:1px solid ${C.border};display:flex;justify-content:space-around;padding-top:9px;z-index:6}
.tab{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;font-weight:600;color:${C.faint};width:90px}
.tab.on{color:${C.pink}}
.homeind{position:absolute;left:50%;bottom:8px;width:134px;height:5px;margin-left:-67px;border-radius:9px;background:rgba(255,255,255,.9);z-index:9}
body.ipad .homeind{width:200px;margin-left:-100px}
.ph{background-size:cover;background-position:center;background-color:${C.raised};position:relative}
.grid{display:grid;grid-template-columns:repeat(var(--cols),1fr);gap:2px}
.vid{position:absolute;left:6px;bottom:6px;display:flex;align-items:center;gap:4px;padding:3px 7px;border-radius:999px;background:rgba(0,0,0,.55);font-size:11px;font-weight:700;color:#fff}
.sel{position:absolute;right:7px;top:7px;width:24px;height:24px;border-radius:99px;display:flex;align-items:center;justify-content:center}
.sel.on{background:${C.pink};box-shadow:0 0 0 2px rgba(255,255,255,.95)}
.sel.off{border:2px solid rgba(255,255,255,.9);background:rgba(0,0,0,.18)}
.dim:after{content:'';position:absolute;inset:0;background:rgba(11,11,18,.45)}
.row{display:flex;align-items:center;gap:12px}
.grow{flex:1;min-width:0}
.muted{color:${C.muted}}
`;
