import fs from "node:fs";
import path from "node:path";
import { APP_ID, api } from "./asc.mjs";
import { PACKAGE, play } from "./play.mjs";

const dest = process.argv[2];
if (!dest) throw new Error("usage: node backup.mjs <dir>");

async function download(url, file) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

async function backupPlay() {
	const ap = await play();
	const { data: edit } = await ap.edits.insert({ packageName: PACKAGE });
	const editId = edit.id;
	const { data: details } = await ap.edits.details.get({ packageName: PACKAGE, editId });
	const { data: listings } = await ap.edits.listings.list({ packageName: PACKAGE, editId });
	fs.mkdirSync(`${dest}/play`, { recursive: true });
	fs.writeFileSync(`${dest}/play/listing.json`, JSON.stringify({ details, listings }, null, 2));
	for (const { language } of listings.listings || []) {
		for (const imageType of [
			"phoneScreenshots",
			"sevenInchScreenshots",
			"tenInchScreenshots",
			"featureGraphic",
			"icon",
		]) {
			const { data } = await ap.edits.images.list({
				packageName: PACKAGE,
				editId,
				language,
				imageType,
			});
			let i = 0;
			for (const img of data.images || []) {
				i += 1;
				await download(
					`${img.url}=s0`,
					`${dest}/play/${language}/${imageType}/${String(i).padStart(2, "0")}.png`
				);
			}
		}
	}
	await ap.edits.delete({ packageName: PACKAGE, editId });
}

async function backupAsc() {
	const versions = await api(`/v1/apps/${APP_ID}/appStoreVersions?limit=3`);
	const out = { versions: [] };
	for (const v of versions.data.slice(0, 2)) {
		const locs = await api(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`);
		const entry = { id: v.id, attributes: v.attributes, localizations: [] };
		for (const loc of locs.data) {
			const sets = await api(
				`/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?include=appScreenshots&limit[appScreenshots]=10`
			);
			const shots = {};
			for (const set of sets.data) {
				const type = set.attributes.screenshotDisplayType;
				const ids = set.relationships.appScreenshots.data.map((d) => d.id);
				shots[type] = [];
				let i = 0;
				for (const id of ids) {
					const s = (sets.included || []).find((x) => x.id === id);
					const asset = s?.attributes?.imageAsset;
					i += 1;
					shots[type].push({ id, fileName: s?.attributes?.fileName });
					if (asset?.templateUrl && v === versions.data[0]) {
						const url = asset.templateUrl
							.replace("{w}", asset.width)
							.replace("{h}", asset.height)
							.replace("{f}", "png");
						await download(
							url,
							`${dest}/asc/${loc.attributes.locale}/${type}/${String(i).padStart(2, "0")}.png`
						);
					}
				}
			}
			entry.localizations.push({ id: loc.id, attributes: loc.attributes, screenshots: shots });
		}
		out.versions.push(entry);
	}
	const infos = await api(`/v1/apps/${APP_ID}/appInfos`);
	out.appInfos = [];
	for (const info of infos.data) {
		const locs = await api(`/v1/appInfos/${info.id}/appInfoLocalizations`);
		out.appInfos.push({
			id: info.id,
			attributes: info.attributes,
			localizations: locs.data.map((l) => ({ id: l.id, attributes: l.attributes })),
		});
	}
	fs.mkdirSync(`${dest}/asc`, { recursive: true });
	fs.writeFileSync(`${dest}/asc/metadata.json`, JSON.stringify(out, null, 2));
}

await backupPlay();
await backupAsc();
console.log("backup written to", dest);
