import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { buildContributeDeepLink, sendExpoPush } from "../_shared/expoPush.ts";

const COOLDOWN_HOURS = 6;
const QUIET_HOURS = 4;

type RequestBody = {
	event_id?: string;
	message?: string;
};

type Event = {
	id: string;
	title: string | null;
	host_id: string;
	ends_at: string | null;
};

type Member = {
	user_id: string;
	role: "host" | "guest";
	push_token: string | null;
	notifications_opt_in: boolean;
	last_uploaded_at: string | null;
	no_photos_to_upload: boolean;
};

Deno.serve(async (req: Request) => {
	if (req.method !== "POST") {
		return new Response("method not allowed", { status: 405 });
	}

	const authHeader = req.headers.get("Authorization") ?? "";
	const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
	const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
	const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

	const userClient = createClient(supabaseUrl, anonKey, {
		global: { headers: { Authorization: authHeader } },
	});
	const admin = createClient(supabaseUrl, serviceKey);

	const { data: userResult } = await userClient.auth.getUser();
	const user = userResult.user;
	if (!user) return json({ error: "unauthorized" }, 401);

	let body: RequestBody;
	try {
		body = (await req.json()) as RequestBody;
	} catch {
		return json({ error: "invalid body" }, 400);
	}
	const eventId = body.event_id;
	if (!eventId) return json({ error: "event_id required" }, 400);

	const { data: event, error: eventError } = await admin
		.from("events")
		.select("id, title, host_id, ends_at")
		.eq("id", eventId)
		.maybeSingle<Event>();
	if (eventError || !event) return json({ error: "event not found" }, 404);
	if (event.host_id !== user.id) return json({ error: "forbidden" }, 403);

	const cooldownSince = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
	const { count: recentCount } = await admin
		.from("nudges")
		.select("id", { count: "exact", head: true })
		.eq("event_id", eventId)
		.gte("sent_at", cooldownSince);
	if ((recentCount ?? 0) > 0) {
		return json({ error: "cooldown" }, 429);
	}

	const inactiveSince = new Date(Date.now() - QUIET_HOURS * 60 * 60 * 1000).toISOString();
	const { data: members } = await admin
		.from("event_members")
		.select(
			"user_id, role, push_token, notifications_opt_in, last_uploaded_at, no_photos_to_upload"
		)
		.eq("event_id", eventId)
		.returns<Member[]>();

	const tokens = (members ?? [])
		.filter((m) => m.role === "guest")
		.filter((m) => m.notifications_opt_in)
		.filter((m) => !m.no_photos_to_upload)
		.filter((m) => !m.last_uploaded_at || m.last_uploaded_at < inactiveSince)
		.map((m) => m.push_token)
		.filter((t): t is string => !!t);

	const uniqueTokens = Array.from(new Set(tokens));
	const missingTokenCount = (members ?? []).filter(
		(m) => m.role === "guest" && m.notifications_opt_in && !m.push_token
	).length;

	const title = event.title ? `Photos from ${event.title}` : "Add your photos";
	const bodyText =
		body.message ?? "Your host is waiting on the rest of your shots. Tap to drop them in.";
	const deepLink = buildContributeDeepLink(eventId);

	let delivered = 0;
	const errors: string[] = [];

	if (uniqueTokens.length > 0) {
		const messages = uniqueTokens.map((token) => ({
			to: token,
			title,
			body: bodyText,
			sound: "default" as const,
			channelId: "default",
			priority: "high" as const,
			data: { deep_link: deepLink, event_id: eventId, kind: "host_nudge" },
		}));
		const tickets = await sendExpoPush(messages);
		delivered = tickets.filter((t) => t.status === "ok").length;
		for (const t of tickets) {
			if (t.status !== "ok" && t.message) errors.push(t.message);
		}
	}

	await admin.from("nudges").insert({
		event_id: eventId,
		sent_by: event.host_id,
		message: body.message ?? null,
		recipient_count: delivered,
	});

	if (uniqueTokens.length > 0) {
		await admin.from("reminders_log").insert({
			event_id: eventId,
			user_id: null,
			kind: "host_nudge",
			channel: "push",
			delivered: delivered > 0,
			error: errors.length > 0 ? errors.slice(0, 3).join("; ") : null,
			payload: {
				attempted: uniqueTokens.length,
				delivered,
				deep_link: deepLink,
				message: body.message ?? null,
			},
		});
	}

	return json({
		ok: true,
		recipient_count: delivered,
		attempted: uniqueTokens.length,
		without_push_token: missingTokenCount,
	});
});

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}
