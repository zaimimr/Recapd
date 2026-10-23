import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = {
	"Content-Type": "application/json",
};
const CRON_SECRET_HEADER = "x-cron-secret";
const HOUR_MS = 60 * 60 * 1000;
const LEAD_TIME_MS = 24 * HOUR_MS;
const MIN_EVENT_AGE_MS = HOUR_MS;
const GRACE_AFTER_START_MS = 2 * HOUR_MS;

function json(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { headers: jsonHeaders, status });
}

function getServiceSupabase() {
	return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});
}

async function sendExpoPush(message: Record<string, unknown>): Promise<boolean> {
	try {
		const response = await fetch("https://exp.host/--/api/v2/push/send", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify([message]),
		});
		return response.ok;
	} catch (error) {
		console.error("Push notification dispatch failed", error);
		return false;
	}
}

Deno.serve(async (req) => {
	const cronSecret = Deno.env.get("CRON_SECRET");
	if (!cronSecret || req.headers.get(CRON_SECRET_HEADER) !== cronSecret) {
		return json({ success: false, error: "Unauthorized" }, 401);
	}

	try {
		const supabase = getServiceSupabase();
		const now = Date.now();
		const results = { candidates: 0, alone: 0, notificationsSent: 0, errors: [] as string[] };

		const { data: events, error: eventsError } = await supabase
			.from("events")
			.select("id, title, created_by_user_id, starts_at, created_at")
			.is("host_invite_nudge_sent_at", null)
			.neq("status", "expired")
			.lte("starts_at", new Date(now + LEAD_TIME_MS).toISOString())
			.gte("starts_at", new Date(now - GRACE_AFTER_START_MS).toISOString())
			.lte("created_at", new Date(now - MIN_EVENT_AGE_MS).toISOString());

		if (eventsError) {
			throw new Error(`Failed to fetch events: ${eventsError.message}`);
		}

		const candidates = (events ?? []).filter((event) => event.created_by_user_id);
		results.candidates = candidates.length;
		if (candidates.length === 0) {
			return json({ success: true, message: "No events need a nudge", results });
		}

		const { data: participants, error: participantsError } = await supabase
			.from("event_participants")
			.select("event_id, user_id")
			.in(
				"event_id",
				candidates.map((event) => event.id)
			);

		if (participantsError) {
			throw new Error(`Failed to fetch participants: ${participantsError.message}`);
		}

		const guestEventIds = new Set(
			(participants ?? [])
				.filter((participant) => {
					const event = candidates.find((candidate) => candidate.id === participant.event_id);
					return participant.user_id !== event?.created_by_user_id;
				})
				.map((participant) => participant.event_id)
		);

		const aloneEvents = candidates.filter((event) => !guestEventIds.has(event.id));
		results.alone = aloneEvents.length;
		if (aloneEvents.length === 0) {
			return json({ success: true, message: "Every event has guests", results });
		}

		const { data: privateUsers, error: privateUsersError } = await supabase
			.from("user_private_data")
			.select("user_id, push_token")
			.in(
				"user_id",
				aloneEvents.map((event) => event.created_by_user_id)
			);

		if (privateUsersError) {
			throw new Error(`Failed to fetch push tokens: ${privateUsersError.message}`);
		}

		const tokenMap = new Map(
			(privateUsers ?? [])
				.filter((row) => row.push_token)
				.map((row) => [row.user_id, row.push_token as string])
		);

		const nudgedEventIds: string[] = [];

		for (const event of aloneEvents) {
			const token = tokenMap.get(event.created_by_user_id);
			if (!token) {
				nudgedEventIds.push(event.id);
				continue;
			}

			const startsSoon = new Date(event.starts_at).getTime() > now;
			const sent = await sendExpoPush({
				to: token,
				title: event.title,
				body: startsSoon
					? "Nobody has joined yet. Send the link so everyone's photos end up in one album."
					: "Your event has started and nobody has joined yet. Share the link or show the QR code.",
				data: { type: "host_invite_nudge", eventId: event.id },
			});

			if (sent) {
				results.notificationsSent++;
				nudgedEventIds.push(event.id);
			} else {
				results.errors.push(`Failed to send nudge for event ${event.id}`);
			}
		}

		if (nudgedEventIds.length > 0) {
			const { error: updateError } = await supabase
				.from("events")
				.update({ host_invite_nudge_sent_at: new Date().toISOString() })
				.in("id", nudgedEventIds);

			if (updateError) {
				results.errors.push(`Failed to mark nudges: ${updateError.message}`);
			}
		}

		return json({ success: true, message: `Sent ${results.notificationsSent} nudge(s)`, results });
	} catch (error) {
		console.error("Host invite nudge error", error);
		return json({ success: false, error: "Internal server error" }, 500);
	}
});
