#!/usr/bin/env node
/**
 * Uploads an AAB to a Google Play track.
 *
 *   node scripts/ci/play-upload.mjs <path-to-aab> [track]
 *
 * Needs PLAY_SERVICE_ACCOUNT_KEY_PATH pointing at the service account JSON.
 * Defaults to the internal track, which is the only thing CI should touch.
 */
import { existsSync } from "node:fs";
import { google } from "googleapis";

const PACKAGE_NAME = "com.zaimimran.recapd";

const [, , aabPath, track = "internal"] = process.argv;
const keyFile = process.env.PLAY_SERVICE_ACCOUNT_KEY_PATH;

if (!aabPath || !existsSync(aabPath)) {
	console.error(`AAB not found at "${aabPath}"`);
	process.exit(1);
}

if (!keyFile || !existsSync(keyFile)) {
	console.error("PLAY_SERVICE_ACCOUNT_KEY_PATH is not set or the file is missing");
	process.exit(1);
}

if (track === "production") {
	console.error("refusing to publish to production from CI, promote it by hand");
	process.exit(1);
}

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
	media: { mimeType: "application/octet-stream", body: (await import("node:fs")).createReadStream(aabPath) },
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
				versionCodes: [String(bundle.versionCode)],
				status: "completed",
			},
		],
	},
});

await androidpublisher.edits.commit({ packageName: PACKAGE_NAME, editId: edit.id });
console.log(`versionCode ${bundle.versionCode} is live on the ${track} track`);
