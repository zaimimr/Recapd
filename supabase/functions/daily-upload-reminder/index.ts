import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = {
	"Content-Type": "application/json",
};
const CRON_SECRET_HEADER = "x-cron-secret";

interface ParticipantToRemind {
	participant_id: string;
	user_id: string;
	event_id: string;
	event_title: string;
	push_token: string;
}

function isNineAM(timezone: string): boolean {
	try {
		const now = new Date();
		const formatter = new Intl.DateTimeFormat("en-US", {
			timeZone: timezone,
			hour: "numeric",
			hour12: false,
		});
		const hour = parseInt(formatter.format(now), 10);
		return hour === 9;
	} catch {
		return false;
	}
}

function getServiceSupabase() {
	const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
	const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

	return createClient(supabaseUrl, supabaseServiceKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});
}

async function sendExpoPushNotifications(
	tokens: string[],
	title: string,
	body: string,
	data?: Record<string, unknown>
): Promise<boolean> {
	if (tokens.length === 0) return true;

	const messages = tokens.map((token) => ({
		to: token,
		title,
		body,
		data,
	}));

	try {
		const response = await fetch("https://exp.host/--/api/v2/push/send", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(messages),
		});

		if (!response.ok) {
			console.error("Push notification provider returned a non-200 response");
			return false;
		}

		return true;
	} catch (error) {
		console.error("Push notification dispatch failed", error);
		return false;
	}
}

