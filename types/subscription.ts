import type { SubscriptionPlan as DbSubscriptionPlan, Json, SubscriptionTier } from "./database";

export interface SubscriptionPlanCapabilities {
	maxParticipants: number | null;
	participantWarningThreshold: number | null;
	maxSingleVideoDurationMs: number;
	maxSingleFileSizeBytes: number;
	canUploadVideos: boolean;
}

export const BYTES_PER_MB = 1024 * 1024;
export const BYTES_PER_GB = 1024 * 1024 * 1024;

export interface TierLimits {
	maxParticipants: number;
	canUploadVideos: boolean;
}

export interface TierInfo {
	id: SubscriptionTier;
	name: string;
	limits: TierLimits;
}

export interface SubscriptionPlan {
	id: SubscriptionTier;
	displayName: string;
	description: string | null;
	isActive: boolean;
	sortOrder: number;
	revenueCatEntitlementIdentifier: string | null;
	revenueCatOfferingIdentifier: string | null;
	capabilities: SubscriptionPlanCapabilities;
}

export type SubscriptionPlanCatalog = Record<SubscriptionTier, SubscriptionPlan>;
export type SubscriptionPlanLike = SubscriptionTier | boolean | null | undefined;

const DEFAULT_PLAN_CATALOG: SubscriptionPlanCatalog = {
	free: {
		id: "free",
		displayName: "Free",
		description: "Baseline plan for small events and limited uploads.",
		isActive: true,
		sortOrder: 0,
		revenueCatEntitlementIdentifier: null,
		revenueCatOfferingIdentifier: null,
		capabilities: {
			maxParticipants: 12,
			participantWarningThreshold: 10,
			maxSingleVideoDurationMs: 30_000,
			maxSingleFileSizeBytes: 500 * 1024 * 1024,
			canUploadVideos: true,
		},
	},
	pro: {
		id: "pro",
		displayName: "Pro",
		description: "Paid plan for unlocked events and longer uploads.",
		isActive: true,
		sortOrder: 1,
		revenueCatEntitlementIdentifier: "Recapd Pro",
		revenueCatOfferingIdentifier: null,
		capabilities: {
			maxParticipants: null,
			participantWarningThreshold: null,
			maxSingleVideoDurationMs: 300_000,
			maxSingleFileSizeBytes: 5 * 1024 * 1024 * 1024,
			canUploadVideos: true,
		},
	},
};

function normalizePlanId(value: SubscriptionPlanLike): SubscriptionTier {
	if (value === true) return "pro";
	return value === "pro" ? "pro" : "free";
}

function toNullableNumber(value: unknown, fallback: number | null): number | null {
	if (value == null) return fallback;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}
	return fallback;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function normalizeCapabilities(
	capabilities: Json | null | undefined,
	fallback: SubscriptionPlanCapabilities
): SubscriptionPlanCapabilities {
	const data =
		capabilities && typeof capabilities === "object" && !Array.isArray(capabilities)
			? capabilities
			: {};

	return {
		maxParticipants: toNullableNumber(data.maxParticipants, fallback.maxParticipants),
		participantWarningThreshold: toNullableNumber(
			data.participantWarningThreshold,
			fallback.participantWarningThreshold
		),
		maxSingleVideoDurationMs:
			toNullableNumber(data.maxSingleVideoDurationMs, fallback.maxSingleVideoDurationMs) ??
			fallback.maxSingleVideoDurationMs,
		maxSingleFileSizeBytes:
			toNullableNumber(data.maxSingleFileSizeBytes, fallback.maxSingleFileSizeBytes) ??
			fallback.maxSingleFileSizeBytes,
		canUploadVideos: toBoolean(data.canUploadVideos, fallback.canUploadVideos),
	};
}

export function createSubscriptionPlanCatalog(
	rows?: DbSubscriptionPlan[] | null
): SubscriptionPlanCatalog {
	const catalog: SubscriptionPlanCatalog = {
		free: { ...DEFAULT_PLAN_CATALOG.free },
		pro: { ...DEFAULT_PLAN_CATALOG.pro },
	};

	for (const row of rows || []) {
		if (row.id !== "free" && row.id !== "pro") continue;
		const fallback = DEFAULT_PLAN_CATALOG[row.id];
		catalog[row.id] = {
			id: row.id,
			displayName: row.display_name,
			description: row.description,
			isActive: row.is_active,
			sortOrder: row.sort_order,
			revenueCatEntitlementIdentifier: row.revenuecat_entitlement_identifier,
			revenueCatOfferingIdentifier: row.revenuecat_offering_identifier,
			capabilities: normalizeCapabilities(row.capabilities, fallback.capabilities),
		};
	}

	return catalog;
}

