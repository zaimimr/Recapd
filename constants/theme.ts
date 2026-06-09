import type { ColorSchemeName } from "react-native";

const palette = {
	coral: "#FF5E62",
	hotPink: "#FF2D8E",
	violet: "#8B2FE0",
	warm: "#FF7A45",

	white: "#FFFFFF",

	pageDark: "#0B0B12",
	cardDark: "#15151F",
	cardElevatedDark: "#1E1E2B",
	borderDark: "#2A2A38",
	textMutedDark: "#A0A0B2",

	pageLight: "#FFF9F6",
	cardLight: "#FFFFFF",
	borderLight: "#F0E6E0",
	textPrimaryLight: "#1A1421",
	textMutedLight: "#6B6478",

	danger: "#EF4444",
	success: "#22C55E",
	warning: "#F59E0B",
};

export const brandGradient = ["#FF5E62", "#FF2D8E", "#8B2FE0"] as const;

export interface AppTheme {
	page: string;
	card: string;
	cardElevated: string;
	border: string;
	textPrimary: string;
	textMuted: string;
	textOnAccent: string;
	accent: string;
	accentSecondary: string;
	accentWarm: string;
	accentMuted: string;
	accentSurface: string;
	accentSurfaceStrong: string;
	accentBorder: string;
	gradient: readonly string[];
	danger: string;
	success: string;
	warning: string;
	pillSurface: string;
	pillBorder: string;
}

const sharedAccents = {
	accent: palette.hotPink,
	accentSecondary: palette.violet,
	accentWarm: palette.warm,
	gradient: brandGradient,
	textOnAccent: palette.white,
	danger: palette.danger,
	success: palette.success,
	warning: palette.warning,
};

const light: AppTheme = {
	...sharedAccents,
	page: palette.pageLight,
	card: palette.cardLight,
	cardElevated: palette.cardLight,
	border: palette.borderLight,
	textPrimary: palette.textPrimaryLight,
	textMuted: palette.textMutedLight,
	accentMuted: palette.violet,
	accentSurface: "rgba(255,45,142,0.10)",
	accentSurfaceStrong: "rgba(255,45,142,0.16)",
	accentBorder: "rgba(255,45,142,0.30)",
	pillSurface: "rgba(255,45,142,0.10)",
	pillBorder: "rgba(255,45,142,0.30)",
};

const dark: AppTheme = {
	...sharedAccents,
	page: palette.pageDark,
	card: palette.cardDark,
	cardElevated: palette.cardElevatedDark,
	border: palette.borderDark,
	textPrimary: palette.white,
	textMuted: palette.textMutedDark,
	accentMuted: palette.coral,
	accentSurface: "rgba(255,45,142,0.14)",
	accentSurfaceStrong: "rgba(255,45,142,0.22)",
	accentBorder: "rgba(255,45,142,0.38)",
	pillSurface: "rgba(255,45,142,0.14)",
	pillBorder: "rgba(255,45,142,0.38)",
};

export const themes = { light, dark, palette };

export function getTheme(scheme: ColorSchemeName | null | undefined): AppTheme {
	return scheme === "dark" ? dark : light;
}
