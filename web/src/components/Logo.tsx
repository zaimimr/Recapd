type LogoProps = {
	size?: number;
	className?: string;
	title?: string;
};

export function LogoMark({ size = 40, className, title = "Recapd" }: LogoProps) {
	const gid = "recapd-fan-grad";
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 64 64"
			fill="none"
			role="img"
			aria-label={title}
			className={className}
		>
			<defs>
				<linearGradient id={gid} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
					<stop stopColor="#FF5E62" />
					<stop offset="0.5" stopColor="#FF2D8E" />
					<stop offset="1" stopColor="#8B2FE0" />
				</linearGradient>
				<linearGradient id={`${gid}-a`} x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
					<stop stopColor="#FF7A45" />
					<stop offset="1" stopColor="#FF5E62" />
				</linearGradient>
				<linearGradient id={`${gid}-b`} x1="12" y1="10" x2="44" y2="44" gradientUnits="userSpaceOnUse">
					<stop stopColor="#FF5E62" />
					<stop offset="1" stopColor="#FF2D8E" />
				</linearGradient>
				<linearGradient id={`${gid}-c`} x1="16" y1="12" x2="48" y2="48" gradientUnits="userSpaceOnUse">
					<stop stopColor="#FF2D8E" />
					<stop offset="1" stopColor="#A84BE8" />
				</linearGradient>
			</defs>
			<g strokeWidth="3" fill="none" strokeLinejoin="round">
				<rect
					x="9"
					y="17"
					width="26"
					height="32"
					rx="6"
					transform="rotate(-26 22 33)"
					stroke={`url(#${gid}-a)`}
				/>
				<rect
					x="14"
					y="16"
					width="26"
					height="32"
					rx="6"
					transform="rotate(-16 27 32)"
					stroke={`url(#${gid}-b)`}
				/>
				<rect
					x="19"
					y="15"
					width="26"
					height="32"
					rx="6"
					transform="rotate(-7 32 31)"
					stroke={`url(#${gid}-c)`}
				/>
			</g>
			<rect x="29" y="16" width="27" height="33" rx="7" transform="rotate(9 42 32)" fill={`url(#${gid})`} />
		</svg>
	);
}

export function LogoLockup({ size = 32, className }: { size?: number; className?: string }) {
	return (
		<span className={className ? `logo-lockup ${className}` : "logo-lockup"}>
			<LogoMark size={size} />
			<span className="logo-wordmark">
				Recap<span className="logo-wordmark-accent">d</span>
			</span>
		</span>
	);
}
