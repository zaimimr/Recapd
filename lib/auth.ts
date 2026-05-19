import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export async function signInAnonymously(): Promise<Session> {
	const { data, error } = await supabase.auth.signInAnonymously();
	if (error) throw error;
	if (!data.session) throw new Error("Anonymous sign-in returned no session");
	return data.session;
}

export async function sendPhoneOtp(phone: string): Promise<void> {
	const { error } = await supabase.auth.signInWithOtp({ phone });
	if (error) throw error;
}

export async function verifyPhoneOtp(phone: string, token: string): Promise<Session> {
	const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
	if (error) throw error;
	if (!data.session) throw new Error("OTP verify returned no session");
	return data.session;
}

export async function signOut(): Promise<void> {
	await supabase.auth.signOut();
}

export async function updateDisplayName(id: string, displayName: string): Promise<void> {
	const trimmed = displayName.trim();
	if (!trimmed) throw new Error("Name cannot be empty");
	const { error } = await supabase
		.from("profiles")
		.upsert(
			{ id, display_name: trimmed, last_seen_at: new Date().toISOString() },
			{ onConflict: "id" }
		);
	if (error) throw error;
}

export async function fetchProfile(id: string): Promise<{ display_name: string } | null> {
	const { data, error } = await supabase
		.from("profiles")
		.select("display_name")
		.eq("id", id)
		.maybeSingle();
	if (error) throw error;
	return data;
}

export function normalizePhone(input: string): string {
	const trimmed = input.trim().replace(/[\s\-()]/g, "");
	if (!trimmed.startsWith("+")) {
		throw new Error("Phone number must include country code, e.g. +14155551234");
	}
	return trimmed;
}
