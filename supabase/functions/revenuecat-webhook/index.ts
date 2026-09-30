import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAuthorized, planTierUpdates, type TierUpdate } from "./mapping.ts";

const jsonHeaders = { "Content-Type": "application/json" };

function json(body: Record<string, unknown>, status: number) {
	return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function getServiceSupabase() {
	return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
}

async function applyUpdate(
	supabase: ReturnType<typeof getServiceSupabase>,
	update: TierUpdate
): Promise<boolean> {
	const { data, error } = await supabase
		.from("users")
		.update({ subscription_tier: update.tier })
		.eq("id", update.userId)
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
	const updates = planTierUpdates(event, Date.now());
	if (updates.length === 0) {
		console.log(JSON.stringify({ eventType, applied: 0 }));
		return json({ ok: true, applied: 0 }, 200);
	}

	const supabase = getServiceSupabase();
	try {
		const results = [];
		for (const update of updates) {
			const found = await applyUpdate(supabase, update);
			results.push({ userId: update.userId, tier: update.tier, found });
		}
		console.log(JSON.stringify({ eventType, results }));
		return json({ ok: true, applied: results.filter((r) => r.found).length }, 200);
	} catch (error) {
		console.error(JSON.stringify({ eventType, error: String((error as Error)?.message ?? error) }));
		return json({ error: "Update failed" }, 500);
	}
});
