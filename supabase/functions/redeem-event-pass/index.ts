import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = {
	"Content-Type": "application/json",
};

const EVENT_PASS_PRODUCT_IDS = ["recapd_event_pass", "event_pass"];
const EVENT_PASS_RETENTION_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

interface RequestBody {
	event_id?: string;
}

interface NonSubscriptionPurchase {
	id?: string;
	purchase_date?: string;
}

function getServiceSupabase() {
	return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
}

function getCallerSupabase(authHeader: string) {
	return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
		global: { headers: { Authorization: authHeader } },
		auth: { autoRefreshToken: false, persistSession: false },
	});
}

function jsonResponse(status: number, body: Record<string, unknown>) {
	return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

async function fetchEventPassTransactionIds(userId: string, apiKey: string): Promise<string[]> {
	const response = await fetch(
		`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
		{ headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" } }
	);
	if (!response.ok) {
		throw new Error(`RevenueCat subscriber fetch failed with ${response.status}`);
	}
	const body = await response.json();
	const nonSubscriptions: Record<string, NonSubscriptionPurchase[]> =
		body?.subscriber?.non_subscriptions ?? {};

	return EVENT_PASS_PRODUCT_IDS.flatMap((productId) => nonSubscriptions[productId] ?? [])
		.sort((a, b) => (a.purchase_date ?? "").localeCompare(b.purchase_date ?? ""))
		.map((purchase) => purchase.id)
		.filter((id): id is string => typeof id === "string" && id.length > 0);
}

Deno.serve(async (req) => {
	if (req.method !== "POST") {
		return jsonResponse(405, { success: false, error: "Method not allowed" });
	}

	const authHeader = req.headers.get("Authorization");
	if (!authHeader) {
		return jsonResponse(401, { success: false, error: "Missing Authorization header" });
	}

	let body: RequestBody;
	try {
		body = await req.json();
	} catch {
		return jsonResponse(400, { success: false, error: "Invalid JSON body" });
	}

	const eventId = body.event_id;
	if (!eventId || typeof eventId !== "string") {
		return jsonResponse(400, { success: false, error: "event_id is required" });
	}

	const apiKey = Deno.env.get("REVENUECAT_SECRET_API_KEY");
	if (!apiKey) {
		return jsonResponse(500, { success: false, error: "Billing is not configured" });
	}

	try {
		const {
			data: { user },
			error: userError,
		} = await getCallerSupabase(authHeader).auth.getUser();

		if (userError || !user) {
			return jsonResponse(401, { success: false, error: "Invalid token" });
		}

		const service = getServiceSupabase();

		const { data: callerProfile, error: profileError } = await service
			.from("users")
			.select("id")
			.eq("auth_user_id", user.id)
			.maybeSingle();

		if (profileError || !callerProfile) {
			return jsonResponse(403, { success: false, error: "Profile not found" });
		}

		const { data: event, error: eventError } = await service
			.from("events")
			.select("id, status, ends_at, expires_at, event_pass_at")
			.eq("id", eventId)
			.maybeSingle();

		if (eventError || !event) {
			return jsonResponse(404, { success: false, error: "Event not found" });
		}

		if (event.event_pass_at) {
			return jsonResponse(200, { success: true, already_active: true });
		}

		if (event.status === "expired" || new Date(event.expires_at).getTime() < Date.now()) {
			return jsonResponse(409, {
				success: false,
				code: "event_inactive",
				error: "Event is no longer active",
			});
		}

		const { data: hostParticipant, error: hostError } = await service
			.from("event_participants")
			.select("id")
			.eq("event_id", eventId)
			.eq("user_id", callerProfile.id)
			.eq("role", "host")
			.maybeSingle();

		if (hostError || !hostParticipant) {
			return jsonResponse(403, {
				success: false,
				code: "not_host",
				error: "Only the event host can activate an Event Pass",
			});
		}

		const transactionIds = await fetchEventPassTransactionIds(callerProfile.id, apiKey);
		if (transactionIds.length === 0) {
			return jsonResponse(402, {
				success: false,
				code: "no_purchase",
				error: "No Event Pass purchase found",
			});
		}

		const { data: usedRows, error: usedError } = await service
			.from("events")
			.select("event_pass_transaction_id")
			.in("event_pass_transaction_id", transactionIds);

		if (usedError) {
			throw new Error(`Failed to check used passes: ${usedError.message}`);
		}

		const used = new Set((usedRows ?? []).map((row) => row.event_pass_transaction_id));
		const transactionId = transactionIds.find((id) => !used.has(id));
		if (!transactionId) {
			return jsonResponse(402, {
				success: false,
				code: "no_unused_purchase",
				error: "Every Event Pass purchase is already used",
			});
		}

		const retentionEnd = new Date(event.ends_at).getTime() + EVENT_PASS_RETENTION_DAYS * DAY_MS;
		const newExpiresAt = new Date(
			Math.max(new Date(event.expires_at).getTime(), retentionEnd)
		).toISOString();

		const { data: updated, error: updateError } = await service
			.from("events")
			.update({
				event_pass_at: new Date().toISOString(),
				event_pass_transaction_id: transactionId,
				expires_at: newExpiresAt,
			})
			.eq("id", eventId)
			.is("event_pass_at", null)
			.select("id");

		if (updateError) {
			throw new Error(`Failed to activate Event Pass: ${updateError.message}`);
		}

		return jsonResponse(200, {
			success: true,
			already_active: (updated ?? []).length === 0,
			expires_at: newExpiresAt,
		});
	} catch (error) {
		console.error("redeem-event-pass error", error);
		return jsonResponse(500, { success: false, error: "Internal server error" });
	}
});
