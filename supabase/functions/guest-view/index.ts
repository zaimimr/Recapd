import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, clientIp } from "./rateLimit.ts";
import { type ImageKind, imageTokenExpiry, signImageToken, verifyImageToken } from "./token.ts";

const MAX_ITEMS = 2000;
const PAGE_SIZE = 1000;
const THUMB_TRANSFORM = { width: 400, height: 400, resize: "cover" as const, quality: 60 };
const DISPLAY_TRANSFORM = { width: 1600, height: 1600, resize: "contain" as const, quality: 80 };
const MEDIA_COLUMNS =
	"id, media_type, width, height, duration_milliseconds, captured_at, storage_path, thumbnail_path, uploader:users!uploaded_by_user_id(display_name)";

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
		"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
		"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
		"Access-Control-Expose-Headers": "Retry-After",
		Vary: "Origin",
	};
}

function json(
	body: unknown,
	status: number,
	origin: string | null,
	extraHeaders: Record<string, string> = {}
) {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			...corsHeaders(origin),
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
			...extraHeaders,
		},
	});
}

function serviceClient(): SupabaseClient {
	return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
		auth: { autoRefreshToken: false, persistSession: false },
	});
}

function isExpired(expiresAt: string | null): boolean {
	return Boolean(expiresAt && new Date(expiresAt).getTime() < Date.now());
}

function isHeic(path: string | null): boolean {
	return Boolean(path && /\.(heic|heif)$/i.test(path));
}

function normalizeCode(raw: unknown): string | null {
	if (typeof raw !== "string" || !/^[A-Za-z0-9\s-]*$/.test(raw)) return null;
	const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
	return code.length === 6 ? code : null;
}

async function serveImage(
	supabase: SupabaseClient,
	token: string | null,
	origin: string | null
): Promise<Response> {
	const secret = Deno.env.get("GUEST_VIEW_IMAGE_SECRET");
	if (!secret) return json({ error: "server_error" }, 500, origin);
	const claims = await verifyImageToken(token, secret, Date.now());
	if (!claims) return json({ error: "unauthorized" }, 401, origin);
	const { data: item } = await supabase
		.from("media_items")
		.select(
			"storage_path, thumbnail_path, media_type, visibility, deleted_at, event:events(expires_at)"
		)
		.eq("id", claims.i)
		.maybeSingle();
	const eventExpiry = (item?.event as { expires_at: string | null } | null)?.expires_at ?? null;
	if (!item || item.visibility !== "shared" || item.deleted_at || isExpired(eventExpiry)) {
		return json({ error: "not_found" }, 404, origin);
	}
	const transformable = item.media_type === "photo" && !isHeic(item.storage_path);
	if (claims.k === "s" ? !item.thumbnail_path : !transformable) {
		return json({ error: "not_found" }, 404, origin);
	}
	let data: Blob | null = null;
	if (claims.k !== "s") {
		const transform = claims.k === "d" ? DISPLAY_TRANSFORM : THUMB_TRANSFORM;
		({ data } = await supabase.storage
			.from("event-photos")
			.download(item.storage_path, { transform }));
	}
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

async function fetchMedia(supabase: SupabaseClient, eventId: string) {
	const page = (from: number, withCount: boolean) =>
		supabase
			.from("media_items")
			.select(MEDIA_COLUMNS, withCount ? { count: "exact" } : undefined)
			.eq("event_id", eventId)
			.eq("visibility", "shared")
			.is("deleted_at", null)
			.order("captured_at", { ascending: false })
			.order("id", { ascending: true })
			.range(from, Math.min(from + PAGE_SIZE, MAX_ITEMS) - 1);
	const first = await page(0, true);
	if (first.error) throw first.error;
	const rows = [...((first.data ?? []) as unknown as MediaRow[])];
	for (let from = PAGE_SIZE; from < MAX_ITEMS && rows.length === from; from += PAGE_SIZE) {
		const next = await page(from, false);
		if (next.error) throw next.error;
		rows.push(...((next.data ?? []) as unknown as MediaRow[]));
	}
	const total = first.count ?? rows.length;
	return { rows, truncated: total > rows.length };
}

async function serveList(
	supabase: SupabaseClient,
	req: Request,
	origin: string | null
): Promise<Response> {
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

	const { data: event, error: eventError } = await supabase
		.from("events")
		.select("id, title, starts_at, ends_at, timezone, expires_at")
		.eq("join_code", code)
		.maybeSingle();
	if (eventError) return json({ error: "server_error" }, 500, origin);
	if (!event || isExpired(event.expires_at)) return json({ error: "not_found" }, 404, origin);

	let media: Awaited<ReturnType<typeof fetchMedia>>;
	let participantCount: number | null;
	try {
		const [fetched, participants] = await Promise.all([
			fetchMedia(supabase, event.id),
			supabase
				.from("event_participants")
				.select("id", { count: "exact", head: true })
				.eq("event_id", event.id),
		]);
		media = fetched;
		participantCount = participants.count;
	} catch {
		return json({ error: "server_error" }, 500, origin);
	}

	const imageBase = `${Deno.env.get("SUPABASE_URL")}/functions/v1/guest-view/image?t=`;
	const expiresAt = imageTokenExpiry(Date.now());
	const proxyUrl = async (row: MediaRow, kind: ImageKind) =>
		imageBase + (await signImageToken({ i: row.id, k: kind, e: expiresAt }, secret));

	const items = await Promise.all(
		media.rows.map(async (row) => {
			const photo = row.media_type === "photo";
			const transformable = photo && !isHeic(row.storage_path);
			const thumb = row.thumbnail_path
				? await proxyUrl(row, "s")
				: transformable
					? await proxyUrl(row, "t")
					: null;
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
		})
	);

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
			truncated: media.truncated,
		},
		200,
		origin
	);
}

Deno.serve(async (req) => {
	const origin = req.headers.get("Origin");
	if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
	const isImage = req.method === "GET" && new URL(req.url).pathname.endsWith("/image");
	if (!isImage && req.method !== "POST") {
		return json({ error: "method_not_allowed" }, 405, origin);
	}
	const secret = Deno.env.get("GUEST_VIEW_IMAGE_SECRET");
	if (!secret) return json({ error: "server_error" }, 500, origin);
	const supabase = serviceClient();
	const retryAfter = await checkRateLimit(
		(fn, args) => supabase.rpc(fn, args),
		isImage ? "image" : "list",
		clientIp(req.headers),
		secret
	);
	if (retryAfter > 0) {
		return json({ error: "rate_limited" }, 429, origin, { "Retry-After": String(retryAfter) });
	}
	if (isImage) return serveImage(supabase, new URL(req.url).searchParams.get("t"), origin);
	return serveList(supabase, req, origin);
});
