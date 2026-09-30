import type { KitData } from "../event";
import { fitTitle, titleFontSize } from "../event";
import { FORMAT_SIZE } from "../formats";
import { kitTheme } from "../theme";

export function Story({ title, dateLabel, code, qrSrc }: KitData) {
	const fitted = fitTitle(title);
	return (
		<div
			data-kit-card
			style={{
				display: "flex",
				flexDirection: "column",
				width: FORMAT_SIZE.story.width,
				height: FORMAT_SIZE.story.height,
				backgroundImage: kitTheme.gradient,
				padding: 96,
				alignItems: "center",
				justifyContent: "center",
				textAlign: "center",
				fontFamily: kitTheme.fontFamily,
				color: kitTheme.colors.white,
			}}
		>
			<div style={{ display: "flex", fontSize: 40, fontWeight: 800, opacity: 0.85 }}>
				{kitTheme.copy.brand}
			</div>
			<div
				style={{
					display: "flex",
					fontSize: titleFontSize(fitted, 104),
					fontWeight: 800,
					lineHeight: 1.05,
					marginTop: 40,
				}}
			>
				{fitted}
			</div>
			<div style={{ display: "flex", fontSize: 40, fontWeight: 500, marginTop: 24 }}>
				{dateLabel}
			</div>
			<div style={{ display: "flex", fontSize: 52, fontWeight: 800, marginTop: 96 }}>
				{kitTheme.copy.storyHeadline}
			</div>
			<div style={{ display: "flex", fontSize: 36, fontWeight: 500, marginTop: 40 }}>
				{kitTheme.copy.codeLabel}
			</div>
			<div
				style={{
					display: "flex",
					fontSize: 150,
					fontWeight: 800,
					letterSpacing: 16,
					marginTop: 8,
				}}
			>
				{code}
			</div>
			<div style={{ display: "flex", fontSize: 36, fontWeight: 500, marginTop: 16 }}>
				{`${kitTheme.copy.openLink}/${code}`}
			</div>
			<div
				style={{
					display: "flex",
					backgroundColor: kitTheme.colors.white,
					borderRadius: 32,
					padding: 24,
					marginTop: 72,
				}}
			>
				<img src={qrSrc} width={280} height={280} alt="" />
			</div>
		</div>
	);
}
