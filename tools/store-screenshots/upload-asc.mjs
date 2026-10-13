import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_ID, api } from "./asc.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out");
const LOCALES = { "en-US": { copy: "en-US", out: "en" }, no: { copy: "nb-NO", out: "nb" } };
const SETS = { APP_IPHONE_67: "iphone", APP_IPHONE_65: "iphone65", APP_IPAD_PRO_3GEN_129: "ipad" };
const EDITABLE = [
	"PREPARE_FOR_SUBMISSION",
	"READY_FOR_REVIEW",
	"DEVELOPER_REJECTED",
	"REJECTED",
	"METADATA_REJECTED",
];
const copyFor = (loc) =>
	JSON.parse(
		fs.readFileSync(path.join(here, "../../store/listing", `${LOCALES[loc].copy}.json`), "utf8")
	);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const versions = await api(`/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=5`);
const version = versions.data.find((v) => EDITABLE.includes(v.attributes.appStoreState));
const subs = await api(`/v1/reviewSubmissions?filter[app]=${APP_ID}&filter[platform]=IOS&limit=10`);
const inReview = subs.data.some(
	(s) =>
		["WAITING_FOR_REVIEW", "IN_REVIEW", "UNRESOLVED_ISSUES"].includes(s.attributes.state) &&
		s.attributes.submittedDate
);
const promoOnly = !version || inReview;
const target = version || versions.data[0];
console.log(
	"version",
	target.attributes.versionString,
	target.attributes.appStoreState,
	promoOnly ? "PROMO ONLY" : "full"
);

const locs = (await api(`/v1/appStoreVersions/${target.id}/appStoreVersionLocalizations`)).data;
const versionLoc = {};
for (const locale of Object.keys(LOCALES)) {
	const c = copyFor(locale);
	const existing = locs.find((l) => l.attributes.locale === locale);
	const attrs = promoOnly
		? { promotionalText: c.ios_promo }
		: {
				description: c.description,
				keywords: c.ios_keywords,
				promotionalText: c.ios_promo,
				marketingUrl: c.marketing_url,
				supportUrl: c.support_url,
			};
	if (existing) {
		await api(`/v1/appStoreVersionLocalizations/${existing.id}`, {
			method: "PATCH",
			body: { data: { type: "appStoreVersionLocalizations", id: existing.id, attributes: attrs } },
		});
		versionLoc[locale] = existing.id;
	} else if (!promoOnly) {
		const r = await api("/v1/appStoreVersionLocalizations", {
			method: "POST",
			body: {
				data: {
					type: "appStoreVersionLocalizations",
					attributes: { locale, ...attrs },
					relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: target.id } } },
				},
			},
		});
		versionLoc[locale] = r.data.id;
	}
	console.log(locale, "version localization", versionLoc[locale] || "skipped");
}

if (promoOnly) process.exit(0);

const infos = (await api(`/v1/apps/${APP_ID}/appInfos`)).data;
const info = infos.find((i) => i.attributes.state !== "READY_FOR_DISTRIBUTION") || infos[0];
const infoLocs = (await api(`/v1/appInfos/${info.id}/appInfoLocalizations`)).data;
for (const locale of Object.keys(LOCALES)) {
	const c = copyFor(locale);
	const attrs = { name: c.ios_name, subtitle: c.ios_subtitle, privacyPolicyUrl: c.privacy_url };
	const existing = infoLocs.find((l) => l.attributes.locale === locale);
	if (existing)
		await api(`/v1/appInfoLocalizations/${existing.id}`, {
			method: "PATCH",
			body: { data: { type: "appInfoLocalizations", id: existing.id, attributes: attrs } },
		});
	else
		await api("/v1/appInfoLocalizations", {
			method: "POST",
			body: {
				data: {
					type: "appInfoLocalizations",
					attributes: { locale, ...attrs },
					relationships: { appInfo: { data: { type: "appInfos", id: info.id } } },
				},
			},
		});
	console.log(locale, "app info localization");
}

