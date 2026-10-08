import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../store/listing");
const LIMITS = {
	ios_name: 30,
	ios_subtitle: 30,
	ios_keywords: 100,
	ios_promo: 170,
	play_title: 30,
	play_short: 80,
	description: 4000,
};
let bad = 0;

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
	const c = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
	for (const [k, max] of Object.entries(LIMITS)) {
		const n = [...c[k]].length;
		const ok = n <= max;
		if (!ok) bad += 1;
		console.log(`${file} ${k} ${n}/${max}${ok ? "" : " OVER"}`);
	}
	const all = JSON.stringify(c);
	if (all.includes("—")) {
		bad += 1;
		console.log(`${file} contains em dash`);
	}
	if (/android|google play/i.test(c.description + c.ios_promo + c.ios_subtitle + c.ios_keywords)) {
		bad += 1;
		console.log(`${file} mentions Android in iOS copy`);
	}
	const words = (s) =>
		s
			.toLowerCase()
			.split(/[^\p{L}\p{N}]+/u)
			.filter((w) => w.length > 1);
	const kw = c.ios_keywords.split(",");
	if (kw.some((k) => k !== k.trim() || !k)) {
		bad += 1;
		console.log(`${file} keyword spacing`);
	}
	const seen = new Set([...words(c.ios_name), ...words(c.ios_subtitle)]);
	for (const k of kw) {
		if (seen.has(k)) {
			bad += 1;
			console.log(`${file} repeated keyword ${k}`);
		}
		seen.add(k);
	}
}
process.exit(bad ? 1 : 0);
