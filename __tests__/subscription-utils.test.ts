import {
	canUploadVideos,
	FREE_MAX_VIDEO_DURATION_MS,
	FREE_PARTICIPANT_LIMIT,
	getMaxVideoDurationMs,
	getTierInfo,
	getTierLimits,
	isAtParticipantLimit,
	PARTICIPANT_WARNING_THRESHOLD,
	PRO_MAX_VIDEO_DURATION_MS,
	shouldShowParticipantWarning,
	TIER_INFO,
	TIER_LIMITS,
} from "@/types/subscription";

describe("subscription constants", () => {
	it("FREE_PARTICIPANT_LIMIT equals 12", () => {
		expect(FREE_PARTICIPANT_LIMIT).toBe(12);
	});

	it("PARTICIPANT_WARNING_THRESHOLD equals 10", () => {
		expect(PARTICIPANT_WARNING_THRESHOLD).toBe(10);
	});

	it("warning threshold is less than participant limit", () => {
		expect(PARTICIPANT_WARNING_THRESHOLD).toBeLessThan(FREE_PARTICIPANT_LIMIT);
	});
});

describe("TIER_LIMITS", () => {
	it("free tier has correct limits", () => {
		expect(TIER_LIMITS.free).toEqual({
			maxParticipants: FREE_PARTICIPANT_LIMIT,
			canUploadVideos: true,
		});
	});

	it("pro tier has unlimited participants and video upload", () => {
		expect(TIER_LIMITS.pro).toEqual({
			maxParticipants: Infinity,
			canUploadVideos: true,
		});
	});
});

describe("TIER_INFO", () => {
	it("free tier info has correct structure", () => {
		expect(TIER_INFO.free).toEqual({
			id: "free",
			name: "Free",
			limits: TIER_LIMITS.free,
		});
	});

	it("pro tier info has correct structure", () => {
		expect(TIER_INFO.pro).toEqual({
			id: "pro",
			name: "Pro",
			limits: TIER_LIMITS.pro,
		});
	});

	it("tier info limits reference the same objects as TIER_LIMITS", () => {
		expect(TIER_INFO.free.limits).toBe(TIER_LIMITS.free);
		expect(TIER_INFO.pro.limits).toBe(TIER_LIMITS.pro);
	});
});

describe("getTierLimits", () => {
	it("returns maxParticipants=12 and canUploadVideos=true for free tier", () => {
		const limits = getTierLimits("free");
		expect(limits.maxParticipants).toBe(12);
		expect(limits.canUploadVideos).toBe(true);
	});

	it("returns maxParticipants=Infinity and canUploadVideos=true for pro tier", () => {
		const limits = getTierLimits("pro");
		expect(limits.maxParticipants).toBe(Infinity);
		expect(limits.canUploadVideos).toBe(true);
	});

	it("returns the same object as TIER_LIMITS lookup", () => {
		expect(getTierLimits("free")).toBe(TIER_LIMITS.free);
		expect(getTierLimits("pro")).toBe(TIER_LIMITS.pro);
	});
});

describe("getTierInfo", () => {
	it("returns correct info for free tier", () => {
		const info = getTierInfo("free");
		expect(info.id).toBe("free");
		expect(info.name).toBe("Free");
		expect(info.limits).toBe(TIER_LIMITS.free);
	});

	it("returns correct info for pro tier", () => {
		const info = getTierInfo("pro");
		expect(info.id).toBe("pro");
		expect(info.name).toBe("Pro");
		expect(info.limits).toBe(TIER_LIMITS.pro);
	});

	it("returns the same object as TIER_INFO lookup", () => {
		expect(getTierInfo("free")).toBe(TIER_INFO.free);
		expect(getTierInfo("pro")).toBe(TIER_INFO.pro);
	});
});

describe("canUploadVideos", () => {
	it("returns true for all combinations (free tier includes video uploads)", () => {
		expect(canUploadVideos(false, false)).toBe(true);
		expect(canUploadVideos(true, false)).toBe(true);
		expect(canUploadVideos(false, true)).toBe(true);
		expect(canUploadVideos(true, true)).toBe(true);
	});
});

