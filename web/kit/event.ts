import { createClient } from "@supabase/supabase-js";

export type KitData = {
	title: string;
	dateLabel: string;
	code: string;
	joinUrl: string;
	qrSrc: string;
};

export function normalizeCode(raw: string | undefined | null): string | null {
	if (!raw || !/^[A-Za-z0-9\s-]*$/.test(raw)) return null;
	const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
	return code.length === 6 ? code : null;
}

export function resolveTimeZone(raw: string | undefined | null): string {
	if (!raw) return "UTC";
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: raw });
		return raw;
	} catch {
		return "UTC";
	}
}

export function formatDateLabel(startsAt: string, timeZone: string): string {
	const start = new Date(startsAt);
	const date = start.toLocaleDateString("en-US", {
		weekday: "short",
		month: "short",
		day: "numeric",
		timeZone,
	});
	const time = start
		.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone })
		.replace(/ /g, " ");
	return `${date} · ${time}`;
}

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
): Promise<{ title: string; starts_at: string } | null> {
	const supabase = createClient(
		process.env.SUPABASE_URL ?? "",
		process.env.SUPABASE_ANON_KEY ?? ""
	);
	const { data, error } = await supabase.rpc("get_event_preview", { join_code_input: code });
	if (error || !data?.[0]) return null;
	return { title: data[0].title, starts_at: data[0].starts_at };
}
