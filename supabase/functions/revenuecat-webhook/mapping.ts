export const PRO_ENTITLEMENT = "Recapd Pro";

export type Tier = "pro" | "free";

export interface TierUpdate {
	userId: string;
	tier: Tier;
	expiresAt: string | null;
	platform: string | null;
}

const GRANT_TYPES = new Set([
	"INITIAL_PURCHASE",
	"RENEWAL",
	"UNCANCELLATION",
	"PRODUCT_CHANGE",
	"SUBSCRIPTION_EXTENDED",
	"NON_RENEWING_PURCHASE",
	"TEMPORARY_ENTITLEMENT_GRANT",
	"REFUND_REVERSED",
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RawEvent = Record<string, unknown>;

function isUserId(value: unknown): value is string {
	return typeof value === "string" && UUID_PATTERN.test(value);
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function numberOrNull(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toIso(ms: number | null): string | null {
	return ms === null ? null : new Date(ms).toISOString();
}

function platformFromStore(store: unknown): string | null {
	if (typeof store !== "string" || store.length === 0) return null;
	if (store === "APP_STORE" || store === "MAC_APP_STORE") return "ios";
	if (store === "PLAY_STORE") return "android";
	return store.toLowerCase();
}

function includesPro(event: RawEvent): boolean {
	return (
		stringList(event.entitlement_ids).includes(PRO_ENTITLEMENT) ||
		event.entitlement_id === PRO_ENTITLEMENT
	);
}

function resolveUserId(event: RawEvent): string | null {
	const candidates = [event.app_user_id, event.original_app_user_id, ...stringList(event.aliases)];
	return candidates.find(isUserId) ?? null;
}

function proUpdate(userId: string, event: RawEvent, expirationMs: number | null): TierUpdate {
	return {
		userId,
		tier: "pro",
		expiresAt: toIso(expirationMs),
		platform: platformFromStore(event.store),
	};
}

function freeUpdate(userId: string, expirationMs: number | null): TierUpdate {
	return { userId, tier: "free", expiresAt: toIso(expirationMs), platform: null };
}

export function planTierUpdates(input: unknown, nowMs: number): TierUpdate[] {
	if (!input || typeof input !== "object") return [];
	const event = input as RawEvent;
	const type = typeof event.type === "string" ? event.type : "";
	const expirationMs = numberOrNull(event.expiration_at_ms);
	const isActive = expirationMs === null || expirationMs > nowMs;

	if (type === "TRANSFER") {
		const updates = stringList(event.transferred_from)
			.filter(isUserId)
			.map((userId) => freeUpdate(userId, null));
		if (includesPro(event) && isActive) {
			for (const userId of stringList(event.transferred_to).filter(isUserId)) {
				updates.push(proUpdate(userId, event, expirationMs));
			}
		}
		return updates;
	}

	const userId = resolveUserId(event);
	if (!userId || !includesPro(event)) return [];

	if (GRANT_TYPES.has(type)) {
		return isActive ? [proUpdate(userId, event, expirationMs)] : [];
	}

	if (type === "EXPIRATION") {
		return [freeUpdate(userId, expirationMs)];
	}

	if (type === "CANCELLATION") {
		return isActive ? [] : [freeUpdate(userId, expirationMs)];
	}

	if (type === "BILLING_ISSUE") {
		const graceMs = numberOrNull(event.grace_period_expiration_at_ms);
		const inGrace = graceMs !== null && graceMs > nowMs;
		return isActive || inGrace ? [] : [freeUpdate(userId, expirationMs)];
	}

	return [];
}

export function isAuthorized(header: string | null, secret: string | undefined): boolean {
	if (!secret || !header) return false;
	const encoder = new TextEncoder();
	const expected = encoder.encode(`Bearer ${secret}`);
	const actual = encoder.encode(header);
	let diff = expected.length ^ actual.length;
	for (let i = 0; i < expected.length; i++) {
		diff |= expected[i] ^ (actual[i] ?? 0);
	}
	return diff === 0;
}
