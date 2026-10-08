import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";

export const APP_ID = "6758083751";
const KEY_ID = process.env.ASC_KEY_ID || "734B75F2PY";
const ISSUER = process.env.ASC_ISSUER_ID || "a2d1bd8d-dc23-4161-904a-9f088eef8144";
const KEY_PATH =
	process.env.ASC_KEY_PATH || `${os.homedir()}/.appstoreconnect/private_keys/AuthKey_${KEY_ID}.p8`;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

function token() {
	const key = crypto.createPrivateKey(fs.readFileSync(KEY_PATH));
	const now = Math.floor(Date.now() / 1000);
	const head = b64({ alg: "ES256", kid: KEY_ID, typ: "JWT" });
	const body = b64({ iss: ISSUER, iat: now, exp: now + 1100, aud: "appstoreconnect-v1" });
	const sig = crypto
		.sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" })
		.toString("base64url");
	return `${head}.${body}.${sig}`;
}

export async function api(path, { method = "GET", body } = {}) {
	const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
		method,
		headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await res.text();
	const json = text ? JSON.parse(text) : null;
	if (!res.ok)
		throw new Error(`${method} ${path} ${res.status} ${JSON.stringify(json).slice(0, 1500)}`);
	return json;
}
