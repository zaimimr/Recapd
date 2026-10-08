import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { PACKAGE, play, withRetry } from "./play.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out");
const LANGS = { "en-US": { copy: "en-US", out: "en" }, "no-NO": { copy: "nb-NO", out: "nb" } };
const IMAGES = {
	phoneScreenshots: "android",
	sevenInchScreenshots: "ipad",
	tenInchScreenshots: "ipad",
};

const ap = await play();
const packageName = PACKAGE;
const { data: edit } = await withRetry(() => ap.edits.insert({ packageName }));
const editId = edit.id;
console.log("edit", editId);

async function upload(language, imageType, file) {
	const jpeg = await sharp(file).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
	await withRetry(() =>
		ap.edits.images.upload({
			packageName,
			editId,
			language,
			imageType,
			media: { mimeType: "image/jpeg", body: Readable.from(jpeg) },
		})
	);
}

for (const [language, { copy, out }] of Object.entries(LANGS)) {
	const c = JSON.parse(
		fs.readFileSync(path.join(here, "../../store/listing", `${copy}.json`), "utf8")
	);
	await withRetry(() =>
		ap.edits.listings.update({
			packageName,
			editId,
			language,
			requestBody: {
				language,
				title: c.play_title,
				shortDescription: c.play_short,
				fullDescription: c.description,
			},
		})
	);
	console.log(language, "listing");
	for (const [imageType, dir] of Object.entries(IMAGES)) {
		await withRetry(() => ap.edits.images.deleteall({ packageName, editId, language, imageType }));
		const files = fs
			.readdirSync(path.join(OUT, out, dir))
			.filter((f) => f.endsWith(".png"))
			.sort();
		for (const f of files) await upload(language, imageType, path.join(OUT, out, dir, f));
		console.log(language, imageType, files.length);
	}
	await withRetry(() =>
		ap.edits.images.deleteall({ packageName, editId, language, imageType: "featureGraphic" })
	);
	await upload(language, "featureGraphic", path.join(OUT, out, "feature", "feature.png"));
	console.log(language, "featureGraphic");
}

await withRetry(() => ap.edits.validate({ packageName, editId }));
const { data: done } = await withRetry(() => ap.edits.commit({ packageName, editId }));
console.log("committed", done.id);

const { data: check } = await ap.edits.insert({ packageName });
for (const language of Object.keys(LANGS)) {
	const { data: l } = await ap.edits.listings.get({ packageName, editId: check.id, language });
	const counts = {};
	for (const t of [...Object.keys(IMAGES), "featureGraphic"]) {
		const { data } = await ap.edits.images.list({
			packageName,
			editId: check.id,
			language,
			imageType: t,
		});
		counts[t] = (data.images || []).length;
	}
	console.log("verify", language, l.title, JSON.stringify(counts));
}
await ap.edits.delete({ packageName, editId: check.id });
