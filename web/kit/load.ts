import {
	buildJoinUrl,
	fetchKitEvent,
	formatDateLabel,
	type KitData,
	normalizeCode,
	resolveTimeZone,
} from "./event.js";
import { qrDataUri } from "./qr.js";

function single(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

export async function loadKitData(query: {
	code?: unknown;
	tz?: unknown;
}): Promise<KitData | null> {
	const code = normalizeCode(single(query.code));
	if (!code) return null;
	const event = await fetchKitEvent(code);
	if (!event) return null;
	const joinUrl = buildJoinUrl(code);
	return {
		title: event.title,
		dateLabel: formatDateLabel(event.starts_at, resolveTimeZone(single(query.tz))),
		code,
		joinUrl,
		qrSrc: await qrDataUri(joinUrl),
	};
}
