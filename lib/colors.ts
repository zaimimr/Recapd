const AVATAR_COLORS = [
	"#FF2D8E",
	"#8B2FE0",
	"#E2603A",
	"#1F9E55",
	"#2C7FD4",
	"#D8443F",
	"#A32FC8",
	"#08806E",
];

export function getAvatarColor(name: string): string {
	let hash = 0;
	for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
	return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