Deno.serve(async (req) => {
	const cronSecret = Deno.env.get("CRON_SECRET");
	if (!cronSecret || req.headers.get(CRON_SECRET_HEADER) !== cronSecret) {
		return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
			headers: jsonHeaders,
			status: 401,
		});
	}

	try {
		const supabase = getServiceSupabase();
		const results = {
			eventsChecked: 0,
			eventsAtNineAM: 0,
			participantsFound: 0,
			notificationsSent: 0,
			errors: [] as string[],
		};

		const { data: activeEvents, error: eventsError } = await supabase
			.from("events")
			.select("id, title, timezone")
			.in("status", ["live", "ended"])
			.gt("expires_at", new Date().toISOString());

		if (eventsError) {
			throw new Error(`Failed to fetch events: ${eventsError.message}`);
		}

		if (!activeEvents || activeEvents.length === 0) {
			return new Response(
				JSON.stringify({
					success: true,
					message: "No active events found",
					results,
				}),
				{
					headers: jsonHeaders,
					status: 200,
				}
			);
		}

		results.eventsChecked = activeEvents.length;

		const eventsAtNineAM = activeEvents.filter((event) => isNineAM(event.timezone));
		results.eventsAtNineAM = eventsAtNineAM.length;

		if (eventsAtNineAM.length === 0) {
			return new Response(
				JSON.stringify({
					success: true,
					message: "No events at 09:00 local time",
					results,
				}),
				{
					headers: jsonHeaders,
					status: 200,
				}
			);
		}

		const eventIds = eventsAtNineAM.map((event) => event.id);
		const eventTitleMap = new Map(eventsAtNineAM.map((event) => [event.id, event.title]));
		const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();

		const { data: participantsToRemind, error: participantsError } = await supabase
			.from("event_participants")
			.select("id, user_id, event_id, last_reminder_sent_at")
			.in("event_id", eventIds)
			.eq("no_photos_to_upload", false)
			.or(`last_reminder_sent_at.is.null,last_reminder_sent_at.lt.${twentyHoursAgo}`);

		if (participantsError) {
			throw new Error(`Failed to fetch participants: ${participantsError.message}`);
		}

		if (!participantsToRemind || participantsToRemind.length === 0) {
			return new Response(
				JSON.stringify({
					success: true,
					message: "No participants need reminders",
					results,
				}),
				{
					headers: jsonHeaders,
					status: 200,
				}
			);
		}

		const userIds = [...new Set(participantsToRemind.map((participant) => participant.user_id))];

		const { data: mediaItems, error: mediaError } = await supabase
			.from("media_items")
			.select("uploaded_by_user_id, event_id")
			.in("event_id", eventIds)
			.in("uploaded_by_user_id", userIds);

		if (mediaError) {
			results.errors.push(`Failed to fetch media items: ${mediaError.message}`);
		}

		const { data: privateUsers, error: privateUsersError } = await supabase
			.from("user_private_data")
			.select("user_id, push_token")
			.in("user_id", userIds);

		if (privateUsersError) {
			throw new Error(`Failed to fetch push tokens: ${privateUsersError.message}`);
		}

		const uploadedSet = new Set(
			(mediaItems || []).map((item) => `${item.event_id}:${item.uploaded_by_user_id}`)
		);
		const tokenMap = new Map(
			(privateUsers || [])
				.filter((row) => row.push_token)
				.map((row) => [row.user_id, row.push_token as string])
		);

		const participantsWithNoUploads: ParticipantToRemind[] = participantsToRemind
			.filter((participant) => {
				const key = `${participant.event_id}:${participant.user_id}`;
				return !uploadedSet.has(key) && tokenMap.has(participant.user_id);
			})
			.map((participant) => ({
				participant_id: participant.id,
				user_id: participant.user_id,
				event_id: participant.event_id,
				event_title: eventTitleMap.get(participant.event_id) || "Event",
				push_token: tokenMap.get(participant.user_id) as string,
			}));

		results.participantsFound = participantsWithNoUploads.length;

		if (participantsWithNoUploads.length === 0) {
			return new Response(
				JSON.stringify({
					success: true,
					message: "No reminders needed",
					results,
				}),
				{
					headers: jsonHeaders,
					status: 200,
				}
			);
		}

		const participantsByUser = new Map<
			string,
			{ token: string; events: { id: string; title: string; participantId: string }[] }
		>();

		for (const participant of participantsWithNoUploads) {
			const existing = participantsByUser.get(participant.user_id);
			if (existing) {
				existing.events.push({
					id: participant.event_id,
					title: participant.event_title,
					participantId: participant.participant_id,
				});
			} else {
				participantsByUser.set(participant.user_id, {
					token: participant.push_token,
					events: [
						{
							id: participant.event_id,
							title: participant.event_title,
							participantId: participant.participant_id,
						},
					],
				});
			}
		}

		const participantIdsToUpdate: string[] = [];

		for (const [userId, userData] of participantsByUser) {
			const eventTitles = userData.events.map((event) => event.title);
			const title = eventTitles.length === 1 ? eventTitles[0] : `${eventTitles.length} Events`;
			const body =
				eventTitles.length === 1
					? "Your friends are waiting! Upload your photos from the event."
					: `Your friends are waiting! Upload your photos from ${eventTitles.join(", ")}.`;

			const success = await sendExpoPushNotifications([userData.token], title, body, {
				type: "upload_reminder",
				eventIds: userData.events.map((event) => event.id),
			});

			if (success) {
				results.notificationsSent++;
				participantIdsToUpdate.push(...userData.events.map((event) => event.participantId));
			} else {
				results.errors.push(`Failed to send notification to user ${userId}`);
			}
		}

		if (participantIdsToUpdate.length > 0) {
			const { error: updateError } = await supabase
				.from("event_participants")
				.update({ last_reminder_sent_at: new Date().toISOString() })
				.in("id", participantIdsToUpdate);

			if (updateError) {
				results.errors.push(`Failed to update last_reminder_sent_at: ${updateError.message}`);
			}
		}

		return new Response(
			JSON.stringify({
				success: true,
				message: `Sent ${results.notificationsSent} reminder(s)`,
				results,
			}),
			{
				headers: jsonHeaders,
				status: 200,
			}
		);
	} catch (error) {
		console.error("Daily reminder error", error);

		return new Response(
			JSON.stringify({
				success: false,
				error: "Internal server error",
			}),
			{
				headers: jsonHeaders,
				status: 500,
			}
		);
	}
});
