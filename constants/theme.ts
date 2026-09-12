const palette = {
	coral: "#FF5E62",
	hotPink: "#FF2D8E",
	violet: "#8B2FE0",
	pinkSoft: "#FF7FB4",

	white: "#FFFFFF",

	page: "#0B0B12",
	pageDeep: "#07070C",
	card: "#15151F",
	cardElevated: "#1E1E2B",
	border: "#2A2A38",
	borderStrong: "#3A3A4A",
	textMuted: "#A0A0B2",
	textFaint: "#6B6B7E",
	textDisabled: "#5C5C6E",

	danger: "#EF4444",
	success: "#22C55E",
	warning: "#F59E0B",
};

export const brandGradient = ["#FF5E62", "#FF2D8E", "#8B2FE0"] as const;

export const gradients = {
	brand: brandGradient,
	danger: ["#F97066", "#EF4444"] as const,
	scrimTop: ["rgba(7,7,12,0.78)", "rgba(7,7,12,0)"] as const,
	scrimBottom: ["rgba(7,7,12,0)", "rgba(7,7,12,0.82)"] as const,
};

export const space = {
	xs: 4,
	sm: 8,
	md: 12,
	lg: 16,
	xl: 20,
	xxl: 24,
	xxxl: 32,
	huge: 40,
} as const;

export const radius = {
	sm: 8,
	md: 12,
	lg: 16,
	xl: 20,
	xxl: 24,
	pill: 999,
} as const;

export const type = {
	display: { fontSize: 30, fontWeight: "800", letterSpacing: -1, lineHeight: 34 },
	title: { fontSize: 24, fontWeight: "800", letterSpacing: -0.7, lineHeight: 28 },
	heading: { fontSize: 19, fontWeight: "700", letterSpacing: -0.4, lineHeight: 24 },
	subheading: { fontSize: 16, fontWeight: "700", letterSpacing: -0.3, lineHeight: 21 },
	body: { fontSize: 15, fontWeight: "500", letterSpacing: -0.1, lineHeight: 21 },
	bodyStrong: { fontSize: 15, fontWeight: "700", letterSpacing: -0.2, lineHeight: 21 },
	callout: { fontSize: 13.5, fontWeight: "500", letterSpacing: 0, lineHeight: 19 },
	caption: { fontSize: 12, fontWeight: "600", letterSpacing: 0, lineHeight: 16 },
	eyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 1.4, lineHeight: 14 },
} as const;

export const shadow = {
	card: {
		shadowColor: "#000",
		shadowOpacity: 0.35,
		shadowRadius: 18,
		shadowOffset: { width: 0, height: 8 },
		elevation: 6,
	},
	accent: {
		shadowColor: palette.hotPink,
		shadowOpacity: 0.45,
		shadowRadius: 20,
		shadowOffset: { width: 0, height: 10 },
		elevation: 10,
	},
} as const;

export const hitSlop = { top: 10, bottom: 10, left: 10, right: 10 } as const;

export const CONTENT_MAX_WIDTH = 680;

export interface AppTheme {
	page: string;
	pageDeep: string;
	card: string;
	cardElevated: string;
	border: string;
	borderStrong: string;
	textPrimary: string;
	textMuted: string;
	textFaint: string;
	textDisabled: string;
	textOnAccent: string;
	accent: string;
	accentSecondary: string;
	accentSoft: string;
	accentSurface: string;
	accentSurfaceStrong: string;
	accentBorder: string;
	gradient: readonly string[];
	danger: string;
	dangerSurface: string;
	success: string;
	successSurface: string;
	warning: string;
	warningSurface: string;
	pillSurface: string;
	pillBorder: string;
	overlay: string;
	glass: string;
	glassBorder: string;
}

const dark: AppTheme = {
	page: palette.page,
	pageDeep: palette.pageDeep,
	card: palette.card,
	cardElevated: palette.cardElevated,
	border: palette.border,
	borderStrong: palette.borderStrong,
	textPrimary: palette.white,
	textMuted: palette.textMuted,
	textFaint: palette.textFaint,
	textDisabled: palette.textDisabled,
	textOnAccent: palette.white,
	accent: palette.hotPink,
	accentSecondary: palette.violet,
	accentSoft: palette.pinkSoft,
	accentSurface: "rgba(255,45,142,0.14)",
	accentSurfaceStrong: "rgba(255,45,142,0.24)",
	accentBorder: "rgba(255,45,142,0.38)",
	gradient: brandGradient,
	danger: palette.danger,
	dangerSurface: "rgba(239,68,68,0.16)",
	success: palette.success,
	successSurface: "rgba(34,197,94,0.16)",
	warning: palette.warning,
	warningSurface: "rgba(245,158,11,0.16)",
	pillSurface: "rgba(255,255,255,0.08)",
	pillBorder: "rgba(255,255,255,0.14)",
	overlay: "rgba(7,7,12,0.82)",
	glass: "rgba(255,255,255,0.14)",
	glassBorder: "rgba(255,255,255,0.18)",
};

export const theme = dark;
