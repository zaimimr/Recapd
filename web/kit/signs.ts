export type SignCopy = {
	label: string;
	kicker: string;
	headline: string;
	line: string;
	codeLabel: string;
	foot: string;
	lang: "en" | "nb";
};

const en = { codeLabel: "Code", foot: "No app needed", lang: "en" } as const;
const nb = { codeLabel: "Kode", foot: "Ingen app nødvendig", lang: "nb" } as const;

export const SIGN_STYLES = {
	halloween: {
		...en,
		label: "Halloween",
		kicker: "Halloween",
		headline: "Who has the pics?",
		line: "Scan to add your photos to the party album.",
	},
	wedding: {
		...en,
		label: "Wedding",
		kicker: "Our wedding",
		headline: "Share your photos with us",
		line: "Scan to add your photos and videos to our album.",
	},
	birthday: {
		...en,
		label: "Birthday",
		kicker: "Birthday",
		headline: "Got photos? Share them here",
		line: "Scan to add your photos to the birthday album.",
	},
	christmas: {
		...en,
		label: "Christmas",
		kicker: "Christmas party",
		headline: "Every photo in one album",
		line: "Scan to add your photos from tonight.",
	},
	julebord: {
		...nb,
		label: "Julebord",
		kicker: "Julebord",
		headline: "Del bildene dine her",
		line: "Skann for å legge bildene dine i julebordsalbumet.",
	},
	bryllup: {
		...nb,
		label: "Bryllup",
		kicker: "Bryllup",
		headline: "Del bildene dine med oss",
		line: "Skann for å legge bilder og videoer i albumet vårt.",
	},
} satisfies Record<string, SignCopy>;

export type SignStyle = keyof typeof SIGN_STYLES;

export function isSignStyle(value: unknown): value is SignStyle {
	return typeof value === "string" && Object.hasOwn(SIGN_STYLES, value);
}
