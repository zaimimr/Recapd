import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
	affectedUserIds,
	eventSyncedAt,
	isAuthorized,
	planTierUpdates,
	staleGuardFilter,
	subscriberUpdate,
	type TierUpdate,
} from "./mapping.ts";

const jsonHeaders = { "Content-Type": "application/json" };

type SyncedUpdate = TierUpdate & { syncedAt: string };

function json(body: Record<string, unknown>, status: number) {
	return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function getServiceSupabase() {
	return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
}

async function fetchSubscriber(userId: string, apiKey: string): Promise<unknown> {
	const response = await fetch(
		`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
		{ headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } }
	);
	if (!response.ok) {
		throw new Error(`RevenueCat subscriber fetch failed with ${response.status}`);
	}
	return await response.json();
}

async function planUpdates(event: unknown): Promise<SyncedUpdate[]> {
	const apiKey = Deno.env.get("REVENUECAT_SECRET_API_KEY");
	if (!apiKey) {
		const syncedAt = eventSyncedAt(event, Date.now());
		return planTierUpdates(event, Date.now()).map((update) => ({ ...update, syncedAt }));
	}

	const syncedAt = new Date().toISOString();
	const updates: SyncedUpdate[] = [];
	for (const userId of affectedUserIds(event)) {
		const body = await fetchSubscriber(userId, apiKey);
		updates.push({ ...subscriberUpdate(userId, body, Date.now()), syncedAt });
	}
	return updates;
}

async function applyUpdate(
	supabase: ReturnType<typeof getServiceSupabase>,
	update: SyncedUpdate
): Promise<boolean> {
	const { data, error } = await supabase
		.from("users")
		.update({ subscription_tier: update.tier, subscription_synced_at: update.syncedAt })
		.eq("id", update.userId)
		.or(staleGuardFilter(update.syncedAt))
		.select("id");
	if (error) throw error;
	if (!data || data.length === 0) return false;

	const { error: privateError } = await supabase.from("user_private_data").upsert(
		{
			user_id: update.userId,
			subscription_expires_at: update.expiresAt,
			subscription_platform: update.platform,
		},
		{ onConflict: "user_id" }
	);
	if (privateError) throw privateError;
	return true;
}

Deno.serve(async (req: Request) => {
	if (req.method !== "POST") {
		return json({ error: "Method not allowed" }, 405);
	}

	if (!isAuthorized(req.headers.get("Authorization"), Deno.env.get("REVENUECAT_WEBHOOK_SECRET"))) {
		return json({ error: "Unauthorized" }, 401);
	}

	let payload: unknown;
	try {
		payload = await req.json();
	} catch {
		return json({ error: "Invalid JSON" }, 400);
	}

	const event =
		payload && typeof payload === "object" ? (payload as Record<string, unknown>).event : null;
	if (!event || typeof event !== "object") {
		return json({ error: "Missing event" }, 400);
	}

	const eventType = String((event as Record<string, unknown>).type ?? "");
	try {
		const updates = await planUpdates(event);
		if (updates.length === 0) {
			console.log(JSON.stringify({ eventType, applied: 0 }));
			return json({ ok: true, applied: 0 }, 200);
		}

		const supabase = getServiceSupabase();
		const results = [];
		for (const update of updates) {
			const applied = await applyUpdate(supabase, update);
			results.push({ userId: update.userId, tier: update.tier, applied });
		}
		console.log(JSON.stringify({ eventType, results }));
		return json({ ok: true, applied: results.filter((r) => r.applied).length }, 200);
	} catch (error) {
		console.error(JSON.stringify({ eventType, error: String((error as Error)?.message ?? error) }));
		return json({ error: "Sync failed" }, 500);
	}
});
