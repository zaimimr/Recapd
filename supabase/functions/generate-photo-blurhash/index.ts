// Supabase Edge Function: generate-photo-blurhash
// Computes a compact blurhash placeholder for media_items.
// Invoked two ways:
//   1. Webhook from the media_items insert trigger (single record).
//   2. Batch backfill for existing rows (guarded by x-cron-secret).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://esm.sh/blurhash@2.0.5";
import { decode as decodeJpeg } from "https://esm.sh/jpeg-js@0.4.4";

const jsonHeaders = {
	"Content-Type": "application/json",
};
const CRON_SECRET_HEADER = "x-cron-secret";
const THUMBNAILS_BUCKET = "thumbnails";
const ORIGINALS_BUCKET = "event-photos";
const BLURHASH_COMPONENTS_X = 4;
const BLURHASH_COMPONENTS_Y = 3;

interface MediaRecord {
	id: string;
	storage_path: string;
	thumbnail_path: string | null;
	media_type: string;
	blurhash: string | null;
}

interface WebhookPayload {
	type?: string;
	table?: string;
	record?: MediaRecord;
}

function isHeic(path: string): boolean {
	return /\.(heic|heif)$/i.test(path);
}

async function fetchDecodableBytes(
	supabase: ReturnType<typeof createClient>,
	record: MediaRecord
): Promise<{ data: Uint8Array; width: number; height: number } | null> {
	if (record.thumbnail_path) {
		const { data, error } = await supabase.storage
			.from(THUMBNAILS_BUCKET)
			.createSignedUrl(record.thumbnail_path, 600);
		if (!error && data?.signedUrl) {
			const decoded = await downloadAndDecode(data.signedUrl);
			if (decoded) return decoded;
		}
	}

	if (record.media_type === "photo" && !isHeic(record.storage_path)) {
		const transform = { width: 128, height: 128, resize: "cover" as const, quality: 60 };
		const { data, error } = await supabase.storage
			.from(ORIGINALS_BUCKET)
			.createSignedUrl(record.storage_path, 600, { transform });
		if (!error && data?.signedUrl) {
			const decoded = await downloadAndDecode(data.signedUrl);
			if (decoded) return decoded;
		}
	}

	return null;
}

async function downloadAndDecode(
	url: string
): Promise<{ data: Uint8Array; width: number; height: number } | null> {
	try {
		const response = await fetch(url, { headers: { Accept: "image/jpeg" } });
		if (!response.ok) return null;
		const buffer = new Uint8Array(await response.arrayBuffer());
		const decoded = decodeJpeg(buffer, { useTArray: true });
		return { data: decoded.data, width: decoded.width, height: decoded.height };
	} catch (error) {
		console.error("Decode failed", error);
		return null;
	}
}

function computeBlurhash(pixels: { data: Uint8Array; width: number; height: number }): string {
	return encode(
		new Uint8ClampedArray(pixels.data),
		pixels.width,
		pixels.height,
		BLURHASH_COMPONENTS_X,
		BLURHASH_COMPONENTS_Y
	);
}

async function processRecord(
	supabase: ReturnType<typeof createClient>,
	record: MediaRecord
): Promise<boolean> {
	const pixels = await fetchDecodableBytes(supabase, record);
	if (!pixels) return false;
	const blurhash = computeBlurhash(pixels);
	const { error } = await supabase
		.from("media_items")
		.update({ blurhash })
		.eq("id", record.id)
		.is("blurhash", null);
	if (error) {
		throw new Error(`Failed to update media item: ${error.message}`);
	}
	return true;
}

Deno.serve(async (req) => {
	const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
	const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
	const supabase = createClient(supabaseUrl, supabaseServiceKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false,
		},
	});

	let payload: WebhookPayload = {};
	try {
		payload = (await req.json()) as WebhookPayload;
	} catch {
		payload = {};
	}

	if (payload.record?.id) {
		try {
			const handled = await processRecord(supabase, payload.record);
			return new Response(JSON.stringify({ success: true, handled }), { headers: jsonHeaders });
		} catch (error) {
			console.error("Webhook processing failed", error);
			return new Response(
				JSON.stringify({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				}),
				{ status: 500, headers: jsonHeaders }
			);
		}
	}

	const cronSecret = Deno.env.get("CRON_SECRET");
	if (!cronSecret || req.headers.get(CRON_SECRET_HEADER) !== cronSecret) {
		return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
			headers: jsonHeaders,
			status: 401,
		});
	}

	let batchSize = 25;
	if (typeof (payload as { batchSize?: number }).batchSize === "number") {
		batchSize = Math.min((payload as { batchSize: number }).batchSize, 100);
	}

	const results = {
		processed: 0,
		succeeded: 0,
		skipped: 0,
		failed: 0,
		errors: [] as string[],
	};

	try {
		const { data: rows, error: fetchError } = await supabase
			.from("media_items")
			.select("id, storage_path, thumbnail_path, media_type, blurhash")
			.is("blurhash", null)
			.is("deleted_at", null)
			.limit(batchSize);

		if (fetchError) {
			throw new Error(`Failed to fetch media items: ${fetchError.message}`);
		}

		for (const record of (rows ?? []) as MediaRecord[]) {
			results.processed++;
			try {
				const handled = await processRecord(supabase, record);
				if (handled) {
					results.succeeded++;
				} else {
					results.skipped++;
				}
			} catch (error) {
				results.failed++;
				results.errors.push(
					`${record.id}: ${error instanceof Error ? error.message : "Unknown error"}`
				);
			}
		}

		return new Response(
			JSON.stringify({ success: true, message: `Processed ${results.processed} rows`, results }),
			{ headers: jsonHeaders }
		);
	} catch (error) {
		console.error("Backfill failed", error);
		return new Response(JSON.stringify({ success: false, error: "Internal server error" }), {
			status: 500,
			headers: jsonHeaders,
		});
	}
});
