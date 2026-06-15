import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = {
	"Content-Type": "application/json",
};

const DELAY_DAYS = 7;
const ALLOW_WINDOW_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

interface RequestBody {
	event_id?: string;
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

function formatDeletionDate(iso: string): string {
	try {
		return new Date(iso).toLocaleDateString("en-US", {
			month: "long",
			day: "numeric",
		});
	} catch {
		return "soon";
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
			.select("id, title, status, expires_at, deletion_delayed_at")
			.eq("id", eventId)
			.maybeSingle();

		if (eventError || !event) {
			return jsonResponse(404, { success: false, error: "Event not found" });
		}

		const expiresAtMs = new Date(event.expires_at).getTime();
		const now = Date.now();

		if (event.status === "expired" || expiresAtMs < now) {
			return jsonResponse(409, {
				success: false,
				code: "event_inactive",
				error: "Event is no longer active",
			});
		}

		const { data: hostParticipant, error: hostError } = await service
			.from("event_participants")
			.select("id")
			.eq("event_id", eventId)
			.eq("user_id", callerProfile.id)
			.eq("role", "host")
			.maybeSingle();

		if (hostError || !hostParticipant) {
			return jsonResponse(403, {
				success: false,
				code: "not_host",
				error: "Only the event host can delay deletion",
			});
		}

		if (event.deletion_delayed_at) {
			return jsonResponse(409, {
				success: false,
				code: "already_delayed",
				error: "Deletion has already been delayed for this event",
			});
		}

		if (expiresAtMs - now > ALLOW_WINDOW_DAYS * DAY_MS) {
			return jsonResponse(422, {
				success: false,
				code: "too_early",
				error: "Deletion can only be delayed within 2 days of deletion",
			});
		}

		const newExpiresAt = new Date(expiresAtMs + DELAY_DAYS * DAY_MS).toISOString();
		const nowIso = new Date(now).toISOString();

		const { error: updateError } = await service
			.from("events")
			.update({ expires_at: newExpiresAt, deletion_delayed_at: nowIso })
			.eq("id", eventId)
			.is("deletion_delayed_at", null);

		if (updateError) {
			throw new Error(`Failed to delay deletion: ${updateError.message}`);
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
			return jsonResponse(200, {
				success: true,
				new_expires_at: newExpiresAt,
				sent: 0,
				skipped: 0,
				message: "Deletion delayed, no other participants to notify",
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

		const result = await sendExpoPushNotifications(
			tokens,
			event.title,
			`This event is being deleted on ${formatDeletionDate(newExpiresAt)}. Download your photos before they're gone.`,
			{
				type: "deletion_warning",
				eventId: event.id,
			}
		);

		return jsonResponse(200, {
			success: true,
			new_expires_at: newExpiresAt,
			sent: result.sent,
			failed: result.failed,
			skipped,
			recipients: recipientUserIds.length,
		});
	} catch (error) {
		console.error("delay-event-deletion error", error);
		return jsonResponse(500, { success: false, error: "Internal server error" });
	}
});
