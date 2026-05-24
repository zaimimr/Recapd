import type { ColorSchemeName } from "react-native";

const palette = {
	indigo: "#7c3aed",
	indigoBright: "#a78bfa",
	white: "#ffffff",
	ink: "#0a0d12",
	navy: "#111827",
	slate: "#1c2230",
	graphite: "#1f2530",
	stone: "#6b7280",
	mist: "#9ca3af",
	hairline: "#e5e7eb",
	hairlineDark: "#242833",
	pageLight: "#f3f4f6",
	cardLight: "#ffffff",
	pageDark: "#05070b",
	cardDark: "#0f1115",
	cardElevatedDark: "#151821",
	danger: "#ef4444",
	success: "#22c55e",
	warning: "#f59e0b",
};

export interface AppTheme {
	page: string;
	card: string;
	cardElevated: string;
	border: string;
	textPrimary: string;
	textMuted: string;
	textOnAccent: string;
	accent: string;
	accentMuted: string;
	accentSurface: string;
	accentBorder: string;
	danger: string;
	success: string;
	warning: string;
	pillSurface: string;
	pillBorder: string;
}

const light: AppTheme = {
	page: palette.pageLight,
	card: palette.cardLight,
	cardElevated: palette.cardLight,
	border: palette.hairline,
	textPrimary: palette.navy,
	textMuted: palette.stone,
	textOnAccent: palette.white,
	accent: palette.navy,
	accentMuted: palette.slate,
	accentSurface: palette.navy,
	accentBorder: palette.navy,
	danger: palette.danger,
	success: palette.success,
	warning: palette.warning,
	pillSurface: palette.navy,
	pillBorder: palette.navy,
};

const dark: AppTheme = {
	page: palette.pageDark,
	card: palette.cardDark,
	cardElevated: palette.cardElevatedDark,
	border: palette.hairlineDark,
	textPrimary: palette.white,
	textMuted: palette.mist,
	textOnAccent: palette.ink,
	accent: palette.white,
	accentMuted: palette.mist,
	accentSurface: palette.white,
	accentBorder: palette.white,
	danger: palette.danger,
	success: palette.success,
	warning: palette.warning,
	pillSurface: palette.cardElevatedDark,
	pillBorder: palette.mist,
};

export const themes = { light, dark, palette };

export function getTheme(scheme: ColorSchemeName | null | undefined): AppTheme {
	return scheme === "dark" ? dark : light;
}
