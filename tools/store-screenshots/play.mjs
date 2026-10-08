import { google } from "googleapis";

export const PACKAGE = "com.zaimimran.recapd";
const KEY_FILE =
	process.env.PLAY_KEY_FILE ||
	new URL("../../credentials/android/serviceAccountKey.json", import.meta.url).pathname;

export async function play() {
	const auth = new google.auth.GoogleAuth({
		keyFile: KEY_FILE,
		scopes: ["https://www.googleapis.com/auth/androidpublisher"],
	});
	return google.androidpublisher({ version: "v3", auth: await auth.getClient() });
}

export async function withRetry(fn, tries = 6) {
	for (let i = 1; ; i++) {
		try {
			return await fn();
		} catch (e) {
			const code = e?.code || e?.response?.status;
			const transient =
				!code ||
				code >= 500 ||
				code === 429 ||
				/unavailable|timeout|ECONNRESET/i.test(String(e?.message));
			if (!transient || i >= tries) throw e;
			await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
		}
	}
}