if (target.attributes.appStoreState === "READY_FOR_REVIEW") {
	console.log(
		"screenshots are locked while the version is READY_FOR_REVIEW, remove it from the draft review submission first"
	);
	process.exit(0);
}

async function uploadShot(setId, file) {
	const buf = fs.readFileSync(file);
	const name = path.basename(file);
	const r = await api("/v1/appScreenshots", {
		method: "POST",
		body: {
			data: {
				type: "appScreenshots",
				attributes: { fileName: name, fileSize: buf.length },
				relationships: { appScreenshotSet: { data: { type: "appScreenshotSets", id: setId } } },
			},
		},
	});
	for (const op of r.data.attributes.uploadOperations) {
		const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]));
		const res = await fetch(op.url, {
			method: op.method,
			headers,
			body: buf.subarray(op.offset, op.offset + op.length),
		});
		if (!res.ok) throw new Error(`chunk ${res.status} ${name}`);
	}
	const md5 = crypto.createHash("md5").update(buf).digest("hex");
	await api(`/v1/appScreenshots/${r.data.id}`, {
		method: "PATCH",
		body: {
			data: {
				type: "appScreenshots",
				id: r.data.id,
				attributes: { uploaded: true, sourceFileChecksum: md5 },
			},
		},
	});
	return r.data.id;
}

const pending = [];
const shotLocales = process.env.SHOT_LOCALES
	? process.env.SHOT_LOCALES.split(",")
	: Object.keys(versionLoc);
for (const [locale, locId] of Object.entries(versionLoc).filter(([l]) => shotLocales.includes(l))) {
	const sets = (
		await api(
			`/v1/appStoreVersionLocalizations/${locId}/appScreenshotSets?include=appScreenshots&limit[appScreenshots]=10`
		)
	).data;
	for (const [type, dir] of Object.entries(SETS)) {
		let set = sets.find((s) => s.attributes.screenshotDisplayType === type);
		if (!set)
			set = (
				await api("/v1/appScreenshotSets", {
					method: "POST",
					body: {
						data: {
							type: "appScreenshotSets",
							attributes: { screenshotDisplayType: type },
							relationships: {
								appStoreVersionLocalization: {
									data: { type: "appStoreVersionLocalizations", id: locId },
								},
							},
						},
					},
				})
			).data;
		for (const old of set.relationships?.appScreenshots?.data || [])
			await api(`/v1/appScreenshots/${old.id}`, { method: "DELETE" });
		const files = fs
			.readdirSync(path.join(OUT, LOCALES[locale].out, dir))
			.filter((f) => f.endsWith(".png"))
			.sort();
		const ids = [];
		for (const f of files)
			ids.push(await uploadShot(set.id, path.join(OUT, LOCALES[locale].out, dir, f)));
		await api(`/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`, {
			method: "PATCH",
			body: { data: ids.map((id) => ({ type: "appScreenshots", id })) },
		});
		pending.push(...ids.map((id) => ({ id, label: `${locale} ${type}` })));
		console.log(locale, type, ids.length);
	}
}

const states = {};
for (let round = 0; round < 40; round++) {
	let open = 0;
	for (const p of pending) {
		if (states[p.id] === "COMPLETE") continue;
		const s = await api(`/v1/appScreenshots/${p.id}`);
		states[p.id] = s.data.attributes.assetDeliveryState?.state;
		if (states[p.id] === "FAILED")
			throw new Error(
				`${p.label} ${p.id} FAILED ${JSON.stringify(s.data.attributes.assetDeliveryState.errors)}`
			);
		if (states[p.id] !== "COMPLETE") open += 1;
	}
	if (!open) break;
	await sleep(5000);
}
const summary = {};
for (const p of pending)
	summary[`${p.label} ${states[p.id]}`] = (summary[`${p.label} ${states[p.id]}`] || 0) + 1;
console.log(JSON.stringify(summary, null, 1));
