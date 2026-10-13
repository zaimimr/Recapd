import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { formatDateLabel, normalizeCode, resolveTimeZone } from "../kit/event.js";
import { injectJoinMeta } from "../kit/joinShell.js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

function headerValue(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

async function fetchShell(req: VercelRequest): Promise<string | null> {
	const host = req.headers.host;
	if (!host) return null;
	const proto = headerValue(req.headers["x-forwarded-proto"]) ?? "https";
	const headers: Record<string, string> = {};
	const cookie = headerValue(req.headers.cookie);
	const bypass = headerValue(req.headers["x-vercel-protection-bypass"]);
	if (cookie) headers.cookie = cookie;
	if (bypass) headers["x-vercel-protection-bypass"] = bypass;
	try {
		const response = await fetch(`${proto}://${host}/`, {
			headers,
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) return null;
		const html = await response.text();
		return html.includes('<div id="root">') ? html : null;
	} catch {
		return null;
	}
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
	const code = normalizeCode(req.url?.split("/join/")[1]?.split("?")[0]);

	if (!code) {
		return res.redirect(302, "/");
	}

	const [preview, shell] = await Promise.all([
		supabase.rpc("get_event_preview", { join_code_input: code }),
		fetchShell(req),
	]);

	if (!shell) {
		res.setHeader("Cache-Control", "no-store");
		return res.status(502).send("Recapd is temporarily unavailable. Please try again.");
	}

	const event = preview.error ? null : preview.data?.[0];
	const html = injectJoinMeta(shell, {
		code,
		title: event?.title || "Join Event on Recapd",
		description: event
			? formatDateLabel(event.starts_at, resolveTimeZone(event.timezone))
			: "Share photos together, privately.",
	});

	res.setHeader("Content-Type", "text/html; charset=utf-8");
	res.setHeader("Cache-Control", "public, max-age=60");
	res.status(200).send(html);
}
