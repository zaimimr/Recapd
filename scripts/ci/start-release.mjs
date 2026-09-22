#!/usr/bin/env node
/**
 * Opens a release: one build number, one version, for every store.
 *
 *   node scripts/ci/start-release.mjs
 *
 * release.json holds the last build number used. This bumps it, bumps the patch
 * in app.json, and moves store/release-notes/next.md into place under the new
 * version. Both platform jobs then read the same numbers, so an Android release
 * and an iOS release cut from the same commit carry the same build number even
 * when they are built hours apart.
 *
 * Writes build= and version= to GITHUB_OUTPUT when running in Actions.
 */
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

// These files are hand-formatted and biome-checked, so patch the one line that
// changes rather than reserialising and reindenting the whole thing.
function patchLine(file, pattern, replacement) {
	const contents = readFileSync(file, "utf8");

	if (!pattern.test(contents)) {
		console.error(`${file} does not match ${pattern}`);
		process.exit(1);
	}

	writeFileSync(file, contents.replace(pattern, replacement));
}

const RELEASE_FILE = "release.json";
const NEXT_NOTES = "store/release-notes/next.md";

const release = JSON.parse(readFileSync(RELEASE_FILE, "utf8"));

if (!Number.isInteger(release.build)) {
	console.error(`${RELEASE_FILE} has no integer "build"`);
	process.exit(1);
}

const build = release.build + 1;

const appConfig = JSON.parse(readFileSync("app.json", "utf8"));
const previous = appConfig.expo?.version;
const parts = previous?.split(".").map(Number);

if (!parts || parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
	console.error(`app.json version "${previous}" is not major.minor.patch`);
	process.exit(1);
}

const version = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
const notes = `store/release-notes/${version}.md`;

// The notes have to exist before the number is burned, or the stores get a
// release nobody can read. next.md is where you write them between releases.
if (!existsSync(notes)) {
	const draft = existsSync(NEXT_NOTES) ? readFileSync(NEXT_NOTES, "utf8").trim() : "";

	if (!draft || draft.split("\n").every((line) => line.startsWith("#"))) {
		console.error(`write ${NEXT_NOTES} before releasing. It becomes ${notes}.`);
		process.exit(1);
	}

	renameSync(NEXT_NOTES, notes);
	writeFileSync(NEXT_NOTES, "# What goes out next. Bullets only, under 500 characters.\n");
	console.log(`${NEXT_NOTES} -> ${notes}`);
}

patchLine(RELEASE_FILE, /"build":\s*\d+/, `"build": ${build}`);
patchLine("app.json", /"version":\s*"[^"]*"/, `"version": "${version}"`);

console.log(`release ${version}, build ${build}`);

if (process.env.GITHUB_OUTPUT) {
	appendFileSync(process.env.GITHUB_OUTPUT, `build=${build}\nversion=${version}\n`);
}
