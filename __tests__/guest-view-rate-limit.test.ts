import { webcrypto } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
import {
	checkRateLimit,
	clientIp,
	RATE_LIMITS,
	RATE_WINDOW_SECONDS,
	rateLimitBucket,
} from "../supabase/functions/guest-view/rateLimit";

Object.assign(globalThis, { TextEncoder, TextDecoder });
if (!globalThis.crypto?.subtle) Object.assign(globalThis, { crypto: webcrypto });

const SECRET = "limiter-secret";

function fakeRpc(result: { data: unknown; error: unknown } | Error) {
	const calls: { p_bucket: string; p_limit: number; p_window_seconds: number }[] = [];
	const rpc = (
		_fn: "guest_view_rate_limit_hit",
		args: { p_bucket: string; p_limit: number; p_window_seconds: number }
	) => {
		calls.push(args);
		return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
	};
	return { rpc, calls };
}

describe("guest-view rate limits", () => {
	it("uses 30 list and 600 image requests per minute", () => {
		expect(RATE_LIMITS).toEqual({ list: 30, image: 600 });
		expect(RATE_WINDOW_SECONDS).toBe(60);
	});

	it("passes a hashed per-scope bucket and the scope limit to the database", async () => {
		const { rpc, calls } = fakeRpc({ data: 0, error: null });
		await checkRateLimit(rpc, "image", "203.0.113.9", SECRET);
		expect(calls).toHaveLength(1);
		expect(calls[0].p_limit).toBe(600);
		expect(calls[0].p_window_seconds).toBe(60);
		expect(calls[0].p_bucket).toMatch(/^image:[0-9a-f]{64}$/);
		expect(calls[0].p_bucket).not.toContain("203.0.113.9");
	});

	it("returns the retry-after seconds when the database says the bucket is over", async () => {
		const { rpc } = fakeRpc({ data: 42, error: null });
		await expect(checkRateLimit(rpc, "list", "203.0.113.9", SECRET)).resolves.toBe(42);
	});

	it("allows when under the limit", async () => {
		const { rpc } = fakeRpc({ data: 0, error: null });
		await expect(checkRateLimit(rpc, "list", "203.0.113.9", SECRET)).resolves.toBe(0);
	});

	it("fails open on database errors", async () => {
		await expect(
			checkRateLimit(
				fakeRpc({ data: null, error: { message: "down" } }).rpc,
				"list",
				"1.1.1.1",
				SECRET
			)
		).resolves.toBe(0);
		await expect(
			checkRateLimit(fakeRpc(new Error("boom")).rpc, "list", "1.1.1.1", SECRET)
		).resolves.toBe(0);
	});

	it("does not share one bucket between visitors without a known ip", async () => {
		const { rpc, calls } = fakeRpc({ data: 99, error: null });
		await expect(checkRateLimit(rpc, "list", null, SECRET)).resolves.toBe(0);
		expect(calls).toHaveLength(0);
	});

	it("keeps list and image buckets apart for the same ip", async () => {
		const list = await rateLimitBucket("list", "1.1.1.1", SECRET);
		const image = await rateLimitBucket("image", "1.1.1.1", SECRET);
		expect(list.split(":")[1]).toBe(image.split(":")[1]);
		expect(list).not.toBe(image);
	});

	it("keys the ip hash with the secret", async () => {
		const plainSha = Buffer.from(
			await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode("1.1.1.1"))
		).toString("hex");
		const bucket = await rateLimitBucket("list", "1.1.1.1", SECRET);
		expect(bucket).not.toBe(`list:${plainSha}`);
		expect(await rateLimitBucket("list", "1.1.1.1", "other-secret")).not.toBe(bucket);
		expect(await rateLimitBucket("list", "1.1.1.1", SECRET)).toBe(bucket);
	});
});

describe("clientIp", () => {
	it("prefers cf-connecting-ip over forwarded headers", () => {
		expect(
			clientIp(
				new Headers({
					"cf-connecting-ip": "198.51.100.4",
					"x-real-ip": "198.51.100.5",
					"x-forwarded-for": "6.6.6.6, 198.51.100.4",
				})
			)
		).toBe("198.51.100.4");
	});

	it("falls back to x-real-ip", () => {
		expect(
			clientIp(new Headers({ "x-real-ip": "198.51.100.5", "x-forwarded-for": "6.6.6.6" }))
		).toBe("198.51.100.5");
	});

	it("uses the rightmost x-forwarded-for hop so a forged left hop is ignored", () => {
		expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 7.7.7.7 , 203.0.113.9 " }))).toBe(
			"203.0.113.9"
		);
	});

	it("returns null when no address is known", () => {
		expect(clientIp(new Headers())).toBeNull();
		expect(clientIp(new Headers({ "x-forwarded-for": "10.0.0.1, " }))).toBeNull();
	});
});
