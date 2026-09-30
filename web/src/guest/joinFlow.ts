export type Screen = "notFound" | "welcome" | "gallery";

export type JoinOutcome = "gallery" | "full" | "error";

export type NameCheck = { ok: true; name: string } | { ok: false; message: string };

export const NAME_MIN = 2;
export const NAME_MAX = 30;

export function validateDisplayName(raw: string): NameCheck {
	const name = raw.trim();
	if (name.length < NAME_MIN) return { ok: false, message: "Use at least 2 characters" };
	if (name.length > NAME_MAX) return { ok: false, message: "Use 30 characters or fewer" };
	return { ok: true, name };
}

export function decideScreen(input: {
	preview: { expires_at: string | null } | null;
	isParticipant: boolean;
	now: Date;
}): Screen {
	const { preview, isParticipant, now } = input;
	if (!preview) return "notFound";
	if (preview.expires_at && new Date(preview.expires_at).getTime() <= now.getTime()) {
		return "notFound";
	}
	return isParticipant ? "gallery" : "welcome";
}

export function decideJoinOutcome(
	error: { code?: string | null; message?: string | null } | null
): JoinOutcome {
	if (!error) return "gallery";
	if (error.code === "23505") return "gallery";
	if (error.code === "42501" || error.message?.toLowerCase().includes("row-level security")) {
		return "full";
	}
	return "error";
}
