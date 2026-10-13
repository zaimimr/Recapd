import { webcrypto } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
import {
	IMAGE_TOKEN_TTL_MS,
	type ImageClaims,
	imageTokenExpiry,
	signImageToken,
	verifyImageToken,
} from "../supabase/functions/guest-view/token";

Object.assign(globalThis, { TextEncoder, TextDecoder });
if (!globalThis.crypto?.subtle) Object.assign(globalThis, { crypto: webcrypto });

const SECRET = "test-secret-0123456789abcdef";
const NOW = 1_790_000_000_000;
const claims: ImageClaims = {
	i: "5f0c3a8e-1b2c-4d5e-8f90-123456789abc",
	k: "d",
	e: NOW + IMAGE_TOKEN_TTL_MS,
};

function tamperSignature(token: string): string {
	const [payload, signature] = token.split(".");
	const index = 10;
	const swapped = signature[index] === "A" ? "Q" : "A";
	return `${payload}.${signature.slice(0, index)}${swapped}${signature.slice(index + 1)}`;
}

describe("guest-view image token", () => {
	it("uses a 15 minute lifetime", () => {
		expect(IMAGE_TOKEN_TTL_MS).toBe(15 * 60 * 1000);
	});

	it("round-trips claims", async () => {
		const token = await signImageToken(claims, SECRET);
		await expect(verifyImageToken(token, SECRET, NOW)).resolves.toEqual(claims);
	});

	it("rejects an expired token", async () => {
		const token = await signImageToken(claims, SECRET);
		await expect(verifyImageToken(token, SECRET, claims.e + 1)).resolves.toBeNull();
	});

	it("rejects a token signed with another secret", async () => {
		const token = await signImageToken(claims, "other-secret");
		await expect(verifyImageToken(token, SECRET, NOW)).resolves.toBeNull();
	});

	it("rejects a tampered signature", async () => {
		const token = await signImageToken(claims, SECRET);
		await expect(verifyImageToken(tamperSignature(token), SECRET, NOW)).resolves.toBeNull();
	});

	it("rejects a tampered payload", async () => {
		const token = await signImageToken(claims, SECRET);
		const [, signature] = token.split(".");
		const forged = Buffer.from(
			JSON.stringify({ ...claims, i: "00000000-0000-0000-0000-000000000000" })
		)
			.toString("base64url")
			.concat(".", signature);
		await expect(verifyImageToken(forged, SECRET, NOW)).resolves.toBeNull();
	});

	it("rejects malformed input", async () => {
		for (const bad of ["", "abc", "a.b.c", "!!!.???", null, undefined]) {
			await expect(verifyImageToken(bad, SECRET, NOW)).resolves.toBeNull();
		}
	});

	it("accepts the stored thumbnail kind", async () => {
		const token = await signImageToken({ ...claims, k: "s" }, SECRET);
		await expect(verifyImageToken(token, SECRET, NOW)).resolves.toEqual({ ...claims, k: "s" });
	});

	it("mints identical tokens for list fetches in the same window", async () => {
		const windowStart = Math.floor(NOW / IMAGE_TOKEN_TTL_MS) * IMAGE_TOKEN_TTL_MS;
		const early = imageTokenExpiry(windowStart + 1000);
		const late = imageTokenExpiry(windowStart + IMAGE_TOKEN_TTL_MS - 1000);
		expect(early).toBe(late);
		const a = await signImageToken({ ...claims, e: early }, SECRET);
		const b = await signImageToken({ ...claims, e: late }, SECRET);
		expect(a).toBe(b);
	});

	it("keeps every token valid for 15 to 30 minutes", () => {
		for (const offset of [0, 1, 60_000, IMAGE_TOKEN_TTL_MS - 1]) {
			const now = NOW + offset;
			const lifetime = imageTokenExpiry(now) - now;
			expect(lifetime).toBeGreaterThan(IMAGE_TOKEN_TTL_MS);
			expect(lifetime).toBeLessThanOrEqual(2 * IMAGE_TOKEN_TTL_MS);
			expect(imageTokenExpiry(now) % IMAGE_TOKEN_TTL_MS).toBe(0);
		}
	});

	it("moves to a new expiry in the next window", () => {
		const windowStart = Math.floor(NOW / IMAGE_TOKEN_TTL_MS) * IMAGE_TOKEN_TTL_MS;
		expect(imageTokenExpiry(windowStart + IMAGE_TOKEN_TTL_MS)).toBe(
			imageTokenExpiry(windowStart) + IMAGE_TOKEN_TTL_MS
		);
	});

	it("retries the key import after a failed import", async () => {
		const secret = "fresh-secret-for-retry-test";
		const spy = jest
			.spyOn(globalThis.crypto.subtle, "importKey")
			.mockRejectedValueOnce(new Error("import failed"));
		await expect(signImageToken(claims, secret)).rejects.toThrow("import failed");
		spy.mockRestore();
		const token = await signImageToken(claims, secret);
		await expect(verifyImageToken(token, secret, NOW)).resolves.toEqual(claims);
	});

	it("rejects claims with an unknown kind", async () => {
		const token = await signImageToken({ ...claims, k: "x" as "d" }, SECRET);
		await expect(verifyImageToken(token, SECRET, NOW)).resolves.toBeNull();
	});
});
