#!/usr/bin/env node
/**
 * Stages an App Store review submission and stops one step short of sending it.
 *
 *   node scripts/ci/asc-prepare-submission.mjs <buildNumber>
 *
 * Waits for Apple to finish processing the build, attaches it to the version in
 * app.json, writes the release notes, and creates the review submission without
 * marking it submitted. App Store Connect then shows a submission ready to go,
 * and a human presses the button.
 *
 * Needs ASC_KEY_PATH, ASC_KEY_ID and ASC_ISSUER_ID.
 */
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { appVersion, releaseNotes } from "./release-notes.mjs";

const APP_ID = "6758083751";
const API = "https://api.appstoreconnect.apple.com";
const EDITABLE = new Set([
	"PREPARE_FOR_SUBMISSION",
	"DEVELOPER_REJECTED",
	"REJECTED",
	"METADATA_REJECTED",
	"INVALID_BINARY",
]);
const OPEN_SUBMISSION_STATES = "READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES";
const PROCESSING_TIMEOUT_MS = 40 * 60 * 1000;
const POLL_INTERVAL_MS = 30 * 1000;

const buildNumber = process.argv[2];
const keyPath = process.env.ASC_KEY_PATH;
const keyId = process.env.ASC_KEY_ID;
const issuerId = process.env.ASC_ISSUER_ID;

if (!buildNumber) {
	console.error("usage: asc-prepare-submission.mjs <buildNumber>");
	process.exit(1);
}

for (const [name, value] of Object.entries({
	ASC_KEY_PATH: keyPath,
	ASC_KEY_ID: keyId,
	ASC_ISSUER_ID: issuerId,
})) {
	if (!value) {
		console.error(`${name} is not set`);
		process.exit(1);
	}
}

// GOTCHA: node's default DER signature is rejected by Apple. ieee-p1363 is what
// ES256 means here, and jsonwebtoken is not a dependency of this repo.
function token() {
	const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
	const header = encode({ alg: "ES256", kid: keyId, typ: "JWT" });
	const payload = encode({
		iss: issuerId,
		aud: "appstoreconnect-v1",
		exp: Math.floor(Date.now() / 1000) + 900,
	});
	const signature = crypto
		.sign("sha256", Buffer.from(`${header}.${payload}`), {
			key: crypto.createPrivateKey(readFileSync(keyPath)),
			dsaEncoding: "ieee-p1363",
		})
		.toString("base64url");

	return `${header}.${payload}.${signature}`;
}

async function asc(method, path, body) {
	const response = await fetch(`${API}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${token()}`,
			...(body ? { "Content-Type": "application/json" } : {}),
		},
		...(body ? { body: JSON.stringify(body) } : {}),
	});

	const text = await response.text();
	const payload = text ? JSON.parse(text) : {};

	if (!response.ok) {
		const detail =
			payload.errors?.map((error) => `${error.code}: ${error.detail}`).join("; ") || text;
		const failure = new Error(`${method} ${path} -> ${response.status} ${detail}`);
		failure.status = response.status;
		failure.errors = payload.errors ?? [];
		throw failure;
	}

	return payload;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForBuild() {
	const deadline = Date.now() + PROCESSING_TIMEOUT_MS;

	while (Date.now() < deadline) {
		const { data } = await asc(
			"GET",
			`/v1/builds?filter[app]=${APP_ID}&filter[version]=${buildNumber}&limit=1`
		);
		const build = data[0];

		if (build?.attributes.processingState === "VALID") {
			console.log(`build ${buildNumber} finished processing`);
			return build.id;
		}

		console.log(
			`build ${buildNumber} is ${build?.attributes.processingState ?? "not visible yet"}, waiting`
		);
		await sleep(POLL_INTERVAL_MS);
	}

	throw new Error(`build ${buildNumber} never finished processing`);
}

async function versionRecord(version) {
	const { data } = await asc(
		"GET",
		`/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=20`
	);

	const named = data.find((entry) => entry.attributes.versionString === version);

	if (named) {
		if (!EDITABLE.has(named.attributes.appStoreState)) {
			throw new Error(
				`version ${version} is ${named.attributes.appStoreState}, which cannot be edited`
			);
		}

		console.log(`reusing version ${version} (${named.attributes.appStoreState})`);
		return named.id;
	}

	const editable = data.find((entry) => EDITABLE.has(entry.attributes.appStoreState));

	if (editable) {
		console.log(`renaming ${editable.attributes.versionString} to ${version}`);
		await asc("PATCH", `/v1/appStoreVersions/${editable.id}`, {
			data: { type: "appStoreVersions", id: editable.id, attributes: { versionString: version } },
		});
		return editable.id;
	}

	console.log(`creating version ${version}`);
	const created = await asc("POST", "/v1/appStoreVersions", {
		data: {
			type: "appStoreVersions",
			attributes: { platform: "IOS", versionString: version },
			relationships: { app: { data: { type: "apps", id: APP_ID } } },
		},
	});

	return created.data.id;
}

async function writeReleaseNotes(versionId, notes) {
	const { data } = await asc(
		"GET",
		`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`
	);

	for (const localization of data) {
		await asc("PATCH", `/v1/appStoreVersionLocalizations/${localization.id}`, {
			data: {
				type: "appStoreVersionLocalizations",
				id: localization.id,
				attributes: { whatsNew: notes },
			},
		});
		console.log(`release notes written for ${localization.attributes.locale}`);
	}
}

async function stageSubmission(versionId) {
	const open = await asc(
		"GET",
		`/v1/reviewSubmissions?filter[app]=${APP_ID}&filter[state]=${OPEN_SUBMISSION_STATES}&limit=10`
	);

	const existing = open.data[0];

	if (existing) {
		console.log(`a submission is already open (${existing.attributes.state}), leaving it alone`);
		return existing;
	}

	const submission = await asc("POST", "/v1/reviewSubmissions", {
		data: {
			type: "reviewSubmissions",
			attributes: { platform: "IOS" },
			relationships: { app: { data: { type: "apps", id: APP_ID } } },
		},
	});

	try {
		await asc("POST", "/v1/reviewSubmissionItems", {
			data: {
				type: "reviewSubmissionItems",
				relationships: {
					reviewSubmission: { data: { type: "reviewSubmissions", id: submission.data.id } },
					appStoreVersion: { data: { type: "appStoreVersions", id: versionId } },
				},
			},
		});
	} catch (failure) {
		if (
			failure.errors.some((error) => error.code === "STATE_ERROR.ITEM_PART_OF_ANOTHER_SUBMISSION")
		) {
			console.log("the version already belongs to another submission");
			return submission.data;
		}

		throw failure;
	}

	return submission.data;
}

const version = appVersion();
const notes = releaseNotes(version);
const buildId = await waitForBuild();
const versionId = await versionRecord(version);

await asc("PATCH", `/v1/appStoreVersions/${versionId}/relationships/build`, {
	data: { type: "builds", id: buildId },
});
console.log(`build ${buildNumber} attached to ${version}`);

await writeReleaseNotes(versionId, notes);

const submission = await stageSubmission(versionId);

console.log("");
console.log(
	`${version} (${buildNumber}) is staged and NOT submitted. State: ${submission.attributes.state}`
);
console.log("Approve it in App Store Connect > Review Submissions when you are ready.");
