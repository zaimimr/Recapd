import { createClient } from "@supabase/supabase-js";

export { formatDateLabel, normalizeCode, resolveTimeZone } from "./format.js";

export type KitData = {
	title: string;
	dateLabel: string;
	code: string;
	joinUrl: string;
	qrSrc: string;
};

export function fitTitle(title: string, max = 60): string {
	const characters = Array.from(title.trim());
	return characters.length <= max
		? characters.join("")
		: `${characters.slice(0, max - 1).join("")}…`;
}

export function titleFontSize(title: string, base: number): number {
	const length = Array.from(title).length;
	if (length <= 20) return base;
	if (length <= 40) return Math.round(base * 0.75);
	return Math.round(base * 0.6);
}

export function buildJoinUrl(code: string): string {
	return `https://recapd.app/join/${code}`;
}

export async function fetchKitEvent(
	code: string
): Promise<{ title: string; starts_at: string; timezone: string | null } | null> {
	const supabase = createClient(
		process.env.SUPABASE_URL ?? "",
		process.env.SUPABASE_ANON_KEY ?? ""
	);
	const { data, error } = await supabase.rpc("get_event_preview", { join_code_input: code });
	if (error || !data?.[0]) return null;
	return {
		title: data[0].title,
		starts_at: data[0].starts_at,
		timezone: data[0].timezone ?? null,
	};
}
