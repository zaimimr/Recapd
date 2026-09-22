#!/usr/bin/env node
/**
 * Reads the release notes for the version in app.json.
 *
 *   store/release-notes/<version>.md
 *
 * Both stores get the same text. Run this file directly to print it.
 */
import { readFileSync } from "node:fs";

// Play rejects anything longer per language; App Store Connect allows 4000.
const PLAY_LIMIT = 500;

export function appVersion() {
	const { expo } = JSON.parse(readFileSync("app.json", "utf8"));

	if (!expo?.version) {
		throw new Error("app.json has no expo.version");
	}

	return expo.version;
}

export function releaseNotes(version = appVersion()) {
	const path = `store/release-notes/${version}.md`;
	let raw;

	try {
		raw = readFileSync(path, "utf8");
	} catch {
		throw new Error(`no release notes for ${version}. Write ${path} and commit it.`);
	}

	const text = raw
		.split("\n")
		.map((line) => line.replace(/^\s*[-*]\s+/, "- ").trimEnd())
		.filter((line) => line.length > 0 && !line.startsWith("#"))
		.join("\n")
		.trim();

	if (!text) {
		throw new Error(`${path} is empty`);
	}

	if (text.length > PLAY_LIMIT) {
		throw new Error(`${path} is ${text.length} characters, Play allows ${PLAY_LIMIT}`);
	}

	return text;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	process.stdout.write(releaseNotes());
}
