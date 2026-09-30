import { webcrypto } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
import {
	IMAGE_TOKEN_TTL_MS,
	type ImageClaims,
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

	it("rejects claims with an unknown kind", async () => {
		const token = await signImageToken({ ...claims, k: "x" as "d" }, SECRET);
		await expect(verifyImageToken(token, SECRET, NOW)).resolves.toBeNull();
	});
});
