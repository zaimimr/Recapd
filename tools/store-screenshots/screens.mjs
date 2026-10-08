import QRCode from "qrcode";
import { NAMES, UI } from "./copy.mjs";
import { avatar, C, GRAD, homeIndicator, icon, navBar, photo, statusBar, tabBar } from "./ui.mjs";

const tile = (name, extra = "", style = "") =>
	`<div class="ph ${extra}" style="background-image:url('${photo(name)}');${style}">`;

function found(lang) {
	const L = UI[lang];
	const N = NAMES[lang];
	const pics = [
		"party-01",
		"party-03",
		"party-08",
		"party-05",
		"party-02",
		"party-06",
		"party-07",
		"party-04",
		"party-09",
		"party-10",
		"party-11",
		"party-12",
		"nye-01",
		"festival-02",
		"nye-02",
		"party-01",
		"party-03",
		"party-08",
		"party-05",
		"party-02",
		"party-07",
	];
	const off = new Set([5, 10]);
	const vids = { 4: "0:18", 9: "0:24" };
	const cells = pics
		.map(
			(p, i) =>
				`${tile(p, off.has(i) ? "dim" : "", "aspect-ratio:1")}<span class="sel ${off.has(i) ? "off" : "on"}">${off.has(i) ? "" : icon("check", 14, "#fff", 3)}</span>${vids[i] ? `<span class="vid">${icon("play", 9, "#fff")}${vids[i]}</span>` : ""}</div>`
		)
		.join("");
	return `${statusBar("01:58")}
  ${navBar(L.addPhotos, N.mia30, "x", "plus")}
  <div style="margin:4px 16px 12px;padding:14px;border-radius:18px;background:linear-gradient(135deg,rgba(255,94,98,.18),rgba(139,47,224,.18));border:1px solid rgba(255,45,142,.38)" class="row">
    <span style="width:42px;height:42px;border-radius:13px;background:${GRAD};display:flex;align-items:center;justify-content:center">${icon("search", 20, "#fff", 2.6)}</span>
    <div class="grow"><div style="font-weight:800;font-size:16px;letter-spacing:-.3px">${L.found(47)}</div><div class="muted" style="font-size:12.5px;font-weight:600;margin-top:3px">${L.window}</div></div>
  </div>
  <div class="row" style="padding:0 16px 10px;justify-content:space-between">
    <div><div style="font-weight:800;font-size:17px;letter-spacing:-.3px">${L.selected(45)}</div><div class="muted" style="font-size:12.5px;font-weight:600">${L.already}</div></div>
    <div class="row" style="gap:6px"><span class="pill" style="color:#fff;background:${C.raised};border:1px solid ${C.border};padding:8px 14px;font-size:14px">${L.all}</span><span style="color:${C.pinkSoft};font-weight:700;font-size:14px;padding:8px 10px">${L.none}</span></div>
  </div>
  <div class="grid" style="--cols:var(--cols3)">${cells}</div>
  <div style="position:absolute;left:0;right:0;bottom:0;padding:44px 16px 34px;background:linear-gradient(180deg,rgba(11,11,18,0),${C.page} 30%)">
    <div class="btn">${icon("upload", 20, "#fff", 2.4)}${L.shareN(43, 2)}</div>
    <div class="muted" style="text-align:center;font-size:12.5px;font-weight:600;margin-top:10px">${L.bgHint}</div>
  </div>${homeIndicator()}`;
}

