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

const RELEVANT_TYPES = new Set([
	...GRANT_TYPES,
	"EXPIRATION",
	"CANCELLATION",
	"BILLING_ISSUE",
	"SUBSCRIPTION_PAUSED",
	"TRANSFER",
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

const PLATFORM_BY_STORE: Record<string, string> = {
	APP_STORE: "ios",
	MAC_APP_STORE: "ios",
	PLAY_STORE: "android",
	STRIPE: "web",
	RC_BILLING: "web",
	PADDLE: "web",
};

function platformFromStore(store: unknown): string | null {
	if (typeof store !== "string") return null;
	return PLATFORM_BY_STORE[store.toUpperCase()] ?? null;
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

function asRecord(value: unknown): RawEvent {
	return value && typeof value === "object" ? (value as RawEvent) : {};
}

function dateMsOrNull(value: unknown): number | null {
	if (typeof value !== "string") return null;
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : ms;
}

export function affectedUserIds(input: unknown): string[] {
	const event = asRecord(input);
	const type = typeof event.type === "string" ? event.type : "";
	if (!RELEVANT_TYPES.has(type)) return [];
	if (type === "TRANSFER") {
		const ids = [...stringList(event.transferred_from), ...stringList(event.transferred_to)];
		return [...new Set(ids.filter(isUserId))];
	}
	const userId = resolveUserId(event);
	return userId ? [userId] : [];
}

function storeForProduct(subscriber: RawEvent, productId: unknown): unknown {
	if (typeof productId !== "string") return null;
	const subscriptions = asRecord(subscriber.subscriptions);
	const key = Object.keys(subscriptions).find(
		(candidate) => candidate === productId || candidate.startsWith(`${productId}:`)
	);
	if (key) return asRecord(subscriptions[key]).store;
	const purchases = asRecord(subscriber.non_subscriptions)[productId];
	return Array.isArray(purchases) && purchases.length > 0
		? asRecord(purchases[purchases.length - 1]).store
		: null;
}

export function subscriberUpdate(userId: string, body: unknown, nowMs: number): TierUpdate {
	const subscriber = asRecord(asRecord(body).subscriber);
	const entitlements = asRecord(subscriber.entitlements);
	if (!(PRO_ENTITLEMENT in entitlements)) {
		return freeUpdate(userId, null);
	}
	const entitlement = asRecord(entitlements[PRO_ENTITLEMENT]);
	const expiresMs = dateMsOrNull(entitlement.expires_date);
	const graceMs = dateMsOrNull(entitlement.grace_period_expires_date);
	const isActive =
		entitlement.expires_date == null ||
		(expiresMs !== null && expiresMs > nowMs) ||
		(graceMs !== null && graceMs > nowMs);
	if (!isActive) {
		return freeUpdate(userId, expiresMs);
	}
	return {
		userId,
		tier: "pro",
		expiresAt: toIso(expiresMs),
		platform: platformFromStore(storeForProduct(subscriber, entitlement.product_identifier)),
	};
}

export function eventSyncedAt(input: unknown, nowMs: number): string {
	return new Date(numberOrNull(asRecord(input).event_timestamp_ms) ?? nowMs).toISOString();
}

export function staleGuardFilter(syncedAt: string): string {
	return `subscription_synced_at.is.null,subscription_synced_at.lte."${syncedAt}"`;
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
