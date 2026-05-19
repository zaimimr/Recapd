import { create } from "zustand";
import { generateJoinCode } from "@/lib/invite";
import { supabase } from "@/lib/supabase";
import type { EventMemberRow, EventRow } from "@/types/database";

interface CreateEventInput {
	title: string;
	description?: string;
	startsAt: Date;
	endsAt: Date;
	allowOutsideWindow: boolean;
	timezone?: string;
}

interface UpdateEventInput {
	title?: string;
	description?: string | null;
	startsAt?: Date;
	endsAt?: Date;
	allowOutsideWindow?: boolean;
}

interface EventState {
	events: EventRow[];
	loading: boolean;
	error: string | null;
	loadEvents: (userId: string) => Promise<void>;
	createEvent: (userId: string, input: CreateEventInput) => Promise<EventRow>;
	updateEvent: (eventId: string, input: UpdateEventInput) => Promise<EventRow>;
	deleteEvent: (eventId: string) => Promise<void>;
	joinByCode: (code: string, displayName: string) => Promise<EventRow>;
	getEvent: (eventId: string) => Promise<{ event: EventRow; role: "host" | "guest" }>;
	getMembers: (eventId: string) => Promise<EventMemberRow[]>;
}

export const useEventStore = create<EventState>((set, get) => ({
	events: [],
	loading: false,
	error: null,

	loadEvents: async (userId) => {
		set({ loading: true, error: null });
		const { data, error } = await supabase
			.from("event_members")
			.select("events:event_id ( * )")
			.eq("user_id", userId);
		if (error) {
			set({ loading: false, error: error.message });
			throw error;
		}
		const rows = (data ?? [])
			.map((r) => (r as unknown as { events: EventRow | null }).events)
			.filter((e): e is EventRow => Boolean(e))
			.sort((a, b) => b.starts_at.localeCompare(a.starts_at));
		set({ events: rows, loading: false });
	},

	createEvent: async (userId, input) => {
		const insert = {
			host_id: userId,
			title: input.title.trim(),
			description: input.description?.trim() || null,
			starts_at: input.startsAt.toISOString(),
			ends_at: input.endsAt.toISOString(),
			timezone: input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
			allow_outside_window: input.allowOutsideWindow,
			join_code: generateJoinCode(),
		};
		const { data, error } = await supabase
			.from("events")
			.insert(insert)
			.select()
			.single();
		if (error) throw error;

		set({ events: [data, ...get().events] });
		return data;
	},

	updateEvent: async (eventId, input) => {
		const patch: Record<string, unknown> = {};
		if (input.title !== undefined) patch.title = input.title.trim();
		if (input.description !== undefined) patch.description = input.description?.trim() || null;
		if (input.startsAt) patch.starts_at = input.startsAt.toISOString();
		if (input.endsAt) patch.ends_at = input.endsAt.toISOString();
		if (input.allowOutsideWindow !== undefined) patch.allow_outside_window = input.allowOutsideWindow;

		const { data, error } = await supabase
			.from("events")
			.update(patch)
			.eq("id", eventId)
			.select()
			.single();
		if (error) throw error;

		set({
			events: get().events.map((e) => (e.id === eventId ? data : e)),
		});
		return data;
	},

	deleteEvent: async (eventId) => {
		const { error } = await supabase.from("events").delete().eq("id", eventId);
		if (error) throw error;
		set({ events: get().events.filter((e) => e.id !== eventId) });
	},

	joinByCode: async (code, displayName) => {
		const trimmedName = displayName.trim();
		if (!trimmedName) throw new Error("Display name required");

		const { data, error } = await supabase.rpc("rpc_join_event", {
			p_code: code,
			p_display_name: trimmedName,
		});
		if (error) {
			throw new Error(humanizeJoinError(error.message));
		}
		if (!data) throw new Error("Could not join that event");
		const row = data as unknown as EventRow;

		set({ events: dedupe([row, ...get().events]) });
		return row;
	},

	getEvent: async (eventId) => {
		const { data: sessionData } = await supabase.auth.getSession();
		const uid = sessionData.session?.user.id;

		const { data: eventRow, error } = await supabase
			.from("events")
			.select("*")
			.eq("id", eventId)
			.single();
		if (error || !eventRow) throw error ?? new Error("Event not found");

		const role: "host" | "guest" = eventRow.host_id === uid ? "host" : "guest";
		return { event: eventRow, role };
	},

	getMembers: async (eventId) => {
		const { data, error } = await supabase
			.from("event_members")
			.select("*")
			.eq("event_id", eventId)
			.order("joined_at", { ascending: true });
		if (error) throw error;
		return data ?? [];
	},
}));

function dedupe(rows: EventRow[]): EventRow[] {
	const seen = new Set<string>();
	const out: EventRow[] = [];
	for (const r of rows) {
		if (seen.has(r.id)) continue;
		seen.add(r.id);
		out.push(r);
	}
	return out;
}

function humanizeJoinError(message: string): string {
	const m = message.toLowerCase();
	if (m.includes("not found") || m.includes("invalid code")) return "Code doesn't match an event.";
	if (m.includes("guest cap")) return "This event is full on the host's plan.";
	return message;
}
