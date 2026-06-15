import { logger } from "./logger";
import { supabase } from "./supabase";

export const DELETION_DELAY_DAYS = 7;
export const DELETION_DELAY_WINDOW_DAYS = 2;

export interface DelayDeletionResult {
	ok: true;
	newExpiresAt: string;
	sent: number;
	recipients: number;
	skipped: number;
}

export interface DelayDeletionFailure {
	ok: false;
	reason:
		| "unauthorized"
		| "event_inactive"
		| "already_delayed"
		| "too_early"
		| "not_found"
		| "unknown";
	message?: string;
}

export type DelayDeletionOutcome = DelayDeletionResult | DelayDeletionFailure;

interface ServerResponse {
	success: boolean;
	error?: string;
	code?: string;
	message?: string;
	new_expires_at?: string;
	sent?: number;
	recipients?: number;
	skipped?: number;
}

export async function delayEventDeletion(eventId: string): Promise<DelayDeletionOutcome> {
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

	const normalizedBase = supabaseUrl.replace(/\/+$/, "");
	const url = `${normalizedBase}/functions/v1/delay-event-deletion`;

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
			body: JSON.stringify({ event_id: eventId }),
		});
		status = response.status;
		const text = await response.text();
		parsed = text ? (JSON.parse(text) as ServerResponse) : undefined;
	} catch (error) {
		logger.error("Delay deletion fetch failed", error, { eventId });
		return { ok: false, reason: "unknown", message: "Network error" };
	}

	if (status === 403) {
		return { ok: false, reason: "unauthorized" };
	}

	if (status === 409) {
		return {
			ok: false,
			reason: parsed?.code === "already_delayed" ? "already_delayed" : "event_inactive",
		};
	}

	if (status === 422) {
		return { ok: false, reason: "too_early", message: parsed?.error };
	}

	if (status === 404) {
		return { ok: false, reason: "not_found", message: parsed?.error };
	}

	if (status < 200 || status >= 300 || !parsed?.success || !parsed.new_expires_at) {
		logger.error("Delay deletion failed", undefined, { eventId, status, body: parsed });
		return { ok: false, reason: "unknown", message: parsed?.error };
	}

	return {
		ok: true,
		newExpiresAt: parsed.new_expires_at,
		sent: parsed.sent ?? 0,
		recipients: parsed.recipients ?? 0,
		skipped: parsed.skipped ?? 0,
	};
}
