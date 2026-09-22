#!/usr/bin/env node
/**
 * Uploads an AAB to a Google Play track.
 *
 *   node scripts/ci/play-upload.mjs <path-to-aab> [track] [--draft]
 *
 * Needs PLAY_SERVICE_ACCOUNT_KEY_PATH pointing at the service account JSON.
 * Defaults to the internal track, which goes straight to testers.
 *
 * --draft stages the release instead of rolling it out. That is the only way
 * CI is allowed near production: the console then shows a draft release that a
 * human reviews and rolls out by hand.
 */
import { existsSync } from "node:fs";
import { google } from "googleapis";
import { appVersion, releaseNotes } from "./release-notes.mjs";

const PACKAGE_NAME = "com.zaimimran.recapd";

const args = process.argv.slice(2).filter((arg) => arg !== "--draft");
const draft = process.argv.includes("--draft");
const [aabPath, track = "internal"] = args;
const keyFile = process.env.PLAY_SERVICE_ACCOUNT_KEY_PATH;

if (!aabPath || !existsSync(aabPath)) {
	console.error(`AAB not found at "${aabPath}"`);
	process.exit(1);
}

if (!keyFile || !existsSync(keyFile)) {
	console.error("PLAY_SERVICE_ACCOUNT_KEY_PATH is not set or the file is missing");
	process.exit(1);
}

if (track === "production" && !draft) {
	console.error(
		"refusing to roll out to production from CI. Pass --draft and roll it out by hand."
	);
	process.exit(1);
}

const version = appVersion();
const notes = releaseNotes(version);

// GOTCHA: new google.auth.JWT(...) fails with "Request is missing required
// authentication credential". GoogleAuth + getClient() works.
const auth = new google.auth.GoogleAuth({
	keyFile,
	scopes: ["https://www.googleapis.com/auth/androidpublisher"],
});

const androidpublisher = google.androidpublisher({ version: "v3", auth: await auth.getClient() });

const { data: edit } = await androidpublisher.edits.insert({ packageName: PACKAGE_NAME });
console.log(`opened edit ${edit.id}`);

const { data: bundle } = await androidpublisher.edits.bundles.upload({
	packageName: PACKAGE_NAME,
	editId: edit.id,
	media: {
		mimeType: "application/octet-stream",
		body: (await import("node:fs")).createReadStream(aabPath),
	},
});

console.log(`uploaded versionCode ${bundle.versionCode}`);

await androidpublisher.edits.tracks.update({
	packageName: PACKAGE_NAME,
	editId: edit.id,
	track,
	requestBody: {
		track,
		releases: [
			{
				name: version,
				versionCodes: [String(bundle.versionCode)],
				status: draft ? "draft" : "completed",
				releaseNotes: [{ language: "en-US", text: notes }],
			},
		],
	},
});

await androidpublisher.edits.commit({ packageName: PACKAGE_NAME, editId: edit.id });

if (draft) {
	console.log(
		`versionCode ${bundle.versionCode} is a draft release on ${track}, waiting for a human to roll it out`
	);
} else {
	console.log(`versionCode ${bundle.versionCode} is live on the ${track} track`);
}
