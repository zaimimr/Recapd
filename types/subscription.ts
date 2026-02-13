import type { SubscriptionTier } from "./database";

export const FREE_PARTICIPANT_LIMIT = 12;
export const PARTICIPANT_WARNING_THRESHOLD = 10;

export const FREE_MAX_VIDEO_DURATION_MS = 30_000;
export const PRO_MAX_VIDEO_DURATION_MS = 300_000;

export interface TierLimits {
	maxParticipants: number;
	canUploadVideos: boolean;
}

export interface TierInfo {
	id: SubscriptionTier;
	name: string;
	limits: TierLimits;
}

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
	free: {
		maxParticipants: FREE_PARTICIPANT_LIMIT,
		canUploadVideos: true,
	},
	pro: {
		maxParticipants: Infinity,
		canUploadVideos: true,
	},
};

export const TIER_INFO: Record<SubscriptionTier, TierInfo> = {
	free: {
		id: "free",
		name: "Free",
		limits: TIER_LIMITS.free,
	},
	pro: {
		id: "pro",
		name: "Pro",
		limits: TIER_LIMITS.pro,
	},
};

export function getTierLimits(tier: SubscriptionTier): TierLimits {
	return TIER_LIMITS[tier];
}

export function getTierInfo(tier: SubscriptionTier): TierInfo {
	return TIER_INFO[tier];
}

export function canUploadVideos(_userIsPro: boolean, _hostIsPro: boolean): boolean {
	return true;
}

export function getMaxVideoDurationMs(isPro: boolean, hostIsPro: boolean): number {
	return isPro || hostIsPro ? PRO_MAX_VIDEO_DURATION_MS : FREE_MAX_VIDEO_DURATION_MS;
}

export function isAtParticipantLimit(count: number, hostIsPro: boolean): boolean {
	if (hostIsPro) return false;
	return count >= FREE_PARTICIPANT_LIMIT;
}

export function shouldShowParticipantWarning(count: number, hostIsPro: boolean): boolean {
	if (hostIsPro) return false;
	return count >= PARTICIPANT_WARNING_THRESHOLD;
}
