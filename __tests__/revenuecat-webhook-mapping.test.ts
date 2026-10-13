import {
	affectedUserIds,
	eventSyncedAt,
	isAuthorized,
	PRO_ENTITLEMENT,
	planTierUpdates,
	staleGuardFilter,
	subscriberUpdate,
} from "@/supabase/functions/revenuecat-webhook/mapping";

const USER = "7d1f2c3a-4b5e-4f60-8a71-92b3c4d5e6f7";
const OTHER = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const NOW = Date.parse("2026-10-01T12:00:00Z");
const FUTURE = NOW + 30 * 24 * 60 * 60 * 1000;
const PAST = NOW - 60 * 1000;

function event(overrides: Record<string, unknown>) {
	return {
		type: "INITIAL_PURCHASE",
		app_user_id: USER,
		entitlement_ids: [PRO_ENTITLEMENT],
		expiration_at_ms: FUTURE,
		store: "APP_STORE",
		...overrides,
	};
}

describe("planTierUpdates", () => {
	it.each([
		"INITIAL_PURCHASE",
		"RENEWAL",
		"UNCANCELLATION",
		"PRODUCT_CHANGE",
		"SUBSCRIPTION_EXTENDED",
		"NON_RENEWING_PURCHASE",
		"TEMPORARY_ENTITLEMENT_GRANT",
		"REFUND_REVERSED",
	])("grants pro for %s with an active Pro entitlement", (type) => {
		expect(planTierUpdates(event({ type }), NOW)).toEqual([
			{
				userId: USER,
				tier: "pro",
				expiresAt: new Date(FUTURE).toISOString(),
				platform: "ios",
			},
		]);
	});

	it("grants pro when expiration is null", () => {
		expect(planTierUpdates(event({ expiration_at_ms: null, store: "PLAY_STORE" }), NOW)).toEqual([
			{ userId: USER, tier: "pro", expiresAt: null, platform: "android" },
		]);
	});

	it("ignores grant events that do not include the Pro entitlement", () => {
		expect(
			planTierUpdates(event({ type: "NON_RENEWING_PURCHASE", entitlement_ids: [] }), NOW)
		).toEqual([]);
		expect(planTierUpdates(event({ entitlement_ids: null }), NOW)).toEqual([]);
	});

	it("ignores grant events whose expiration already passed", () => {
		expect(planTierUpdates(event({ type: "RENEWAL", expiration_at_ms: PAST }), NOW)).toEqual([]);
	});

	it("keeps pro on CANCELLATION until expiration", () => {
		expect(planTierUpdates(event({ type: "CANCELLATION" }), NOW)).toEqual([]);
	});

	it("drops to free on a CANCELLATION that already expired, like a refund", () => {
		expect(
			planTierUpdates(
				event({ type: "CANCELLATION", expiration_at_ms: PAST, cancel_reason: "CUSTOMER_SUPPORT" }),
				NOW
			)
		).toEqual([
			{ userId: USER, tier: "free", expiresAt: new Date(PAST).toISOString(), platform: null },
		]);
	});

	it("drops to free on EXPIRATION", () => {
		expect(planTierUpdates(event({ type: "EXPIRATION", expiration_at_ms: PAST }), NOW)).toEqual([
			{ userId: USER, tier: "free", expiresAt: new Date(PAST).toISOString(), platform: null },
		]);
	});

	it("ignores EXPIRATION of a different entitlement", () => {
		expect(
			planTierUpdates(
				event({ type: "EXPIRATION", entitlement_ids: ["Other"], expiration_at_ms: PAST }),
				NOW
			)
		).toEqual([]);
	});

	it("keeps pro on BILLING_ISSUE while in grace period", () => {
		expect(
			planTierUpdates(
				event({
					type: "BILLING_ISSUE",
					expiration_at_ms: PAST,
					grace_period_expiration_at_ms: FUTURE,
				}),
				NOW
			)
		).toEqual([]);
	});

	it("drops to free on BILLING_ISSUE after grace ends", () => {
		expect(
			planTierUpdates(
				event({
					type: "BILLING_ISSUE",
					expiration_at_ms: PAST,
					grace_period_expiration_at_ms: PAST,
				}),
				NOW
			)
		).toEqual([
			{ userId: USER, tier: "free", expiresAt: new Date(PAST).toISOString(), platform: null },
		]);
	});

	it("keeps pro on BILLING_ISSUE when the subscription has not expired", () => {
		expect(planTierUpdates(event({ type: "BILLING_ISSUE" }), NOW)).toEqual([]);
	});

	it("moves pro on TRANSFER from the old user to the new user", () => {
		expect(
			planTierUpdates(
				{
					type: "TRANSFER",
					transferred_from: [OTHER, "$RCAnonymousID:abc"],
					transferred_to: [USER],
					entitlement_ids: [PRO_ENTITLEMENT],
					expiration_at_ms: FUTURE,
					store: "APP_STORE",
				},
				NOW
			)
		).toEqual([
			{ userId: OTHER, tier: "free", expiresAt: null, platform: null },
			{ userId: USER, tier: "pro", expiresAt: new Date(FUTURE).toISOString(), platform: "ios" },
		]);
	});

	it("only frees the old user on TRANSFER without entitlement data", () => {
		expect(
			planTierUpdates({ type: "TRANSFER", transferred_from: [OTHER], transferred_to: [USER] }, NOW)
		).toEqual([{ userId: OTHER, tier: "free", expiresAt: null, platform: null }]);
	});

	it("ignores anonymous RevenueCat ids", () => {
		expect(planTierUpdates(event({ app_user_id: "$RCAnonymousID:abc123" }), NOW)).toEqual([]);
	});

	it("falls back to a non-anonymous alias", () => {
		expect(
			planTierUpdates(
				event({ app_user_id: "$RCAnonymousID:abc123", aliases: ["$RCAnonymousID:abc123", USER] }),
				NOW
			)
		).toEqual([
			{
				userId: USER,
				tier: "pro",
				expiresAt: new Date(FUTURE).toISOString(),
				platform: "ios",
			},
		]);
	});

	it("ignores ids that are not user uuids", () => {
		expect(planTierUpdates(event({ app_user_id: "not-a-uuid" }), NOW)).toEqual([]);
	});

	it.each([
		"TEST",
		"SUBSCRIPTION_PAUSED",
		"INVOICE_ISSUANCE",
		"VIRTUAL_CURRENCY_TRANSACTION",
	])("ignores %s", (type) => {
		expect(planTierUpdates(event({ type }), NOW)).toEqual([]);
	});

	it("ignores malformed input", () => {
		expect(planTierUpdates(null, NOW)).toEqual([]);
		expect(planTierUpdates("x", NOW)).toEqual([]);
		expect(planTierUpdates({}, NOW)).toEqual([]);
	});
});