async function invite(lang) {
	const L = UI[lang];
	const N = NAMES[lang];
	const qr = await QRCode.toString("https://recapd.app/join/SPOOKY", {
		type: "svg",
		margin: 0,
		errorCorrectionLevel: "M",
		color: { dark: "#0B0B12", light: "#FFFFFF" },
	});
	const people = [
		["M", "Mia", L.justNow, true],
		["L", "Liam", L.minAgo(1), true],
		["S", "Sofia", L.minAgo(2), false],
		["J", "Jonas", L.minAgo(4), true],
	];
	const rows = people
		.map(
			([a, n, t, web], i) =>
				`<div class="row" style="padding:9px 0">${avatar(a, i, 36, C.card)}<div class="grow" style="font-weight:700;font-size:16px">${n}</div>${web ? `<span class="pill" style="font-size:11px">${icon("globe", 12)}${L.browser}</span>` : ""}<span class="muted" style="font-size:13px;font-weight:600;width:84px;text-align:right">${t}</span></div>`
		)
		.join("");
	return `${statusBar("20:14")}
  ${navBar(L.invite, N.halloween, "left", "share")}
  <div class="card" style="margin:6px 16px 0;padding:20px 16px;text-align:center">
    <div class="eyebrow">${L.scanToJoin}</div>
    <div style="width:200px;height:200px;margin:16px auto 0;background:#fff;border-radius:22px;padding:16px">${qr.replace("<svg", '<svg width="168" height="168"')}</div>
    <div class="row" style="justify-content:center;gap:7px;margin-top:16px">${"SPOOKY"
			.split("")
			.map(
				(c) =>
					`<span style="width:40px;height:48px;border-radius:12px;background:${C.raised};border:1px solid ${C.border};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px">${c}</span>`
			)
			.join("")}</div>
    <div class="row" style="justify-content:center;gap:7px;margin-top:14px;color:${C.muted};font-size:13px;font-weight:600">${icon("globe", 15, C.pinkSoft)}${L.noApp}</div>
  </div>
  <div class="btn" style="margin:14px 16px 0">${icon("share", 19, "#fff", 2.4)}${L.shareLink}</div>
  <div class="card" style="margin:14px 16px 0;padding:14px 16px 6px">
    <div class="row" style="justify-content:space-between;margin-bottom:4px"><span class="eyebrow">${L.joining}</span><span class="pill live">${L.tonight(9)}</span></div>
    ${rows}
  </div>${homeIndicator()}`;
}

function masonry(names, heights, badges = true) {
	return `<div style="columns:var(--cols3);column-gap:2px">${names.map((n, i) => `<div style="break-inside:avoid;margin-bottom:2px">${tile(n, "", `height:${heights[i % heights.length]}px`)}${badges ? `<span style="position:absolute;right:7px;top:7px">${avatar("MLSJNAT"[i % 7], i, 22, "rgba(0,0,0,.3)")}</span>` : ""}${i === 3 ? `<span class="vid">${icon("play", 9, "#fff")}0:18</span>` : ""}</div></div>`).join("")}</div>`;
}

function feed(lang) {
	const L = UI[lang];
	const N = NAMES[lang];
	const pics = [
		"wedding-08",
		"wedding-03",
		"wedding-02",
		"wedding-07",
		"wedding-09",
		"wedding-01",
		"wedding-06",
		"wedding-10",
		"wedding-05",
		"wedding-04",
		"wedding-03",
		"wedding-08",
	];
	return `${statusBar("23:14")}
  ${navBar(N.wedding, N.weddingSub, "left", "share")}
  <div class="card" style="margin:4px 16px 0;padding:16px">
    <div class="row" style="justify-content:space-between"><span class="eyebrow">${L.eventAlbum}</span><span class="pill live">${L.liveNow}</span></div>
    <div style="font-weight:800;font-size:26px;letter-spacing:-.8px;margin-top:6px">${N.weddingTitle}</div>
    <div class="row" style="gap:8px;margin-top:6px"><span style="display:flex">${"MLSJN"
			.split("")
			.map((a, i) => `<span style="margin-left:${i ? -6 : 0}px">${avatar(a, i, 24, C.card)}</span>`)
			.join(
				""
			)}</span><span class="muted" style="font-size:13.5px;font-weight:600">${L.adding(24)}</span></div>
    <div class="row" style="gap:8px;margin-top:14px">${[
			["1 842", L.photos],
			["96", L.videos],
			["24", L.guests],
		]
			.map(
				([n, l]) =>
					`<div class="raised grow" style="padding:10px 4px;text-align:center"><div style="font-weight:800;font-size:20px;letter-spacing:-.5px">${n}</div><div class="muted" style="font-size:10.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-top:2px">${l}</div></div>`
			)
			.join("")}</div>
    <div class="btn" style="margin-top:14px">${icon("plus", 20, "#fff", 2.6)}${L.addPhotos}</div>
  </div>
  <div class="row" style="justify-content:space-between;padding:16px 16px 10px"><span class="eyebrow">${L.feed}</span><span class="pill">${L.newest}</span></div>
  ${masonry(pics, [168, 210, 140, 190, 150, 220, 170, 160])}
  ${tabBar("events", L)}${homeIndicator()}`;
}

