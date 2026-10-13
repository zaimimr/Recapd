import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_ID, api } from "./asc.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const CREATIVE =
	process.env.CREATIVE || path.join(os.homedir(), "Desktop/Recapd-store-cpp-2026-10-09/creative");
const SHOTS = path.join(here, "out");
const LOCALES = { "en-US": "en", no: "nb" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGES = {
	wedding: {
		name: "Wedding photos",
		promo: {
			"en-US":
				"Every guest’s wedding photos in one private album. Guests scan a QR code and join from the browser, no app or account needed.",
			no: "Alle gjestenes bryllupsbilder i ett privat album. Gjestene skanner en QR-kode og blir med fra nettleseren, uten app eller konto.",
		},
	},
	birthday: {
		name: "Birthday photos",
		promo: {
			"en-US":
				"Collect every photo from the birthday in full quality. Guests scan a QR code and add their shots, no app needed.",
			no: "Samle alle bildene fra bursdagen i full kvalitet. Gjestene skanner en QR-kode og legger til bildene sine, uten app.",
		},
	},
	halloween: {
		name: "Halloween photos",
		promo: {
			"en-US":
				"All the costumes, all the photos, from every guest’s phone. One QR code and the whole party lands in one album.",
			no: "Alle kostymene og alle bildene, fra alles mobiler. Én QR-kode, og hele festen havner i ett album.",
		},
	},
	christmas: {
		name: "Christmas party photos",
		promo: {
			"en-US":
				"Every photo from the Christmas party, shared by everyone there. Guests join by QR code, no app or account.",
			no: "Alle bildene fra julebordet, delt av alle som var der. Gjestene blir med via QR-kode, uten app eller konto.",
		},
	},
};

const PPO = {
	name: "Header and search results",
	treatments: { "ppo-find": "Finds your photos", "ppo-noapp": "No app for guests" },
};

const PLACEMENTS = {
	"universal.png": "PRODUCT_PAGE_HEADER_ASSET",
	"search.jpg": "APP_STORE_SEARCH_RESULTS_ASSET",
};

async function putChunks(ops, buf) {
	for (const op of ops) {
		const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]));
		const res = await fetch(op.url, {
			method: op.method,
			headers,
			body: buf.subarray(op.offset, op.offset + op.length),
		});
		if (!res.ok) throw new Error(`chunk ${res.status}`);
	}
}

async function uploadImage(file, name) {
	const buf = fs.readFileSync(file);
	const r = await api("/v1/appAssetLibraryImages", {
		method: "POST",
		body: {
			data: {
				type: "appAssetLibraryImages",
				attributes: { fileSize: buf.length, fileName: name, category: "CREATIVE_ASSETS" },
				relationships: { assetLibrary: { data: { type: "appAssetLibraries", id: APP_ID } } },
			},
		},
	});
	await putChunks(r.data.attributes.uploadOperations, buf);
	await api(`/v1/appAssetLibraryImages/${r.data.id}`, {
		method: "PATCH",
		body: {
			data: { type: "appAssetLibraryImages", id: r.data.id, attributes: { uploaded: true } },
		},
	});
	return r.data.id;
}

async function place(set, lang, rel, locId) {
	const out = [];
	for (const [file, placementType] of Object.entries(PLACEMENTS)) {
		const image = await uploadImage(path.join(CREATIVE, lang, set, file), `${set}-${lang}-${file}`);
		const p = await api("/v1/appAssetLibraryPlacements", {
			method: "POST",
			body: {
				data: {
					type: "appAssetLibraryPlacements",
					attributes: { placementType },
					relationships: {
						image: { data: { type: "appAssetLibraryImages", id: image } },
						[rel.name]: { data: { type: rel.type, id: locId } },
					},
				},
			},
		});
		out.push({ id: p.data.id, label: `${set} ${lang} ${file}` });
	}
	return out;
}

const SHOT_SETS = { APP_IPHONE_67: "iphone", APP_IPAD_PRO_3GEN_129: "ipad" };

async function uploadShots(locId, lang) {
	const have = (
		await api(`/v1/appCustomProductPageLocalizations/${locId}/appScreenshotSets`)
	).data.map((s) => s.attributes.screenshotDisplayType);
	for (const [type, dir] of Object.entries(SHOT_SETS))
		if (!have.includes(type)) await uploadShotSet(locId, path.join(SHOTS, lang, dir), type);
}

async function uploadShotSet(locId, dir, type) {
	const set = (
		await api("/v1/appScreenshotSets", {
			method: "POST",
			body: {
				data: {
					type: "appScreenshotSets",
					attributes: { screenshotDisplayType: type },
					relationships: {
						appCustomProductPageLocalization: {
							data: { type: "appCustomProductPageLocalizations", id: locId },
						},
					},
				},
			},
		})
	).data;
	for (const f of fs
		.readdirSync(dir)
		.filter((f) => f.endsWith(".png"))
		.sort()) {
		const buf = fs.readFileSync(path.join(dir, f));
		const r = await api("/v1/appScreenshots", {
			method: "POST",
			body: {
				data: {
					type: "appScreenshots",
					attributes: { fileName: f, fileSize: buf.length },
					relationships: { appScreenshotSet: { data: { type: "appScreenshotSets", id: set.id } } },
				},
			},
		});
		await putChunks(r.data.attributes.uploadOperations, buf);
		await api(`/v1/appScreenshots/${r.data.id}`, {
			method: "PATCH",
			body: {
				data: {
					type: "appScreenshots",
					id: r.data.id,
					attributes: {
						uploaded: true,
						sourceFileChecksum: crypto.createHash("md5").update(buf).digest("hex"),
					},
				},
			},
		});
	}
}

