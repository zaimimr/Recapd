import type { KitData } from "../event";
import { fitTitle, titleFontSize } from "../event";
import { FORMAT_SIZE } from "../formats";
import { kitTheme } from "../theme";

export function Social({ title, dateLabel, code, qrSrc }: KitData) {
	const fitted = fitTitle(title);
	return (
		<div
			data-kit-card
			style={{
				display: "flex",
				width: FORMAT_SIZE.social.width,
				height: FORMAT_SIZE.social.height,
				backgroundImage: kitTheme.gradient,
				padding: 96,
				alignItems: "center",
				justifyContent: "space-between",
				fontFamily: kitTheme.fontFamily,
				color: kitTheme.colors.white,
			}}
		>
			<div style={{ display: "flex", flexDirection: "column", maxWidth: 1040 }}>
				<div style={{ display: "flex", fontSize: 36, fontWeight: 800, opacity: 0.85 }}>
					{kitTheme.copy.brand}
				</div>
				<div
					style={{
						display: "flex",
						fontSize: titleFontSize(fitted, 112),
						fontWeight: 800,
						lineHeight: 1.05,
						marginTop: 32,
					}}
				>
					{fitted}
				</div>
				<div style={{ display: "flex", fontSize: 40, fontWeight: 500, marginTop: 24 }}>
					{dateLabel}
				</div>
				<div style={{ display: "flex", fontSize: 44, fontWeight: 800, marginTop: 64 }}>
					{kitTheme.copy.scanHeadline}
				</div>
				<div style={{ display: "flex", fontSize: 32, fontWeight: 500, marginTop: 12 }}>
					{`${kitTheme.copy.codeLabel}: ${code}`}
				</div>
			</div>
			<div
				style={{
					display: "flex",
					backgroundColor: kitTheme.colors.white,
					borderRadius: 48,
					padding: 40,
				}}
			>
				<img src={qrSrc} width={560} height={560} alt="" />
			</div>
		</div>
	);
}