describe("isAuthorized", () => {
	it("accepts the exact bearer secret", () => {
		expect(isAuthorized("Bearer s3cret-value", "s3cret-value")).toBe(true);
	});

	it("rejects a wrong, missing or empty secret", () => {
		expect(isAuthorized("Bearer s3cret-valuf", "s3cret-value")).toBe(false);
		expect(isAuthorized("Bearer s3cret", "s3cret-value")).toBe(false);
		expect(isAuthorized("s3cret-value", "s3cret-value")).toBe(false);
		expect(isAuthorized(null, "s3cret-value")).toBe(false);
		expect(isAuthorized("Bearer ", "")).toBe(false);
		expect(isAuthorized("Bearer x", undefined)).toBe(false);
	});
});

describe("subscriberUpdate", () => {
	function subscriber(entitlements: Record<string, unknown>, extra: Record<string, unknown> = {}) {
		return { request_date_ms: NOW, subscriber: { entitlements, ...extra } };
	}

	it("is pro when the Pro entitlement expires in the future", () => {
		expect(
			subscriberUpdate(
				USER,
				subscriber(
					{
						[PRO_ENTITLEMENT]: {
							expires_date: new Date(FUTURE).toISOString(),
							product_identifier: "recapd_pro_yearly",
						},
					},
					{ subscriptions: { recapd_pro_yearly: { store: "app_store" } } }
				),
				NOW
			)
		).toEqual({
			userId: USER,
			tier: "pro",
			expiresAt: new Date(FUTURE).toISOString(),
			platform: "ios",
		});
	});

	it("is pro for a lifetime entitlement without expiry", () => {
		expect(
			subscriberUpdate(
				USER,
				subscriber(
					{ [PRO_ENTITLEMENT]: { expires_date: null, product_identifier: "lifetime" } },
					{ non_subscriptions: { lifetime: [{ store: "play_store" }] } }
				),
				NOW
			)
		).toEqual({ userId: USER, tier: "pro", expiresAt: null, platform: "android" });
	});

	it("matches a Play base plan subscription key", () => {
		expect(
			subscriberUpdate(
				USER,
				subscriber(
					{
						[PRO_ENTITLEMENT]: {
							expires_date: new Date(FUTURE).toISOString(),
							product_identifier: "recapd_pro_monthly",
						},
					},
					{ subscriptions: { "recapd_pro_monthly:monthly": { store: "play_store" } } }
				),
				NOW
			).platform
		).toBe("android");
	});

	it("is pro during a grace period", () => {
		expect(
			subscriberUpdate(
				USER,
				subscriber({
					[PRO_ENTITLEMENT]: {
						expires_date: new Date(PAST).toISOString(),
						grace_period_expires_date: new Date(FUTURE).toISOString(),
					},
				}),
				NOW
			).tier
		).toBe("pro");
	});

	it("is free when the Pro entitlement expired", () => {
		expect(
			subscriberUpdate(
				USER,
				subscriber({ [PRO_ENTITLEMENT]: { expires_date: new Date(PAST).toISOString() } }),
				NOW
			)
		).toEqual({
			userId: USER,
			tier: "free",
			expiresAt: new Date(PAST).toISOString(),
			platform: null,
		});
	});

	it("is free without the Pro entitlement or with a malformed body", () => {
		const free = { userId: USER, tier: "free", expiresAt: null, platform: null };
		expect(subscriberUpdate(USER, subscriber({ Other: { expires_date: null } }), NOW)).toEqual(
			free
		);
		expect(subscriberUpdate(USER, {}, NOW)).toEqual(free);
		expect(subscriberUpdate(USER, null, NOW)).toEqual(free);
	});

	it("gives a null platform for stores the column does not accept", () => {
		expect(
			subscriberUpdate(
				USER,
				subscriber(
					{ [PRO_ENTITLEMENT]: { expires_date: null, product_identifier: "promo" } },
					{ subscriptions: { promo: { store: "promotional" } } }
				),
				NOW
			).platform
		).toBeNull();
	});
});

