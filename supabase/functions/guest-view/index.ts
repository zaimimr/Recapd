import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { IMAGE_TOKEN_TTL_MS, type ImageKind, signImageToken, verifyImageToken } from "./token.ts";

const SIGNED_URL_TTL_SECONDS = 60 * 60;
const MAX_ITEMS = 2000;
const SIGN_CONCURRENCY = 12;
const THUMB_TRANSFORM = { width: 400, height: 400, resize: "cover" as const, quality: 60 };
const DISPLAY_TRANSFORM = { width: 1600, height: 1600, resize: "contain" as const, quality: 80 };

const ALLOWED_ORIGINS = new Set(["https://recapd.app", "https://www.recapd.app"]);
const PREVIEW_ORIGIN = /^https:\/\/recapd(-[a-z0-9-]+)?\.vercel\.app$/;
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

type MediaRow = {
	id: string;
	media_type: "photo" | "video";
	width: number | null;
	height: number | null;
	duration_milliseconds: number | null;
	captured_at: string;
	storage_path: string;
	thumbnail_path: string | null;
	uploader: { display_name: string } | null;
};

function corsHeaders(origin: string | null): Record<string, string> {
	const allowed =
		origin &&
		(ALLOWED_ORIGINS.has(origin) || PREVIEW_ORIGIN.test(origin) || LOCAL_ORIGIN.test(origin));
	return {
		"Access-Control-Allow-Origin": allowed ? origin : "https://recapd.app",
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
		Vary: "Origin",
	};
}

function json(body: unknown, status: number, origin: string | null) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			...corsHeaders(origin),
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
		},
	});
}

function serviceClient(): SupabaseClient {
	return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
}

async function serveImage(token: string | null, origin: string | null): Promise<Response> {
	const secret = Deno.env.get("GUEST_VIEW_IMAGE_SECRET");
	if (!secret) return json({ error: "server_error" }, 500, origin);
	const claims = await verifyImageToken(token, secret, Date.now());
	if (!claims) return json({ error: "unauthorized" }, 401, origin);
	const supabase = serviceClient();
	const { data: item } = await supabase
		.from("media_items")
		.select(
			"storage_path, thumbnail_path, media_type, visibility, deleted_at, event:events(expires_at)"
		)
		.eq("id", claims.i)
		.maybeSingle();
	if (
		!item ||
		item.media_type !== "photo" ||
		item.visibility !== "shared" ||
		item.deleted_at ||
		isHeic(item.storage_path) ||
		isExpired((item.event as { expires_at: string | null } | null)?.expires_at ?? null)
	) {
		return json({ error: "not_found" }, 404, origin);
	}
	const transform = claims.k === "d" ? DISPLAY_TRANSFORM : THUMB_TRANSFORM;
	let { data } = await supabase.storage
		.from("event-photos")
		.download(item.storage_path, { transform });
	if (!data && item.thumbnail_path) {
		({ data } = await supabase.storage.from("thumbnails").download(item.thumbnail_path));
	}
	if (!data) return json({ error: "not_found" }, 404, origin);
	return new Response(data, {
		status: 200,
		headers: {
			...corsHeaders(origin),
			"Content-Type": data.type || "image/jpeg",
			"Cache-Control": "private, max-age=600",
			"X-Content-Type-Options": "nosniff",
		},
	});
}

function normalizeCode(raw: unknown): string | null {
	if (typeof raw !== "string" || !/^[A-Za-z0-9\s-]*$/.test(raw)) return null;
	const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
	return code.length === 6 ? code : null;
}

function isExpired(expiresAt: string | null): boolean {
	return Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());
}

function isHeic(path: string | null): boolean {
	return Boolean(path && /\.(heic|heif)$/i.test(path));
}

async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const index = next++;
			results[index] = await fn(items[index]);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}

