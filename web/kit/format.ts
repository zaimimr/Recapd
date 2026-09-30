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