function viewer(lang) {
	const L = UI[lang];
	const N = NAMES[lang];
	const strip = ["grad-02", "grad-03", "grad-01", "grad-04", "party-04", "party-09", "grad-02"];
	return `<div style="position:absolute;inset:0;background:#000"></div>
  <div class="ph" style="position:absolute;left:0;right:0;top:0;bottom:0;background-image:url('${photo("grad-01")}');background-position:50% 30%"></div>
  <div style="position:absolute;left:0;right:0;top:0;height:200px;background:linear-gradient(180deg,rgba(7,7,12,.85),rgba(7,7,12,0))"></div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:300px;background:linear-gradient(0deg,rgba(7,7,12,.95) 30%,rgba(7,7,12,0))"></div>
  <div style="position:relative">${statusBar("22:14")}
  <div class="row" style="padding:6px 16px">${`<span class="ibtn" style="background:rgba(255,255,255,.14)">${icon("x", 18)}</span>`}<div class="grow row" style="gap:10px;justify-content:center">${avatar("L", 1, 28, "transparent")}<div><div style="font-weight:700;font-size:15px">Liam</div><div style="font-size:12px;font-weight:600;color:rgba(255,255,255,.7)">${N.grad} · 22:14</div></div></div><span class="ibtn" style="background:rgba(255,255,255,.14)">${icon("share", 18)}</span></div></div>
  <div style="position:absolute;left:16px;right:16px;bottom:34px">
    <div class="row" style="gap:8px;margin-bottom:14px"><span class="pill" style="background:rgba(255,255,255,.14);color:#fff;letter-spacing:1px">${icon("image", 13)}${L.original.toUpperCase()} · 12.2 MP</span><span class="pill" style="background:rgba(255,255,255,.14);color:#fff">4032 × 3024</span></div>
    <div class="row" style="gap:4px;margin-bottom:14px">${strip.map((p, i) => `<div class="ph" style="width:46px;height:46px;border-radius:8px;flex:none;background-image:url('${photo(p)}');${i === 2 ? `box-shadow:0 0 0 2px ${C.pink}` : "opacity:.7"}"></div>`).join("")}</div>
    <div class="btn">${icon("download", 20, "#fff", 2.4)}${L.download}</div>
  </div>${homeIndicator()}`;
}

function upload(lang) {
	const L = UI[lang];
	const N = NAMES[lang];
	const pics = [
		"christmas-02",
		"christmas-03",
		"christmas-04",
		"party-07",
		"party-02",
		"christmas-01",
		"party-08",
		"party-05",
		"party-10",
		"party-03",
		"party-11",
		"party-06",
		"christmas-03",
		"party-01",
		"christmas-04",
		"party-09",
		"party-12",
		"christmas-02",
	];
	const done = 11;
	const cells = pics
		.map(
			(p, i) =>
				`${tile(p, i >= done ? "dim" : "", "aspect-ratio:1")}${i < done ? `<span class="sel on" style="width:20px;height:20px;box-shadow:none;background:${C.success}">${icon("check", 12, "#fff", 3)}</span>` : i === done ? `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:2"><svg width="34" height="34" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" stroke="rgba(255,255,255,.3)" stroke-width="3.5" fill="none"/><circle cx="18" cy="18" r="15" stroke="#fff" stroke-width="3.5" fill="none" stroke-dasharray="94" stroke-dashoffset="34" stroke-linecap="round" transform="rotate(-90 18 18)"/></svg></span>` : ""}</div>`
		)
		.join("");
	return `${statusBar("23:52")}
  ${navBar(N.xmas, lang === "nb" ? "Fre 12. des" : "Fri 12 Dec", "left", "share")}
  <div class="card" style="margin:4px 16px 0;padding:16px">
    <div class="row"><span style="width:44px;height:44px;border-radius:14px;background:rgba(255,45,142,.14);display:flex;align-items:center;justify-content:center">${icon("upload", 22, C.pinkSoft, 2.4)}</span>
      <div class="grow"><div style="font-weight:800;font-size:17px;letter-spacing:-.3px">${L.uploading(214, 260)}</div><div class="muted row" style="gap:6px;font-size:13px;font-weight:600;margin-top:3px">${icon("lock", 13, C.success, 2.4)}${L.locked}</div></div>
      <span style="font-weight:800;font-size:17px">82%</span></div>
    <div style="height:8px;border-radius:9px;background:${C.raised};margin-top:14px;overflow:hidden"><div style="width:82%;height:100%;background:${GRAD};border-radius:9px"></div></div>
  </div>
  <div class="row" style="justify-content:space-between;padding:18px 16px 10px"><span class="eyebrow">${L.yourPhotos}</span><span class="pill live">${L.uploaded} 214</span></div>
  <div class="grid" style="--cols:var(--cols3)">${cells}</div>
  ${tabBar("events", L)}${homeIndicator()}`;
}

