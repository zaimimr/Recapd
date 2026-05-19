import * as Crypto from "expo-crypto";
import { env } from "@/lib/env";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

export function generateJoinCode(): string {
	const bytes = Crypto.getRandomBytes(CODE_LENGTH);
	let code = "";
	for (let i = 0; i < CODE_LENGTH; i++) {
		code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
	}
	return code;
}

export function normalizeJoinCode(input: string): string {
	return input
		.trim()
		.toUpperCase()
		.replace(/[^A-HJ-NP-Z2-9]/g, "")
		.slice(0, CODE_LENGTH);
}

export function isValidJoinCode(code: string): boolean {
	return new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(code);
}

export function webJoinUrl(code: string): string {
	return `${env.webJoinBase}/${encodeURIComponent(code)}`;
}

export function deepJoinUrl(code: string): string {
	return `${env.appScheme}://join/${encodeURIComponent(code)}`;
}