describe("video duration constants", () => {
	it("FREE_MAX_VIDEO_DURATION_MS is 30 seconds", () => {
		expect(FREE_MAX_VIDEO_DURATION_MS).toBe(30_000);
	});

	it("PRO_MAX_VIDEO_DURATION_MS is 5 minutes", () => {
		expect(PRO_MAX_VIDEO_DURATION_MS).toBe(300_000);
	});
});

describe("getMaxVideoDurationMs", () => {
	it("returns free limit when neither user nor host is pro", () => {
		expect(getMaxVideoDurationMs(false, false)).toBe(FREE_MAX_VIDEO_DURATION_MS);
	});

	it("returns pro limit when user is pro", () => {
		expect(getMaxVideoDurationMs(true, false)).toBe(PRO_MAX_VIDEO_DURATION_MS);
	});

	it("returns pro limit when host is pro", () => {
		expect(getMaxVideoDurationMs(false, true)).toBe(PRO_MAX_VIDEO_DURATION_MS);
	});

	it("returns pro limit when both are pro", () => {
		expect(getMaxVideoDurationMs(true, true)).toBe(PRO_MAX_VIDEO_DURATION_MS);
	});
});

describe("isAtParticipantLimit", () => {
	it("returns true when count equals the free limit", () => {
		expect(isAtParticipantLimit(FREE_PARTICIPANT_LIMIT, false)).toBe(true);
	});

	it("returns true when count exceeds the free limit", () => {
		expect(isAtParticipantLimit(FREE_PARTICIPANT_LIMIT + 1, false)).toBe(true);
		expect(isAtParticipantLimit(100, false)).toBe(true);
	});

	it("returns false when count is one below the free limit", () => {
		expect(isAtParticipantLimit(FREE_PARTICIPANT_LIMIT - 1, false)).toBe(false);
	});

	it("returns false when count is zero for free host", () => {
		expect(isAtParticipantLimit(0, false)).toBe(false);
	});

	it("returns false when host is pro regardless of count", () => {
		expect(isAtParticipantLimit(0, true)).toBe(false);
		expect(isAtParticipantLimit(FREE_PARTICIPANT_LIMIT, true)).toBe(false);
		expect(isAtParticipantLimit(FREE_PARTICIPANT_LIMIT + 100, true)).toBe(false);
		expect(isAtParticipantLimit(Infinity, true)).toBe(false);
	});
});

describe("shouldShowParticipantWarning", () => {
	it("returns true when count equals the warning threshold", () => {
		expect(shouldShowParticipantWarning(PARTICIPANT_WARNING_THRESHOLD, false)).toBe(true);
	});

	it("returns true when count exceeds the warning threshold", () => {
		expect(shouldShowParticipantWarning(PARTICIPANT_WARNING_THRESHOLD + 1, false)).toBe(true);
		expect(shouldShowParticipantWarning(100, false)).toBe(true);
	});

	it("returns false when count is one below the warning threshold", () => {
		expect(shouldShowParticipantWarning(PARTICIPANT_WARNING_THRESHOLD - 1, false)).toBe(false);
	});

	it("returns false when count is zero for free host", () => {
		expect(shouldShowParticipantWarning(0, false)).toBe(false);
	});

	it("returns false when host is pro regardless of count", () => {
		expect(shouldShowParticipantWarning(0, true)).toBe(false);
		expect(shouldShowParticipantWarning(PARTICIPANT_WARNING_THRESHOLD, true)).toBe(false);
		expect(shouldShowParticipantWarning(PARTICIPANT_WARNING_THRESHOLD + 100, true)).toBe(false);
	});
});

describe("warning and limit interaction", () => {
	it("warning fires before limit is reached", () => {
		const countAtWarning = PARTICIPANT_WARNING_THRESHOLD;
		expect(shouldShowParticipantWarning(countAtWarning, false)).toBe(true);
		expect(isAtParticipantLimit(countAtWarning, false)).toBe(false);
	});

	it("both warning and limit are true at the limit", () => {
		expect(shouldShowParticipantWarning(FREE_PARTICIPANT_LIMIT, false)).toBe(true);
		expect(isAtParticipantLimit(FREE_PARTICIPANT_LIMIT, false)).toBe(true);
	});

	it("neither warning nor limit fires for pro host at any count", () => {
		for (const count of [0, 10, 12, 50]) {
			expect(shouldShowParticipantWarning(count, true)).toBe(false);
			expect(isAtParticipantLimit(count, true)).toBe(false);
		}
	});
});
