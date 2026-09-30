import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { decideJoinOutcome, decideScreen, validateDisplayName } from "./joinFlow";
import { guestSupabase } from "./supabase";
import type { GuestEvent } from "./types";

export type GuestState =
	| { screen: "loading" }
	| { screen: "error" }
	| { screen: "notFound" }
	| { screen: "welcome"; event: GuestEvent; existingName: string | null }
	| { screen: "full"; event: GuestEvent }
	| { screen: "gallery"; event: GuestEvent; profileId: string; session: Session };

async function fetchPreview(code: string): Promise<GuestEvent | null> {
	const { data, error } = await guestSupabase.rpc("get_event_preview", {
		join_code_input: code,
	});
	if (error) throw error;
	const row = (data as GuestEvent[] | null)?.[0];
	return row ? { ...row, participant_count: Number(row.participant_count) || 0 } : null;
}

async function findProfile(
	authUserId: string
): Promise<{ id: string; display_name: string } | null> {
	const { data, error } = await guestSupabase
		.from("users")
		.select("id, display_name")
		.eq("auth_user_id", authUserId)
		.maybeSingle();
	if (error) throw error;
	return data ?? null;
}

async function findProfileId(authUserId: string): Promise<string | null> {
	return (await findProfile(authUserId))?.id ?? null;
}

async function isParticipantOf(eventId: string, profileId: string): Promise<boolean> {
	const { data, error } = await guestSupabase
		.from("event_participants")
		.select("id")
		.eq("event_id", eventId)
		.eq("user_id", profileId)
		.maybeSingle();
	if (error) throw error;
	return Boolean(data);
}

async function currentSession(): Promise<Session | null> {
	const { data } = await guestSupabase.auth.getSession();
	return data.session;
}

async function ensureSession(): Promise<Session> {
	const existing = await currentSession();
	if (existing) return existing;
	const { data, error } = await guestSupabase.auth.signInAnonymously();
	if (error) throw error;
	if (!data.session) throw new Error("Anonymous session was not created");
	return data.session;
}

async function ensureProfile(authUserId: string, displayName: string): Promise<string> {
	const existing = await findProfileId(authUserId);
	if (existing) return existing;
	const { error } = await guestSupabase
		.from("users")
		.insert({ display_name: displayName, auth_user_id: authUserId });
	if (error && error.code !== "23505") throw error;
	const created = await findProfileId(authUserId);
	if (!created) throw new Error("Created user profile could not be loaded");
	return created;
}

async function resolveInitial(code: string): Promise<GuestState> {
	const event = await fetchPreview(code);
	const session = event ? await currentSession() : null;
	const profile = session ? await findProfile(session.user.id) : null;
	const profileId = profile?.id ?? null;
	const isParticipant = event && profileId ? await isParticipantOf(event.id, profileId) : false;
	const screen = decideScreen({ preview: event, isParticipant, now: new Date() });
	if (!event || screen === "notFound") return { screen: "notFound" };
	if (screen === "gallery" && session && profileId) {
		return { screen: "gallery", event, profileId, session };
	}
	return { screen: "welcome", event, existingName: profile?.display_name ?? null };
}

export function useGuestSession(code: string) {
	const [state, setState] = useState<GuestState>({ screen: "loading" });

	useEffect(() => {
		let cancelled = false;
		resolveInitial(code)
			.then((next) => {
				if (!cancelled) setState(next);
			})
			.catch(() => {
				if (!cancelled) setState({ screen: "error" });
			});
		return () => {
			cancelled = true;
		};
	}, [code]);

	useEffect(() => {
		const { data } = guestSupabase.auth.onAuthStateChange((_event, session) => {
			if (!session) return;
			setState((current) =>
				current.screen === "gallery" && current.session.user.id === session.user.id
					? { ...current, session }
					: current
			);
		});
		return () => data.subscription.unsubscribe();
	}, []);

	const join = useCallback(async (event: GuestEvent, rawName: string): Promise<string | null> => {
		const check = validateDisplayName(rawName);
		if (!check.ok) return check.message;
		try {
			const session = await ensureSession();
			const profileId = await ensureProfile(session.user.id, check.name);
			const { error } = await guestSupabase.from("event_participants").insert({
				event_id: event.id,
				user_id: profileId,
				role: "guest",
				nickname: null,
			});
			const outcome = decideJoinOutcome(error);
			if (outcome === "full") {
				setState({ screen: "full", event });
				return null;
			}
			if (outcome === "error") return "Could not join right now. Please try again.";
			setState({ screen: "gallery", event, profileId, session });
			return null;
		} catch {
			return "Could not join right now. Please try again.";
		}
	}, []);

	return { state, join };
}