describe("affectedUserIds", () => {
	it("returns every user id on both sides of a TRANSFER", () => {
		expect(
			affectedUserIds({
				type: "TRANSFER",
				transferred_from: [OTHER, "$RCAnonymousID:abc"],
				transferred_to: [USER],
			})
		).toEqual([OTHER, USER]);
	});

	it("returns the resolved user for relevant events regardless of entitlement", () => {
		expect(affectedUserIds(event({ type: "EXPIRATION", entitlement_ids: [] }))).toEqual([USER]);
		expect(affectedUserIds(event({ type: "SUBSCRIPTION_PAUSED" }))).toEqual([USER]);
	});

	it("returns nothing for irrelevant or anonymous events", () => {
		expect(affectedUserIds(event({ type: "TEST" }))).toEqual([]);
		expect(affectedUserIds(event({ app_user_id: "$RCAnonymousID:x" }))).toEqual([]);
		expect(affectedUserIds(null)).toEqual([]);
	});
});

describe("platform mapping", () => {
	it("gives a null platform for payload stores the column does not accept", () => {
		expect(planTierUpdates(event({ store: "PROMOTIONAL" }), NOW)[0].platform).toBeNull();
		expect(planTierUpdates(event({ store: "AMAZON" }), NOW)[0].platform).toBeNull();
		expect(planTierUpdates(event({ store: "STRIPE" }), NOW)[0].platform).toBe("web");
	});
});

describe("stale event guard", () => {
	it("uses the event timestamp when present", () => {
		expect(eventSyncedAt({ event_timestamp_ms: PAST }, NOW)).toBe(new Date(PAST).toISOString());
	});

	it("falls back to now without an event timestamp", () => {
		expect(eventSyncedAt({}, NOW)).toBe(new Date(NOW).toISOString());
	});

	it("only lets a write through when the stored sync is missing or not newer", () => {
		expect(staleGuardFilter("2026-10-01T12:00:00.000Z")).toBe(
			'subscription_synced_at.is.null,subscription_synced_at.lte."2026-10-01T12:00:00.000Z"'
		);
	});
});
