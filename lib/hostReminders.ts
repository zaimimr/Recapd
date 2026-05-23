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

export async function sendHostReminder(
	eventId: string,
	reminderType: HostReminderType
): Promise<HostReminderOutcome> {
	const { data, error } = await supabase.functions.invoke<{
		success: boolean;
		error?: string;
		sent?: number;
		recipients?: number;
		skipped?: number;
		retry_after_seconds?: number;
	}>("send-host-reminder", {
		body: { event_id: eventId, reminder_type: reminderType },
	});

	if (error) {
		const context = (error as { context?: { status?: number } }).context;
		const status = context?.status;
		const responseBody = (error as { context?: { body?: unknown } }).context?.body;
		const parsed =
			typeof responseBody === "string"
				? safeJsonParse(responseBody)
				: (responseBody as Record<string, unknown> | undefined);

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

		logger.error("Host reminder failed", error, { eventId, reminderType, status });
		return {
			ok: false,
			reason: "unknown",
			message: typeof parsed?.error === "string" ? parsed.error : undefined,
		};
	}

	if (!data?.success) {
		return { ok: false, reason: "unknown", message: data?.error };
	}

	return {
		ok: true,
		sent: data.sent ?? 0,
		recipients: data.recipients ?? 0,
		skipped: data.skipped ?? 0,
	};
}

function safeJsonParse(raw: string): Record<string, unknown> | undefined {
	try {
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		return undefined;
	}
}
