import type { KitData } from "../event";
import { fitTitle, titleFontSize } from "../event";
import { FORMAT_SIZE } from "../formats";
import { kitTheme } from "../theme";

export function TableCard({ title, dateLabel, code, qrSrc }: KitData) {
	const fitted = fitTitle(title);
	return (
		<div
			data-kit-card
			style={{
				display: "flex",
				flexDirection: "column",
				width: FORMAT_SIZE.table.width,
				height: FORMAT_SIZE.table.height,
				backgroundColor: kitTheme.colors.cream,
				padding: 28,
				alignItems: "center",
				justifyContent: "space-between",
				textAlign: "center",
				fontFamily: kitTheme.fontFamily,
				color: kitTheme.colors.dark,
			}}
		>
			<div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
				<div style={{ display: "flex", fontSize: titleFontSize(fitted, 28), fontWeight: 800 }}>
					{fitted}
				</div>
				<div
					style={{
						display: "flex",
						fontSize: 13,
						fontWeight: 500,
						color: kitTheme.colors.mutedOnLight,
						marginTop: 6,
					}}
				>
					{dateLabel}
				</div>
			</div>
			<div
				style={{
					display: "flex",
					backgroundColor: kitTheme.colors.white,
					borderRadius: 20,
					padding: 14,
					border: `4px solid ${kitTheme.colors.pink}`,
				}}
			>
				<img src={qrSrc} width={200} height={200} alt="" />
			</div>
			<div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
				<div style={{ display: "flex", fontSize: 20, fontWeight: 800 }}>
					{kitTheme.copy.scanHeadline}
				</div>
				<div
					style={{
						display: "flex",
						fontSize: 13,
						fontWeight: 500,
						color: kitTheme.colors.mutedOnLight,
						marginTop: 6,
					}}
				>
					{`${kitTheme.copy.codeLabel}: ${code}`}
				</div>
				<div
					style={{
						display: "flex",
						fontSize: 11,
						fontWeight: 500,
						color: kitTheme.colors.mutedOnLight,
						marginTop: 4,
					}}
				>
					{kitTheme.copy.noAccount}
				</div>
			</div>
		</div>
	);
}
