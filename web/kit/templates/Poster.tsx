import type { KitData } from "../event";
import { fitTitle, titleFontSize } from "../event";
import { FORMAT_SIZE } from "../formats";
import { kitTheme } from "../theme";

export function Poster({ title, dateLabel, code, qrSrc }: KitData) {
	const fitted = fitTitle(title);
	return (
		<div
			data-kit-card
			style={{
				display: "flex",
				flexDirection: "column",
				width: FORMAT_SIZE.poster.width,
				height: FORMAT_SIZE.poster.height,
				backgroundImage: kitTheme.gradient,
				padding: 64,
				alignItems: "center",
				justifyContent: "space-between",
				textAlign: "center",
				fontFamily: kitTheme.fontFamily,
				color: kitTheme.colors.white,
			}}
		>
			<div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
				<div style={{ display: "flex", fontSize: 22, fontWeight: 800, opacity: 0.85 }}>
					{kitTheme.copy.brand}
				</div>
				<div
					style={{
						display: "flex",
						fontSize: titleFontSize(fitted, 60),
						fontWeight: 800,
						lineHeight: 1.05,
						marginTop: 20,
					}}
				>
					{fitted}
				</div>
				<div style={{ display: "flex", fontSize: 22, fontWeight: 500, marginTop: 12 }}>
					{dateLabel}
				</div>
			</div>
			<div
				style={{
					display: "flex",
					backgroundColor: kitTheme.colors.white,
					borderRadius: 40,
					padding: 32,
				}}
			>
				<img src={qrSrc} width={440} height={440} alt="" />
			</div>
			<div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
				<div style={{ display: "flex", fontSize: 40, fontWeight: 800 }}>
					{kitTheme.copy.scanHeadline}
				</div>
				<div style={{ display: "flex", fontSize: 22, fontWeight: 500, marginTop: 12 }}>
					{`${kitTheme.copy.codeLabel}: ${code}`}
				</div>
				<div
					style={{
						display: "flex",
						fontSize: 16,
						fontWeight: 500,
						color: kitTheme.colors.mutedOnDark,
						marginTop: 8,
					}}
				>
					{kitTheme.copy.noAccount}
				</div>
			</div>
		</div>
	);
}
