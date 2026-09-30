export type RateScope = "list" | "image";

export const RATE_LIMITS: Record<RateScope, number> = { list: 30, image: 600 };
export const RATE_WINDOW_SECONDS = 60;

type RateLimitRpc = (
	fn: "guest_view_rate_limit_hit",
	args: { p_bucket: string; p_limit: number; p_window_seconds: number }
) => PromiseLike<{ data: unknown; error: unknown }>;

export function clientIp(headers: Headers): string | null {
	const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
	return (
		forwarded || headers.get("cf-connecting-ip")?.trim() || headers.get("x-real-ip")?.trim() || null
	);
}

export async function rateLimitBucket(scope: RateScope, ip: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
	const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"));
	return `${scope}:${hex.join("")}`;
}

export async function checkRateLimit(
	rpc: RateLimitRpc,
	scope: RateScope,
	ip: string | null
): Promise<number> {
	if (!ip) return 0;
	try {
		const { data, error } = await rpc("guest_view_rate_limit_hit", {
			p_bucket: await rateLimitBucket(scope, ip),
			p_limit: RATE_LIMITS[scope],
			p_window_seconds: RATE_WINDOW_SECONDS,
		});
		return !error && typeof data === "number" && data > 0 ? data : 0;
	} catch {
		return 0;
	}
}
