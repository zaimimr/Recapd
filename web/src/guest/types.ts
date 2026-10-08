import type { Session } from "@supabase/supabase-js";

export type GuestEvent = {
	id: string;
	title: string;
	starts_at: string;
	ends_at: string;
	timezone: string | null;
	join_code: string;
	created_by_user_id: string;
	status: string;
	expires_at: string | null;
	participant_count: number;
	host_is_pro: boolean;
	location?: string | null;
	dress_code?: string | null;
	details?: string | null;
	schedule?: unknown;
};

export type ScheduleItem = { time: string; title: string };

export type GalleryProps = {
	event: GuestEvent;
	profileId: string;
	session: Session;
};
