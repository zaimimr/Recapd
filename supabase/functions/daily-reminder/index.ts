import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { buildContributeDeepLink, sendExpoPush } from "../_shared/expoPush.ts";

const WINDOW_START_HOURS = 18;
const WINDOW_END_HOURS = 24;

type Event = {
	id: string;
	title: string | null;
	host_id: string;
	ends_at: string;
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
		.select("id, title, host_id, ends_at")
		.gte("ends_at", windowStart)
		.lte("ends_at", windowEnd)
		.is("archived_at", null)
		.returns<Event[]>();

	let totalSent = 0;
	let processedEvents = 0;
	const skipped: string[] = [];

	for (const event of events ?? []) {
		const result = await deliverEventReminders(admin, event);
		if (result.skipped) {
			skipped.push(event.id);
			continue;
		}
		totalSent += result.sent;
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

async function deliverEventReminders(
	admin: ReturnType<typeof createClient>,
	event: Event
): Promise<{ sent: number; skipped: boolean }> {
	const { data: members } = await admin
		.from("event_members")
		.select(
			"user_id, role, push_token, notifications_opt_in, last_uploaded_at, no_photos_to_upload"
		)
		.eq("event_id", event.id)
		.returns<Member[]>();

	const eligible = (members ?? []).filter(
		(m) =>
			m.role === "guest" &&
			m.notifications_opt_in &&
			!m.no_photos_to_upload &&
			!m.last_uploaded_at &&
			!!m.push_token
	);
	if (eligible.length === 0) return { sent: 0, skipped: false };

	const userIds = eligible.map((m) => m.user_id);
	const { data: alreadySent } = await admin
		.from("reminders_log")
		.select("user_id")
		.eq("event_id", event.id)
		.eq("kind", "day_after_auto")
		.in("user_id", userIds);

	const sentSet = new Set(
		(alreadySent ?? [])
			.map((r: { user_id: string | null }) => r.user_id)
			.filter((id): id is string => !!id)
	);
	const targets = eligible.filter((m) => !sentSet.has(m.user_id));
	if (targets.length === 0) return { sent: 0, skipped: true };

	const deepLink = buildContributeDeepLink(event.id);
	const title = event.title ? `Recap from ${event.title}` : "Add your photos";
	const bodyText = "Pick the keepers from yesterday. We'll group them with the rest.";

	const messages = targets.map((m) => ({
		to: m.push_token as string,
		title,
		body: bodyText,
		sound: "default" as const,
		channelId: "default",
		priority: "high" as const,
		data: { deep_link: deepLink, event_id: event.id, kind: "day_after_auto" },
	}));

	const tickets = await sendExpoPush(messages);

	const logRows = targets.map((m, idx) => {
		const ticket = tickets[idx];
		const delivered = ticket?.status === "ok";
		return {
			event_id: event.id,
			user_id: m.user_id,
			kind: "day_after_auto" as const,
			channel: "push" as const,
			delivered,
			error: delivered ? null : (ticket?.message ?? "unknown"),
			payload: { deep_link: deepLink },
		};
	});
	if (logRows.length > 0) await admin.from("reminders_log").insert(logRows);

	const sent = tickets.filter((t) => t.status === "ok").length;
	return { sent, skipped: false };
}
