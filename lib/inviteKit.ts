import { cacheDirectory, deleteAsync, downloadAsync } from "expo-file-system/legacy";
import { shareAsync } from "expo-sharing";
import { openBrowserAsync } from "expo-web-browser";

export type KitFormat = "social" | "story" | "table" | "poster";
export type KitImageFormat = "social" | "story";
export type KitPrintFormat = "table" | "poster";

export const KIT_ERROR_MESSAGE = "Couldn't load the invite card. Check your connection.";

const BASE_URL = "https://recapd.app";

function deviceTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function buildJoinUrl(code: string): string {
	return `${BASE_URL}/join/${code}`;
}

export function buildKitImageUrl(code: string, format: KitFormat, timeZone = deviceTimeZone()) {
	const params = new URLSearchParams({ code, format, tz: timeZone });
	return `${BASE_URL}/api/kit/image?${params.toString()}`;
}

export function buildKitPrintUrl(
	code: string,
	format: KitPrintFormat,
	timeZone = deviceTimeZone()
) {
	const params = new URLSearchParams({ format, tz: timeZone });
	return `${BASE_URL}/kit/${code}/print?${params.toString()}`;
}

export async function shareKitImage(code: string, format: KitImageFormat): Promise<void> {
	const localUri = `${cacheDirectory}recapd-${code}-${format}.png`;
	const result = await downloadAsync(buildKitImageUrl(code, format), localUri);
	if (result.status !== 200) {
		await deleteAsync(localUri, { idempotent: true });
		throw new Error(`Invite kit download failed with status ${result.status}`);
	}
	await shareAsync(result.uri, { mimeType: "image/png", UTI: "public.png" });
}

export async function openKitPrint(code: string, format: KitPrintFormat): Promise<void> {
	await openBrowserAsync(buildKitPrintUrl(code, format));
}
