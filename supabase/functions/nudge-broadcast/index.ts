import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { buildContributeDeepLink, sendExpoPush } from "../_shared/expoPush.ts";

const COOLDOWN_HOURS = 6;
const QUIET_HOURS = 4;

type RequestBody = {
	event_id?: string;
};

type Event = {
	id: string;
	title?: string | null;
	host_id: string;
	end_time?: string | null;
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
		.select("id, title, host_id, end_time")
		.eq("id", eventId)
		.maybeSingle<Event>();
	if (eventError || !event) return json({ error: "event not found" }, 404);
	if (event.host_id !== user.id) return json({ error: "forbidden" }, 403);

	const cooldownSince = new Date(Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
	const { count: recentCount } = await admin
		.from("nudge_log")
		.select("id", { count: "exact", head: true })
		.eq("event_id", eventId)
		.eq("kind", "host_broadcast")
		.gte("sent_at", cooldownSince);
	if ((recentCount ?? 0) > 0) {
		return json({ error: "cooldown" }, 429);
	}

	const recipients = await collectInactiveGuests(admin, eventId, event.host_id);
	if (recipients.length === 0) {
		await admin.from("nudge_log").insert({
			event_id: eventId,
			host_id: event.host_id,
			kind: "host_broadcast",
			recipient_count: 0,
		});
		return json({ ok: true, recipient_count: 0 });
	}

	const title = event.title ? `Photos from ${event.title}` : "Add your photos";
	const body_text = "Your host is waiting on the rest of your shots. Tap to drop them in.";
	const deepLink = buildContributeDeepLink(eventId);

	const messages = recipients.map((token) => ({
		to: token,
		title,
		body: body_text,
		sound: "default" as const,
		channelId: "default",
		priority: "high" as const,
		data: { deep_link: deepLink, event_id: eventId, kind: "host_broadcast" },
	}));

	const tickets = await sendExpoPush(messages);
	const delivered = tickets.filter((t) => t.status === "ok").length;

	await admin.from("nudge_log").insert({
		event_id: eventId,
		host_id: event.host_id,
		kind: "host_broadcast",
		recipient_count: delivered,
	});

	return json({ ok: true, recipient_count: delivered, attempted: recipients.length });
});

async function collectInactiveGuests(
	admin: ReturnType<typeof createClient>,
	eventId: string,
	hostId: string
): Promise<string[]> {
	const inactiveSince = new Date(Date.now() - QUIET_HOURS * 60 * 60 * 1000).toISOString();

	const { data: participants } = await admin
		.from("event_participants")
		.select("user_id")
		.eq("event_id", eventId);
	const participantIds = (participants ?? [])
		.map((p: { user_id: string | null }) => p.user_id)
		.filter((id): id is string => !!id && id !== hostId);
	if (participantIds.length === 0) return [];

	const { data: recentUploads } = await admin
		.from("media_items")
		.select("uploader_id")
		.eq("event_id", eventId)
		.gte("created_at", inactiveSince);
	const activeIds = new Set(
		(recentUploads ?? [])
			.map((m: { uploader_id: string | null }) => m.uploader_id)
			.filter((id): id is string => !!id)
	);

	const inactive = participantIds.filter((id) => !activeIds.has(id));
	if (inactive.length === 0) return [];

	const { data: tokens } = await admin
		.from("push_tokens")
		.select("expo_token")
		.in("user_id", inactive);
	const unique = new Set(
		(tokens ?? [])
			.map((t: { expo_token: string | null }) => t.expo_token)
			.filter((t): t is string => !!t)
	);
	return Array.from(unique);
}

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}
