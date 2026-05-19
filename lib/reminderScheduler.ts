import { supabase } from "./supabase";

export const HOST_NUDGE_COOLDOWN_HOURS = 6;

export type CooldownInfo = {
	canSend: boolean;
	lastSentAt: Date | null;
	nextAvailableAt: Date | null;
	remainingMs: number;
};

export async function getHostNudgeCooldown(eventId: string): Promise<CooldownInfo> {
	const { data } = await supabase
		.from("nudge_log")
		.select("sent_at")
		.eq("event_id", eventId)
		.eq("kind", "host_broadcast")
		.order("sent_at", { ascending: false })
		.limit(1)
		.maybeSingle();

	const lastSentAt = data?.sent_at ? new Date(data.sent_at) : null;
	if (!lastSentAt) {
		return { canSend: true, lastSentAt: null, nextAvailableAt: null, remainingMs: 0 };
	}
	const cooldownMs = HOST_NUDGE_COOLDOWN_HOURS * 60 * 60 * 1000;
	const nextAvailableAt = new Date(lastSentAt.getTime() + cooldownMs);
	const remainingMs = Math.max(0, nextAvailableAt.getTime() - Date.now());
	return {
		canSend: remainingMs === 0,
		lastSentAt,
		nextAvailableAt,
		remainingMs,
	};
}

export type NudgeResult = {
	ok: boolean;
	recipientCount?: number;
	cooldownRemainingMs?: number;
	error?: string;
};

export async function sendHostBroadcastNudge(eventId: string): Promise<NudgeResult> {
	const cooldown = await getHostNudgeCooldown(eventId);
	if (!cooldown.canSend) {
		return { ok: false, cooldownRemainingMs: cooldown.remainingMs, error: "cooldown" };
	}
	const { data, error } = await supabase.functions.invoke("nudge-broadcast", {
		body: { event_id: eventId },
	});
	if (error) return { ok: false, error: error.message };
	const recipientCount =
		typeof (data as { recipient_count?: number } | null)?.recipient_count === "number"
			? (data as { recipient_count: number }).recipient_count
			: 0;
	return { ok: true, recipientCount };
}

export function formatCooldownLabel(remainingMs: number): string {
	if (remainingMs <= 0) return "Ready";
	const totalMinutes = Math.ceil(remainingMs / 60000);
	if (totalMinutes < 60) return `${totalMinutes}m`;
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}