export const SUBSCRIPTION_PLAN_CATALOG = createSubscriptionPlanCatalog();

export const FREE_PARTICIPANT_LIMIT =
	SUBSCRIPTION_PLAN_CATALOG.free.capabilities.maxParticipants ?? Number.POSITIVE_INFINITY;
export const PARTICIPANT_WARNING_THRESHOLD =
	SUBSCRIPTION_PLAN_CATALOG.free.capabilities.participantWarningThreshold ?? FREE_PARTICIPANT_LIMIT;
export const FREE_MAX_VIDEO_DURATION_MS =
	SUBSCRIPTION_PLAN_CATALOG.free.capabilities.maxSingleVideoDurationMs;
export const PRO_MAX_VIDEO_DURATION_MS =
	SUBSCRIPTION_PLAN_CATALOG.pro.capabilities.maxSingleVideoDurationMs;
export const FREE_MAX_FILE_SIZE_BYTES =
	SUBSCRIPTION_PLAN_CATALOG.free.capabilities.maxSingleFileSizeBytes;
export const PRO_MAX_FILE_SIZE_BYTES =
	SUBSCRIPTION_PLAN_CATALOG.pro.capabilities.maxSingleFileSizeBytes;

export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
	free: {
		maxParticipants: FREE_PARTICIPANT_LIMIT,
		canUploadVideos: SUBSCRIPTION_PLAN_CATALOG.free.capabilities.canUploadVideos,
	},
	pro: {
		maxParticipants:
			SUBSCRIPTION_PLAN_CATALOG.pro.capabilities.maxParticipants ?? Number.POSITIVE_INFINITY,
		canUploadVideos: SUBSCRIPTION_PLAN_CATALOG.pro.capabilities.canUploadVideos,
	},
};

export const TIER_INFO: Record<SubscriptionTier, TierInfo> = {
	free: {
		id: "free",
		name: SUBSCRIPTION_PLAN_CATALOG.free.displayName,
		limits: TIER_LIMITS.free,
	},
	pro: {
		id: "pro",
		name: SUBSCRIPTION_PLAN_CATALOG.pro.displayName,
		limits: TIER_LIMITS.pro,
	},
};

function resolveEventCapabilities(
	hostPlanId: SubscriptionPlanLike,
	catalog: SubscriptionPlanCatalog
): SubscriptionPlanCapabilities {
	return catalog[normalizePlanId(hostPlanId)].capabilities;
}

function resolveViewerCapabilities(
	userPlanId: SubscriptionPlanLike,
	catalog: SubscriptionPlanCatalog
): SubscriptionPlanCapabilities {
	return catalog[normalizePlanId(userPlanId)].capabilities;
}

export function getSubscriptionPlan(
	planId: SubscriptionPlanLike,
	catalog: SubscriptionPlanCatalog = SUBSCRIPTION_PLAN_CATALOG
): SubscriptionPlan {
	return catalog[normalizePlanId(planId)];
}

export function getTierLimits(
	tier: SubscriptionTier,
	catalog: SubscriptionPlanCatalog = SUBSCRIPTION_PLAN_CATALOG
): TierLimits {
	if (catalog === SUBSCRIPTION_PLAN_CATALOG) {
		return TIER_LIMITS[tier];
	}
	const plan = getSubscriptionPlan(tier, catalog);
	return {
		maxParticipants: plan.capabilities.maxParticipants ?? Number.POSITIVE_INFINITY,
		canUploadVideos: plan.capabilities.canUploadVideos,
	};
}

export function getTierInfo(
	tier: SubscriptionTier,
	catalog: SubscriptionPlanCatalog = SUBSCRIPTION_PLAN_CATALOG
): TierInfo {
	if (catalog === SUBSCRIPTION_PLAN_CATALOG) {
		return TIER_INFO[tier];
	}
	const plan = getSubscriptionPlan(tier, catalog);
	return {
		id: tier,
		name: plan.displayName,
		limits: getTierLimits(tier, catalog),
	};
}

