export const kitTheme = {
	colors: {
		coral: "#FF5E62",
		pink: "#FF2D8E",
		violet: "#8B2FE0",
		dark: "#0B0B12",
		cream: "#FFF9F6",
		white: "#FFFFFF",
		mutedOnDark: "rgba(255,255,255,0.72)",
		mutedOnLight: "#6B6478",
	},
	gradient: "linear-gradient(135deg, #FF5E62 0%, #FF2D8E 52%, #8B2FE0 100%)",
	fontFamily: "Inter",
	fonts: [
		{ file: "inter-latin-500-normal.woff", weight: 500 },
		{ file: "inter-latin-800-normal.woff", weight: 800 },
	],
	copy: {
		brand: "Recapd",
		scanHeadline: "Scan to share your photos",
		storyHeadline: "Share your photos with us",
		codeLabel: "Join code",
		openLink: "recapd.app/join",
		noAccount: "No account needed. Just your first name.",
	},
} as const;
