#!/usr/bin/env node
/**
 * Stamps the build number into the freshly prebuilt native projects.
 *
 * app.json is the single source of truth for the marketing version. The build
 * number comes from release.json by way of the prepare job, so both platforms
 * stamp the same one.
 *
 *   node scripts/ci/apply-build-number.mjs <ios|android> <buildNumber>
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , platform, rawBuildNumber] = process.argv;

if (!platform || !rawBuildNumber) {
	console.error("usage: apply-build-number.mjs <ios|android> <buildNumber>");
	process.exit(1);
}

const buildNumber = Number(rawBuildNumber);

if (!Number.isInteger(buildNumber) || buildNumber < 1) {
	console.error(`build number must be a positive integer, got "${rawBuildNumber}"`);
	process.exit(1);
}

const { expo } = JSON.parse(readFileSync("app.json", "utf8"));
const version = expo.version;

if (!version) {
	console.error("app.json has no expo.version");
	process.exit(1);
}

function patch(file, replacements) {
	let contents = readFileSync(file, "utf8");

	for (const [pattern, replacement] of replacements) {
		if (!pattern.test(contents)) {
			console.error(`${file} does not match ${pattern}`);
			process.exit(1);
		}
		contents = contents.replace(pattern, replacement);
	}

	writeFileSync(file, contents);
}

if (platform === "android") {
	patch("android/app/build.gradle", [
		[/versionCode \d+/, `versionCode ${buildNumber}`],
		[/versionName "[^"]*"/, `versionName "${version}"`],
	]);
	console.log(`android: versionName ${version}, versionCode ${buildNumber}`);
} else if (platform === "ios") {
	patch("ios/Recapd/Info.plist", [
		[
			/(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]*(<\/string>)/,
			`$1${version}$2`,
		],
		[/(<key>CFBundleVersion<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${buildNumber}$2`],
	]);
	console.log(`ios: CFBundleShortVersionString ${version}, CFBundleVersion ${buildNumber}`);
} else {
	console.error(`unknown platform "${platform}"`);
	process.exit(1);
}
