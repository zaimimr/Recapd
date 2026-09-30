#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import {
	staleGuardFilter,
	subscriberUpdate,
} from "../../supabase/functions/revenuecat-webhook/mapping.ts";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REVENUECAT_SECRET_API_KEY } = process.env;
const dryRun = process.argv.includes("--dry-run");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !REVENUECAT_SECRET_API_KEY) {
	console.error(
		"Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... REVENUECAT_SECRET_API_KEY=... node scripts/billing/backfill-tiers.mjs [--dry-run]"
	);
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchSubscriber(userId) {
	const response = await fetch(
		`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
		{
			headers: { Authorization: `Bearer ${REVENUECAT_SECRET_API_KEY}`, Accept: "application/json" },
		}
	);
	if (!response.ok) {
		throw new Error(`RevenueCat returned ${response.status} for ${userId}`);
	}
	return await response.json();
}

async function loadUsers() {
	const { data, error } = await supabase
		.from("users")
		.select("id, subscription_tier, user_private_data(subscription_id)");
	if (error) throw error;
	return data.filter(
		(user) => user.subscription_tier === "pro" || user.user_private_data?.subscription_id
	);
}

async function applyUpdate(update, syncedAt) {
	const { data, error } = await supabase
		.from("users")
		.update({ subscription_tier: update.tier, subscription_synced_at: syncedAt })
		.eq("id", update.userId)
		.or(staleGuardFilter(syncedAt))
		.select("id");
	if (error) throw error;
	if (!data?.length) return false;

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

const users = await loadUsers();
console.log(`${users.length} users with a RevenueCat customer${dryRun ? " (dry run)" : ""}`);

let changed = 0;
let failed = 0;
for (const user of users) {
	try {
		const syncedAt = new Date().toISOString();
		const update = subscriberUpdate(user.id, await fetchSubscriber(user.id), Date.now());
		if (update.tier !== user.subscription_tier) {
			changed++;
			console.log(`${user.id}: ${user.subscription_tier} -> ${update.tier}`);
		}
		if (!dryRun) await applyUpdate(update, syncedAt);
	} catch (error) {
		failed++;
		console.error(`${user.id}: ${error.message}`);
	}
}

console.log(`done: ${changed} tier changes, ${failed} failures`);
process.exit(failed > 0 ? 1 : 0);
