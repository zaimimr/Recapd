import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = {
	"Content-Type": "application/json",
};

const COOLDOWN_MS = 15 * 60 * 1000;

type ReminderType = "upload" | "take_photos";

interface RequestBody {
	event_id?: string;
	reminder_type?: ReminderType;
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

function getCallerSupabase(authHeader: string) {
	const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
	const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

	return createClient(supabaseUrl, supabaseAnonKey, {
		global: { headers: { Authorization: authHeader } },
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});
}

function buildMessage(type: ReminderType, eventTitle: string): { title: string; body: string } {
	if (type === "take_photos") {
		return {
			title: eventTitle,
			body: "The host wants more photos! Snap a few and share them.",
		};
	}
	return {
		title: eventTitle,
		body: "The host is waiting on your photos. Upload what you've got!",
	};
}

async function sendExpoPushNotifications(
	tokens: string[],
	title: string,
	body: string,
	data?: Record<string, unknown>
): Promise<{ sent: number; failed: number }> {
	if (tokens.length === 0) return { sent: 0, failed: 0 };

	const messages = tokens.map((token) => ({
		to: token,
		title,
		body,
		data,
	}));

	try {
		const response = await fetch("https://exp.host/--/api/v2/push/send", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(messages),
		});

		if (!response.ok) {
			console.error("Push notification provider returned a non-200 response");
			return { sent: 0, failed: tokens.length };
		}

		return { sent: tokens.length, failed: 0 };
	} catch (error) {
		console.error("Push notification dispatch failed", error);
		return { sent: 0, failed: tokens.length };
	}
}

function jsonResponse(status: number, body: Record<string, unknown>) {
	return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

Deno.serve(async (req) => {
	if (req.method !== "POST") {
		return jsonResponse(405, { success: false, error: "Method not allowed" });
	}

	const authHeader = req.headers.get("Authorization");
	if (!authHeader) {
		return jsonResponse(401, { success: false, error: "Missing Authorization header" });
	}

	let body: RequestBody;
	try {
		body = await req.json();
	} catch {
		return jsonResponse(400, { success: false, error: "Invalid JSON body" });
	}

	const eventId = body.event_id;
	const reminderType: ReminderType = body.reminder_type === "take_photos" ? "take_photos" : "upload";

	if (!eventId || typeof eventId !== "string") {
		return jsonResponse(400, { success: false, error: "event_id is required" });
	}

	try {
		const callerClient = getCallerSupabase(authHeader);
		const {
			data: { user },
			error: userError,
		} = await callerClient.auth.getUser();

		if (userError || !user) {
			return jsonResponse(401, { success: false, error: "Invalid token" });
		}

		const service = getServiceSupabase();

		const { data: callerProfile, error: profileError } = await service
			.from("users")
			.select("id")
			.eq("auth_user_id", user.id)
			.maybeSingle();

		if (profileError || !callerProfile) {
			return jsonResponse(403, { success: false, error: "Profile not found" });
		}

		const { data: event, error: eventError } = await service
			.from("events")
			.select("id, title, last_host_reminder_at, status, expires_at")
			.eq("id", eventId)
			.maybeSingle();

		if (eventError || !event) {
			return jsonResponse(404, { success: false, error: "Event not found" });
		}

		if (event.status === "expired" || new Date(event.expires_at).getTime() < Date.now()) {
			return jsonResponse(409, { success: false, error: "Event is no longer active" });
		}

		const { data: hostParticipant, error: hostError } = await service
			.from("event_participants")
			.select("id")
			.eq("event_id", eventId)
			.eq("user_id", callerProfile.id)
			.eq("role", "host")
			.maybeSingle();

		if (hostError || !hostParticipant) {
			return jsonResponse(403, { success: false, error: "Only the event host can send reminders" });
		}

		if (event.last_host_reminder_at) {
			const elapsed = Date.now() - new Date(event.last_host_reminder_at).getTime();
			if (elapsed < COOLDOWN_MS) {
				const retryAfterSeconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
				return jsonResponse(429, {
					success: false,
					error: "Reminder cooldown active",
					retry_after_seconds: retryAfterSeconds,
				});
			}
		}

		const { data: recipients, error: recipientsError } = await service
			.from("event_participants")
			.select("user_id")
			.eq("event_id", eventId)
			.neq("user_id", callerProfile.id);

		if (recipientsError) {
			throw new Error(`Failed to fetch participants: ${recipientsError.message}`);
		}

		const recipientUserIds = (recipients || []).map((row) => row.user_id);

		if (recipientUserIds.length === 0) {
			await service
				.from("events")
				.update({ last_host_reminder_at: new Date().toISOString() })
				.eq("id", eventId);

			return jsonResponse(200, {
				success: true,
				sent: 0,
				skipped: 0,
				message: "No other participants to notify",
			});
		}

		const { data: tokenRows, error: tokenError } = await service
			.from("user_private_data")
			.select("user_id, push_token")
			.in("user_id", recipientUserIds);

		if (tokenError) {
			throw new Error(`Failed to fetch push tokens: ${tokenError.message}`);
		}

		const tokens = (tokenRows || [])
			.map((row) => row.push_token)
			.filter((token): token is string => typeof token === "string" && token.length > 0);

		const skipped = recipientUserIds.length - tokens.length;

		const { title, body: messageBody } = buildMessage(reminderType, event.title);

		const result = await sendExpoPushNotifications(tokens, title, messageBody, {
			type: "host_reminder",
			reminder_type: reminderType,
			eventId: event.id,
		});

		const { error: updateError } = await service
			.from("events")
			.update({ last_host_reminder_at: new Date().toISOString() })
			.eq("id", eventId);

		if (updateError) {
			console.error("Failed to update last_host_reminder_at", updateError.message);
		}

		return jsonResponse(200, {
			success: true,
			sent: result.sent,
			failed: result.failed,
			skipped,
			recipients: recipientUserIds.length,
		});
	} catch (error) {
		console.error("send-host-reminder error", error);
		return jsonResponse(500, { success: false, error: "Internal server error" });
	}
});
