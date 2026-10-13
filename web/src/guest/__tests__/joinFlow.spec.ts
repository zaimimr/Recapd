import { describe, expect, it } from "vitest";
import { decideJoinOutcome, decideScreen, validateDisplayName } from "../joinFlow";

const now = new Date("2026-09-30T12:00:00Z");
const preview = { expires_at: "2026-10-10T00:00:00Z" };

describe("validateDisplayName", () => {
	it("accepts 2 to 30 characters after trimming", () => {
		expect(validateDisplayName("Al")).toEqual({ ok: true, name: "Al" });
		expect(validateDisplayName("  Zaim  ")).toEqual({ ok: true, name: "Zaim" });
		expect(validateDisplayName("a".repeat(30)).ok).toBe(true);
	});
	it("rejects too short and too long names", () => {
		expect(validateDisplayName("A").ok).toBe(false);
		expect(validateDisplayName("   ").ok).toBe(false);
		expect(validateDisplayName("a".repeat(31)).ok).toBe(false);
	});
});

describe("decideScreen", () => {
	it("shows not found when the preview is missing", () => {
		expect(decideScreen({ preview: null, isParticipant: false, now })).toBe("notFound");
	});
	it("shows not found when the event has expired", () => {
		const expired = { expires_at: "2026-09-01T00:00:00Z" };
		expect(decideScreen({ preview: expired, isParticipant: true, now })).toBe("notFound");
	});
	it("goes to the gallery for an existing participant", () => {
		expect(decideScreen({ preview, isParticipant: true, now })).toBe("gallery");
	});
	it("shows welcome otherwise", () => {
		expect(decideScreen({ preview, isParticipant: false, now })).toBe("welcome");
	});
});

describe("decideJoinOutcome", () => {
	it("goes to the gallery when the insert succeeds", () => {
		expect(decideJoinOutcome(null)).toBe("gallery");
	});
	it("shows full on an RLS rejection", () => {
		expect(decideJoinOutcome({ code: "42501", message: "denied" })).toBe("full");
		expect(decideJoinOutcome({ message: "new row violates row-level security policy" })).toBe(
			"full"
		);
	});
	it("goes to the gallery on a duplicate participant", () => {
		expect(decideJoinOutcome({ code: "23505", message: "duplicate key" })).toBe("gallery");
	});
	it("reports other errors", () => {
		expect(decideJoinOutcome({ code: "500", message: "boom" })).toBe("error");
	});
});
