#!/usr/bin/env node
/**
 * Points the Android release build at the upload keystore.
 *
 * The Expo template signs release builds with the debug key, which Play rejects.
 * This runs after `expo prebuild` and rewrites the generated build.gradle to use
 * a `release` signing config fed by gradle properties, so no secret is ever
 * written into a tracked file.
 *
 *   node scripts/ci/android-release-signing.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const BUILD_GRADLE = "android/app/build.gradle";

const RELEASE_CONFIG = `        release {
            storeFile file(RECAPD_UPLOAD_STORE_FILE)
            storePassword RECAPD_UPLOAD_STORE_PASSWORD
            keyAlias RECAPD_UPLOAD_KEY_ALIAS
            keyPassword RECAPD_UPLOAD_KEY_PASSWORD
        }
`;

let gradle = readFileSync(BUILD_GRADLE, "utf8");

if (gradle.includes("RECAPD_UPLOAD_STORE_FILE")) {
	console.log("release signing config already present");
	process.exit(0);
}

const debugConfigEnd = gradle.match(/signingConfigs \{[\s\S]*?debug \{[\s\S]*?\n {8}\}\n/);

if (!debugConfigEnd) {
	console.error(`could not find the debug signingConfig block in ${BUILD_GRADLE}`);
	process.exit(1);
}

gradle = gradle.replace(debugConfigEnd[0], `${debugConfigEnd[0]}${RELEASE_CONFIG}`);

const releaseBuildType = /(buildTypes \{[\s\S]*?release \{[\s\S]*?signingConfig signingConfigs\.)debug/;

if (!releaseBuildType.test(gradle)) {
	console.error(`could not find the release buildType signingConfig in ${BUILD_GRADLE}`);
	process.exit(1);
}

gradle = gradle.replace(releaseBuildType, "$1release");

writeFileSync(BUILD_GRADLE, gradle);
console.log("release build now signs with the upload keystore");
