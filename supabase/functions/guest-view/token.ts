export const IMAGE_TOKEN_TTL_MS = 15 * 60 * 1000;

export type ImageKind = "d" | "t" | "s";

export type ImageClaims = {
	i: string;
	k: ImageKind;
	e: number;
};

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
	if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
	try {
		const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
		return Uint8Array.from(binary, (char) => char.charCodeAt(0));
	} catch {
		return null;
	}
}

const keys = new Map<string, Promise<CryptoKey>>();

export function hmacKey(secret: string): Promise<CryptoKey> {
	let key = keys.get(secret);
	if (!key) {
		key = crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(secret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign", "verify"]
		);
		keys.set(secret, key);
		key.catch(() => {
			if (keys.get(secret) === key) keys.delete(secret);
		});
	}
	return key;
}

export function imageTokenExpiry(now: number): number {
	return (Math.floor(now / IMAGE_TOKEN_TTL_MS) + 2) * IMAGE_TOKEN_TTL_MS;
}

function isClaims(value: unknown): value is ImageClaims {
	if (typeof value !== "object" || value === null) return false;
	const claims = value as Record<string, unknown>;
	return (
		typeof claims.i === "string" &&
		claims.i.length > 0 &&
		(claims.k === "d" || claims.k === "t" || claims.k === "s") &&
		typeof claims.e === "number" &&
		Number.isFinite(claims.e)
	);
}

export async function signImageToken(claims: ImageClaims, secret: string): Promise<string> {
	const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
	const signature = await crypto.subtle.sign(
		"HMAC",
		await hmacKey(secret),
		new TextEncoder().encode(payload)
	);
	return `${payload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyImageToken(
	token: string | null | undefined,
	secret: string,
	now: number
): Promise<ImageClaims | null> {
	if (!token) return null;
	const parts = token.split(".");
	if (parts.length !== 2) return null;
	const [payload, signaturePart] = parts;
	const signature = fromBase64Url(signaturePart);
	if (!signature || !fromBase64Url(payload)) return null;
	const valid = await crypto.subtle.verify(
		"HMAC",
		await hmacKey(secret),
		signature,
		new TextEncoder().encode(payload)
	);
	if (!valid) return null;
	let claims: unknown;
	try {
		claims = JSON.parse(new TextDecoder().decode(fromBase64Url(payload) ?? new Uint8Array()));
	} catch {
		return null;
	}
	if (!isClaims(claims) || claims.e < now) return null;
	return claims;
}