export function canUploadVideos(
	userPlanId: SubscriptionPlanLike,
	hostPlanId: SubscriptionPlanLike,
	catalog: SubscriptionPlanCatalog = SUBSCRIPTION_PLAN_CATALOG
): boolean {
	const eventCapabilities = resolveEventCapabilities(hostPlanId, catalog);
	const viewerCapabilities = resolveViewerCapabilities(userPlanId, catalog);
	return eventCapabilities.canUploadVideos || viewerCapabilities.canUploadVideos;
}

export function getMaxVideoDurationMs(
	userPlanId: SubscriptionPlanLike,
	hostPlanId: SubscriptionPlanLike,
	catalog: SubscriptionPlanCatalog = SUBSCRIPTION_PLAN_CATALOG
): number {
	const eventCapabilities = resolveEventCapabilities(hostPlanId, catalog);
	const viewerCapabilities = resolveViewerCapabilities(userPlanId, catalog);
	return Math.max(
		eventCapabilities.maxSingleVideoDurationMs,
		viewerCapabilities.maxSingleVideoDurationMs
	);
}

export function getMaxFileSizeBytes(
	userPlanId: SubscriptionPlanLike,
	hostPlanId: SubscriptionPlanLike,
	catalog: SubscriptionPlanCatalog = SUBSCRIPTION_PLAN_CATALOG
): number {
	const eventCapabilities = resolveEventCapabilities(hostPlanId, catalog);
	const viewerCapabilities = resolveViewerCapabilities(userPlanId, catalog);
	return Math.max(
		eventCapabilities.maxSingleFileSizeBytes,
		viewerCapabilities.maxSingleFileSizeBytes
	);
}

export function getParticipantLimit(
	hostPlanId: SubscriptionPlanLike,
	catalog: SubscriptionPlanCatalog = SUBSCRIPTION_PLAN_CATALOG
): number {
	return resolveEventCapabilities(hostPlanId, catalog).maxParticipants ?? Number.POSITIVE_INFINITY;
}

export function getParticipantWarningThreshold(
	hostPlanId: SubscriptionPlanLike,
	catalog: SubscriptionPlanCatalog = SUBSCRIPTION_PLAN_CATALOG
): number {
	const capabilities = resolveEventCapabilities(hostPlanId, catalog);
	return capabilities.participantWarningThreshold ?? getParticipantLimit(hostPlanId, catalog);
}

export function isAtParticipantLimit(
	count: number,
	hostPlanId: SubscriptionPlanLike,
	catalog: SubscriptionPlanCatalog = SUBSCRIPTION_PLAN_CATALOG
): boolean {
	const limit = getParticipantLimit(hostPlanId, catalog);
	if (!Number.isFinite(limit)) return false;
	return count >= limit;
}

export function shouldShowParticipantWarning(
	count: number,
	hostPlanId: SubscriptionPlanLike,
	catalog: SubscriptionPlanCatalog = SUBSCRIPTION_PLAN_CATALOG
): boolean {
	const threshold = getParticipantWarningThreshold(hostPlanId, catalog);
	if (!Number.isFinite(threshold)) return false;
	return count >= threshold;
}

export function formatFileSizeLabel(bytes: number): string {
	if (bytes <= 0) return "0 MB";
	if (bytes % BYTES_PER_GB === 0) return `${bytes / BYTES_PER_GB} GB`;
	if (bytes >= BYTES_PER_GB) return `${(bytes / BYTES_PER_GB).toFixed(1)} GB`;
	if (bytes % BYTES_PER_MB === 0) return `${bytes / BYTES_PER_MB} MB`;
	return `${Math.round(bytes / BYTES_PER_MB)} MB`;
}

export function formatVideoDurationLabel(milliseconds: number): string {
	if (milliseconds % 60_000 === 0) {
		return `${milliseconds / 60_000} min`;
	}
	if (milliseconds % 1_000 === 0) {
		return `${milliseconds / 1_000}s`;
	}
	return `${milliseconds}ms`;
}

export function getPlanMarketingHighlights(
	planId: SubscriptionPlanLike,
	catalog: SubscriptionPlanCatalog = SUBSCRIPTION_PLAN_CATALOG
): string {
	const plan = getSubscriptionPlan(planId, catalog);
	const maxParticipants =
		plan.capabilities.maxParticipants == null
			? "Unlimited participants"
			: `Up to ${plan.capabilities.maxParticipants} participants`;
	const videoLimit = `${formatVideoDurationLabel(plan.capabilities.maxSingleVideoDurationMs)} videos`;
	return `${maxParticipants} · ${videoLimit}`;
}