Deno.serve(async (req) => {
	const origin = req.headers.get("Origin");
	if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
	const requestUrl = new URL(req.url);
	if (req.method === "GET" && requestUrl.pathname.endsWith("/image")) {
		return serveImage(requestUrl.searchParams.get("t"), origin);
	}
	if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

	let body: { code?: unknown };
	try {
		body = await req.json();
	} catch {
		return json({ error: "invalid_body" }, 400, origin);
	}
	const code = normalizeCode(body?.code);
	if (!code) return json({ error: "not_found" }, 404, origin);

	const secret = Deno.env.get("GUEST_VIEW_IMAGE_SECRET");
	if (!secret) return json({ error: "server_error" }, 500, origin);
	const supabase = serviceClient();

	const { data: event, error: eventError } = await supabase
		.from("events")
		.select("id, title, starts_at, ends_at, timezone, expires_at")
		.eq("join_code", code)
		.maybeSingle();
	if (eventError) return json({ error: "server_error" }, 500, origin);
	if (!event || isExpired(event.expires_at)) {
		return json({ error: "not_found" }, 404, origin);
	}

	const [{ data: rows, error: mediaError }, { count: participantCount }] = await Promise.all([
		supabase
			.from("media_items")
			.select(
				"id, media_type, width, height, duration_milliseconds, captured_at, storage_path, thumbnail_path, uploader:users!uploaded_by_user_id(display_name)"
			)
			.eq("event_id", event.id)
			.eq("visibility", "shared")
			.is("deleted_at", null)
			.order("captured_at", { ascending: false })
			.order("id", { ascending: true })
			.limit(MAX_ITEMS),
		supabase
			.from("event_participants")
			.select("id", { count: "exact", head: true })
			.eq("event_id", event.id),
	]);
	if (mediaError) return json({ error: "server_error" }, 500, origin);
	const media = (rows ?? []) as unknown as MediaRow[];

	const thumbPaths = [
		...new Set(media.flatMap((row) => (row.thumbnail_path ? [row.thumbnail_path] : []))),
	];
	const thumbnailUrls = new Map<string, string>();
	if (thumbPaths.length > 0) {
		const { data } = await supabase.storage
			.from("thumbnails")
			.createSignedUrls(thumbPaths, SIGNED_URL_TTL_SECONDS);
		for (const entry of data ?? []) {
			if (entry.path && entry.signedUrl) thumbnailUrls.set(entry.path, entry.signedUrl);
		}
	}

	const imageBase = `${Deno.env.get("SUPABASE_URL")}/functions/v1/guest-view/image?t=`;
	const expiresAt = Date.now() + IMAGE_TOKEN_TTL_MS;
	const proxyUrl = async (row: MediaRow, kind: ImageKind): Promise<string> => {
		const token = await signImageToken({ i: row.id, k: kind, e: expiresAt }, secret);
		return imageBase + token;
	};

	const items = await mapWithConcurrency(media, SIGN_CONCURRENCY, async (row) => {
		const photo = row.media_type === "photo";
		const transformable = photo && !isHeic(row.storage_path);
		const storedThumb = row.thumbnail_path ? (thumbnailUrls.get(row.thumbnail_path) ?? null) : null;
		const thumb = storedThumb ?? (transformable ? await proxyUrl(row, "t") : null);
		const display = !photo ? null : transformable ? await proxyUrl(row, "d") : thumb;
		return {
			id: row.id,
			media_type: row.media_type,
			width: row.width,
			height: row.height,
			duration_milliseconds: row.duration_milliseconds,
			captured_at: row.captured_at,
			uploader: row.uploader ? { display_name: row.uploader.display_name } : null,
			thumb,
			display,
		};
	});

	return json(
		{
			event: {
				title: event.title,
				starts_at: event.starts_at,
				ends_at: event.ends_at,
				timezone: event.timezone,
				participant_count: participantCount ?? 0,
			},
			items,
			truncated: media.length >= MAX_ITEMS,
		},
		200,
		origin
	);
});