function info(lang) {
	const L = UI[lang];
	const N = NAMES[lang];
	const blocks = [
		["02", L.days],
		["04", L.hrs],
		["37", L.min],
	];
	return `<div class="ph" style="position:absolute;left:0;right:0;top:0;height:300px;background-image:url('${photo("halloween-02")}');background-position:50% 40%"></div>
  <div style="position:absolute;left:0;right:0;top:0;height:300px;background:linear-gradient(180deg,rgba(11,11,18,.55),rgba(11,11,18,0) 35%,${C.page} 100%)"></div>
  <div style="position:relative">${statusBar("16:23")}${navBar("", "", "left", "share")}
  <div style="padding:120px 16px 0"><span class="pill accent">${icon("calendar", 12)}${lang === "nb" ? "Lør 31. okt · 19:00" : "Sat 31 Oct · 19:00"}</span>
    <div style="font-weight:800;font-size:28px;letter-spacing:-.9px;margin-top:8px">${N.halloween}</div></div>
  <div class="card" style="margin:14px 16px 0;padding:14px 16px">
    <div class="eyebrow" style="color:${C.muted}">${L.startsIn}</div>
    <div class="row" style="gap:8px;margin-top:8px">${blocks.map(([n, l]) => `<div class="raised grow" style="padding:8px 0;text-align:center"><div style="font-weight:800;font-size:26px;letter-spacing:-.6px;font-variant-numeric:tabular-nums">${n}</div><div class="muted" style="font-size:11px;font-weight:700">${l}</div></div>`).join("")}</div>
  </div>
  <div class="card" style="margin:12px 16px 0;padding:2px 16px">
    ${[
			["pin", L.location, L.locValue],
			["tag", L.dress, L.dressValue],
		]
			.map(
				([ic, k, v], i) =>
					`<div class="row" style="padding:12px 0;${i ? `border-top:1px solid ${C.border}` : ""}"><span style="width:36px;height:36px;border-radius:11px;background:rgba(255,45,142,.14);display:flex;align-items:center;justify-content:center">${icon(ic, 17, C.pinkSoft)}</span><div class="grow"><div class="muted" style="font-size:12px;font-weight:600">${k}</div><div style="font-weight:700;font-size:15px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${v}</div></div>${icon("right", 18, C.faint)}</div>`
			)
			.join("")}
  </div>
  <div class="card" style="margin:12px 16px 0;padding:12px 16px 4px">
    <div class="eyebrow">${L.schedule}</div>
    ${L.sched.map(([t, w], i) => `<div class="row" style="padding:8px 0;gap:14px"><span style="font-weight:800;font-size:14px;width:44px;font-variant-numeric:tabular-nums;color:${i === 0 ? C.pinkSoft : "#fff"}">${t}</span><span style="width:8px;height:8px;border-radius:9px;background:${i === 0 ? C.pink : C.border}"></span><span style="font-weight:600;font-size:15px">${w}</span></div>`).join("")}
  </div>
  <div class="btn" style="margin:14px 16px 0">${icon("calendar", 19, "#fff", 2.4)}${L.addCal}</div>
  </div>${homeIndicator()}`;
}

function camera(lang) {
	const L = UI[lang];
	return `<div style="position:absolute;inset:0;background:#000"></div>
  <div class="ph" style="position:absolute;left:0;right:0;top:96px;bottom:190px;background-image:url('${photo("festival-03")}')"></div>
  <div style="position:absolute;left:33.3%;right:33.3%;top:96px;bottom:190px;border-left:1px solid rgba(255,255,255,.22);border-right:1px solid rgba(255,255,255,.22)"></div>
  <div style="position:absolute;left:0;right:0;top:calc(96px + (100% - 286px) / 3);height:calc((100% - 286px) / 3);border-top:1px solid rgba(255,255,255,.22);border-bottom:1px solid rgba(255,255,255,.22)"></div>
  <div style="position:relative">${statusBar("17:42")}
  <div class="row" style="padding:2px 16px;justify-content:space-between"><span class="ibtn" style="background:rgba(255,255,255,.12)">${icon("x", 18)}</span><span class="pill" style="background:rgba(255,255,255,.12);color:#fff;font-size:13px;padding:7px 12px"><span style="width:7px;height:7px;border-radius:9px;background:${C.pink}"></span>${L.camAdding}</span><span class="ibtn" style="background:rgba(255,255,255,.12)">${icon("zap", 17)}</span></div></div>
  <div style="position:absolute;left:50%;bottom:214px;transform:translateX(-50%)"><span class="pill" style="background:rgba(11,11,18,.82);color:#fff;font-size:13.5px;padding:9px 14px;border:1px solid ${C.border}">${icon("checkCircle", 16, C.success, 2.4)}${L.camAdded}</span></div>
  <div style="position:absolute;left:0;right:0;bottom:142px;display:flex;justify-content:center;gap:22px;font-size:13px;font-weight:800;letter-spacing:1px"><span style="color:${C.muted}">${L.video.toUpperCase()}</span><span style="color:${C.pinkSoft}">${L.photo.toUpperCase()}</span></div>
  <div style="position:absolute;left:0;right:0;bottom:40px;display:flex;align-items:center;justify-content:space-between;padding:0 34px">
    <div class="ph" style="width:52px;height:52px;border-radius:12px;background-image:url('${photo("festival-01")}');box-shadow:0 0 0 2px #fff"></div>
    <div style="width:82px;height:82px;border-radius:99px;background:${GRAD};padding:5px"><div style="width:100%;height:100%;border-radius:99px;background:#000;padding:4px"><div style="width:100%;height:100%;border-radius:99px;background:#fff"></div></div></div>
    <span class="ibtn" style="width:52px;height:52px;background:rgba(255,255,255,.12)">${icon("rotate", 22)}</span>
  </div>${homeIndicator()}`;
}

function save(lang) {
	const L = UI[lang];
	const N = NAMES[lang];
	return `<div class="ph" style="position:absolute;left:0;right:0;top:0;height:270px;background-image:url('${photo("nye-01")}');background-position:50% 40%"></div>
  <div style="position:absolute;left:0;right:0;top:0;height:270px;background:linear-gradient(180deg,rgba(11,11,18,.5),rgba(11,11,18,0) 35%,${C.page} 100%)"></div>
  <div style="position:relative">${statusBar("11:08")}${navBar("", "", "left", "share")}
  <div style="padding:96px 16px 0"><span class="pill warn">${icon("clock", 12)}${L.deletes}</span>
    <div style="font-weight:800;font-size:28px;letter-spacing:-.9px;margin-top:8px">${N.nye}</div>
    <div class="muted" style="font-size:14px;font-weight:600;margin-top:4px">1 204 · 31 ${L.guests.toLowerCase()}</div></div>
  <div class="card" style="margin:16px 16px 0;padding:16px">
    <div class="row"><span style="width:44px;height:44px;border-radius:14px;background:rgba(255,45,142,.14);display:flex;align-items:center;justify-content:center">${icon("download", 22, C.pinkSoft, 2.4)}</span>
      <div class="grow"><div style="font-weight:800;font-size:17px;letter-spacing:-.3px">${L.saveAll}</div><div class="muted" style="font-size:13px;font-weight:600;margin-top:3px">${L.saving(847, "1 204")}</div></div><span style="font-weight:800;font-size:17px">70%</span></div>
    <div style="height:8px;border-radius:9px;background:${C.raised};margin-top:14px;overflow:hidden"><div style="width:70%;height:100%;background:${GRAD};border-radius:9px"></div></div>
    <div class="row" style="gap:3px;margin-top:14px">${["nye-02", "party-04", "party-07", "party-01", "party-09", "party-03"].map((p) => `<div class="ph grow" style="aspect-ratio:1;border-radius:8px;background-image:url('${photo(p)}')"></div>`).join("")}</div>
    <div class="muted row" style="gap:6px;font-size:12.5px;font-weight:600;margin-top:12px">${icon("smartphone", 13)}${L.toRoll}</div>
  </div>
  <div class="card" style="margin:12px 16px 0;padding:6px 16px">
    <div class="eyebrow" style="padding-top:10px">${L.privacy}</div>
    ${[
			["lock", L.p1],
			["eyeOff", L.p2],
			["trash", L.p3],
		]
			.map(
				([ic, t], i) =>
					`<div class="row" style="padding:11px 0;${i ? `border-top:1px solid ${C.border}` : ""}"><span style="width:32px;height:32px;border-radius:10px;background:rgba(34,197,94,.16);display:flex;align-items:center;justify-content:center">${icon(ic, 16, C.success)}</span><div class="grow" style="font-weight:700;font-size:15px">${t}</div>${icon("check", 18, C.success, 2.6)}</div>`
			)
			.join("")}
  </div>
  </div>${tabBar("events", L)}${homeIndicator()}`;
}

export const SCREENS = [found, invite, feed, viewer, upload, info, camera, save];