const pending = [];
const existing = (await api(`/v1/apps/${APP_ID}/appCustomProductPages?limit=50`)).data;
const only = process.env.PAGES?.split(",");

for (const [set, page] of Object.entries(PAGES)) {
	if (only && !only.includes(set)) continue;
	const old = existing.find((p) => p.attributes.name === page.name);
	if (old) {
		const v = (await api(`/v1/appCustomProductPages/${old.id}/appCustomProductPageVersions`))
			.data[0].id;
		for (const loc of (
			await api(`/v1/appCustomProductPageVersions/${v}/appCustomProductPageLocalizations`)
		).data)
			await uploadShots(loc.id, LOCALES[loc.attributes.locale]);
		console.log(page.name, "exists", old.attributes.url);
		continue;
	}
	const locales = Object.keys(LOCALES);
	const r = await api("/v1/appCustomProductPages", {
		method: "POST",
		body: {
			data: {
				type: "appCustomProductPages",
				attributes: { name: page.name },
				relationships: {
					app: { data: { type: "apps", id: APP_ID } },
					appCustomProductPageVersions: {
						data: [{ type: "appCustomProductPageVersions", id: "${v}" }],
					},
				},
			},
			included: [
				{
					type: "appCustomProductPageVersions",
					id: "${v}",
					relationships: {
						appCustomProductPageLocalizations: {
							data: locales.map((l) => ({
								type: "appCustomProductPageLocalizations",
								id: `\${${l}}`,
							})),
						},
					},
				},
				...locales.map((l) => ({
					type: "appCustomProductPageLocalizations",
					id: `\${${l}}`,
					attributes: { locale: l, promotionalText: page.promo[l] },
				})),
			],
		},
	});
	const versionId = r.included.find((i) => i.type === "appCustomProductPageVersions").id;
	const locs = (
		await api(`/v1/appCustomProductPageVersions/${versionId}/appCustomProductPageLocalizations`)
	).data;
	for (const loc of locs) {
		const lang = LOCALES[loc.attributes.locale];
		await uploadShots(loc.id, lang);
		pending.push(
			...(await place(
				set,
				lang,
				{ name: "appCustomProductPageLocalization", type: "appCustomProductPageLocalizations" },
				loc.id
			))
		);
	}
	console.log(page.name, r.data.attributes.url);
}

if (!only || only.includes("ppo")) {
	const found = await api(
		`/v1/apps/${APP_ID}/appStoreVersionExperimentsV2?include=appStoreVersionExperimentTreatments`
	);
	const exp =
		found.data.find((e) => e.attributes.name === PPO.name) ||
		(
			await api("/v2/appStoreVersionExperiments", {
				method: "POST",
				body: {
					data: {
						type: "appStoreVersionExperiments",
						attributes: { name: PPO.name, platform: "IOS", trafficProportion: 50 },
						relationships: { app: { data: { type: "apps", id: APP_ID } } },
					},
				},
			})
		).data;
	for (const [set, name] of Object.entries(PPO.treatments)) {
		if ((found.included || []).some((t) => t.attributes.name === name)) continue;
		const t = (
			await api("/v1/appStoreVersionExperimentTreatments", {
				method: "POST",
				body: {
					data: {
						type: "appStoreVersionExperimentTreatments",
						attributes: { name },
						relationships: {
							appStoreVersionExperimentV2: {
								data: { type: "appStoreVersionExperiments", id: exp.id },
							},
						},
					},
				},
			})
		).data;
		for (const [locale, lang] of Object.entries(LOCALES)) {
			const created = await api("/v1/appStoreVersionExperimentTreatmentLocalizations", {
				method: "POST",
				body: {
					data: {
						type: "appStoreVersionExperimentTreatmentLocalizations",
						attributes: { locale },
						relationships: {
							appStoreVersionExperimentTreatment: {
								data: { type: "appStoreVersionExperimentTreatments", id: t.id },
							},
						},
					},
				},
			}).catch((e) => {
				if (String(e).includes("not configured in app version")) return null;
				throw e;
			});
			if (!created) continue;
			const loc = created.data;
			pending.push(
				...(await place(
					set,
					lang,
					{
						name: "appStoreVersionExperimentTreatmentLocalization",
						type: "appStoreVersionExperimentTreatmentLocalizations",
					},
					loc.id
				))
			);
		}
	}
	console.log("PPO", exp.id);
}

const states = {};
for (let round = 0; round < 40; round++) {
	let open = 0;
	for (const p of pending) {
		if (["ACTIVE", "COMPLETE", "FAILED"].includes(states[p.id])) continue;
		const s = (await api(`/v1/appAssetLibraryPlacements/${p.id}`)).data.attributes;
		states[p.id] = s.state;
		if (s.state === "FAILED") console.log("FAILED", p.label, JSON.stringify(s.stateDetails));
		if (!["ACTIVE", "COMPLETE", "FAILED"].includes(s.state)) open += 1;
	}
	if (!open) break;
	await sleep(5000);
}
const summary = {};
for (const p of pending) summary[states[p.id]] = (summary[states[p.id]] || 0) + 1;
console.log(JSON.stringify(summary));
