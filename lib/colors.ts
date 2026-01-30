const AVATAR_COLORS = [
	"#f87171",
	"#fb923c",
	"#fbbf24",
	"#a3e635",
	"#34d399",
	"#22d3ee",
	"#818cf8",
	"#c084fc",
];

export function getAvatarColor(name: string): string {
	const hash = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
	return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
