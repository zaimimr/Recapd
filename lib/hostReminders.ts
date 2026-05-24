import { logger } from "./logger";
import { supabase } from "./supabase";

export type HostReminderType = "upload" | "take_photos";

export interface HostReminderResult {
	ok: true;
	sent: number;
	recipients: number;
	skipped: number;
}

export interface HostReminderCooldown {
	ok: false;
	reason: "cooldown";
	retryAfterSeconds: number;
}

export interface HostReminderFailure {
	ok: false;
	reason: "unauthorized" | "event_inactive" | "unknown";
	message?: string;
}

export type HostReminderOutcome = HostReminderResult | HostReminderCooldown | HostReminderFailure;

interface ServerResponse {
	success: boolean;
	error?: string;
	sent?: number;
	recipients?: number;
	skipped?: number;
	retry_after_seconds?: number;
}

export async function sendHostReminder(
	eventId: string,
	reminderType: HostReminderType
): Promise<HostReminderOutcome> {
	const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
	const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
	if (!supabaseUrl || !anonKey) {
		return { ok: false, reason: "unknown", message: "Supabase config missing" };
	}

	const {
		data: { session },
	} = await supabase.auth.getSession();
	const accessToken = session?.access_token;
	if (!accessToken) {
		return { ok: false, reason: "unauthorized" };
	}

	const url = `${supabaseUrl}/functions/v1/send-host-reminder`;

	let status: number;
	let parsed: ServerResponse | undefined;
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				apikey: anonKey,
				Authorization: `Bearer ${accessToken}`,
			},
			body: JSON.stringify({ event_id: eventId, reminder_type: reminderType }),
		});
		status = response.status;
		const text = await response.text();
		parsed = text ? (JSON.parse(text) as ServerResponse) : undefined;
	} catch (error) {
		logger.error("Host reminder fetch failed", error, { eventId, reminderType });
		return { ok: false, reason: "unknown", message: "Network error" };
	}

	if (status === 429) {
		return {
			ok: false,
			reason: "cooldown",
			retryAfterSeconds: Number(parsed?.retry_after_seconds) || 0,
		};
	}

	if (status === 403) {
		return { ok: false, reason: "unauthorized" };
	}

	if (status === 409) {
		return { ok: false, reason: "event_inactive" };
	}

	if (status < 200 || status >= 300 || !parsed?.success) {
		logger.error("Host reminder failed", undefined, {
			eventId,
			reminderType,
			status,
			body: parsed,
		});
		return {
			ok: false,
			reason: "unknown",
			message: parsed?.error,
		};
	}

	return {
		ok: true,
		sent: parsed.sent ?? 0,
		recipients: parsed.recipients ?? 0,
		skipped: parsed.skipped ?? 0,
	};
}
