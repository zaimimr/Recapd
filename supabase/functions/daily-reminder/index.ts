import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { buildContributeDeepLink, sendExpoPush } from "../_shared/expoPush.ts";

const WINDOW_START_HOURS = 18;
const WINDOW_END_HOURS = 24;

type Event = {
	id: string;
	title: string | null;
	host_id: string;
	end_time: string;
};

Deno.serve(async (req: Request) => {
	const cronSecret = Deno.env.get("CRON_SECRET");
	if (cronSecret) {
		const provided = req.headers.get("x-cron-secret") ?? "";
		if (provided !== cronSecret) return new Response("unauthorized", { status: 401 });
	}

	const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
	const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
	const admin = createClient(supabaseUrl, serviceKey);

	const now = Date.now();
	const windowEnd = new Date(now - WINDOW_START_HOURS * 60 * 60 * 1000).toISOString();
	const windowStart = new Date(now - WINDOW_END_HOURS * 60 * 60 * 1000).toISOString();

	const { data: events } = await admin
		.from("events")
		.select("id, title, host_id, end_time")
		.gte("end_time", windowStart)
		.lte("end_time", windowEnd)
		.returns<Event[]>();

	let totalSent = 0;
	let processedEvents = 0;
	const skipped: string[] = [];

	for (const event of events ?? []) {
		const { count: existing } = await admin
			.from("nudge_log")
			.select("id", { count: "exact", head: true })
			.eq("event_id", event.id)
			.eq("kind", "day_after_auto");
		if ((existing ?? 0) > 0) {
			skipped.push(event.id);
			continue;
		}

		const sent = await deliverReminder(admin, event);
		await admin.from("nudge_log").insert({
			event_id: event.id,
			host_id: event.host_id,
			kind: "day_after_auto",
			recipient_count: sent,
		});
		totalSent += sent;
		processedEvents += 1;
	}

	return new Response(
		JSON.stringify({
			ok: true,
			processed_events: processedEvents,
			total_sent: totalSent,
			skipped,
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } }
	);
});

async function deliverReminder(
	admin: ReturnType<typeof createClient>,
	event: Event
): Promise<number> {
	const { data: participants } = await admin
		.from("event_participants")
		.select("user_id")
		.eq("event_id", event.id);
	const userIds = (participants ?? [])
		.map((p: { user_id: string | null }) => p.user_id)
		.filter((id): id is string => !!id);
	if (userIds.length === 0) return 0;

	const { data: tokens } = await admin
		.from("push_tokens")
		.select("expo_token")
		.in("user_id", userIds);
	const unique = Array.from(
		new Set(
			(tokens ?? [])
				.map((t: { expo_token: string | null }) => t.expo_token)
				.filter((t): t is string => !!t)
		)
	);
	if (unique.length === 0) return 0;

	const deepLink = buildContributeDeepLink(event.id);
	const title = event.title ? `Recap from ${event.title}` : "Add your photos";
	const body = "Pick the keepers from yesterday. We'll group them with the rest.";

	const messages = unique.map((token) => ({
		to: token,
		title,
		body,
		sound: "default" as const,
		channelId: "default",
		priority: "high" as const,
		data: { deep_link: deepLink, event_id: event.id, kind: "day_after_auto" },
	}));

	const tickets = await sendExpoPush(messages);
	return tickets.filter((t) => t.status === "ok").length;
}
