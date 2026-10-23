import type { PurchasesPackage } from "react-native-purchases";
import { logger } from "./logger";
import { getAllOfferings, purchasePackage } from "./subscription";
import { supabase } from "./supabase";

export const EVENT_PASS_OFFERING_ID = "event_pass";
const REDEEM_ATTEMPTS = 3;
const REDEEM_RETRY_DELAY_MS = 2000;

export type EventPassOutcome =
	| { ok: true }
	| {
			ok: false;
			reason: "cancelled" | "unavailable" | "not_redeemed" | "failed";
			message?: string;
	  };

interface RedeemResponse {
	success?: boolean;
	code?: string;
	error?: string;
}

export async function getEventPassPackage(): Promise<PurchasesPackage | null> {
	const offerings = await getAllOfferings();
	return offerings?.[EVENT_PASS_OFFERING_ID]?.availablePackages[0] ?? null;
}

async function requestRedeem(eventId: string): Promise<{ status: number; body?: RedeemResponse }> {
	const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
	const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
	const {
		data: { session },
	} = await supabase.auth.getSession();
	if (!supabaseUrl || !anonKey || !session?.access_token) {
		return { status: 401 };
	}

	const response = await fetch(
		`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/redeem-event-pass`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				apikey: anonKey,
				Authorization: `Bearer ${session.access_token}`,
			},
			body: JSON.stringify({ event_id: eventId }),
		}
	);
	const text = await response.text();
	return { status: response.status, body: text ? (JSON.parse(text) as RedeemResponse) : undefined };
}

export async function redeemEventPass(eventId: string): Promise<EventPassOutcome> {
	for (let attempt = 1; attempt <= REDEEM_ATTEMPTS; attempt++) {
		try {
			const { status, body } = await requestRedeem(eventId);
			if (status >= 200 && status < 300 && body?.success) {
				return { ok: true };
			}
			if (status !== 402) {
				logger.error("Event Pass redeem failed", undefined, { eventId, status, body });
				return { ok: false, reason: "not_redeemed", message: body?.error };
			}
		} catch (error) {
			logger.error("Event Pass redeem request failed", error, { eventId });
		}
		if (attempt < REDEEM_ATTEMPTS) {
			await new Promise((resolve) => setTimeout(resolve, REDEEM_RETRY_DELAY_MS));
		}
	}
	return { ok: false, reason: "not_redeemed" };
}

export async function purchaseEventPass(
	eventId: string,
	pkg: PurchasesPackage
): Promise<EventPassOutcome> {
	const result = await purchasePackage(pkg);
	if (!result.success) {
		if (result.userCancelled) {
			return { ok: false, reason: "cancelled" };
		}
		return { ok: false, reason: "failed", message: result.error };
	}
	return redeemEventPass(eventId);
}
