import { createElement as h } from "react";
import type { KitData } from "../event.js";
import { fitTitle, titleFontSize } from "../event.js";
import { FORMAT_SIZE } from "../formats.js";
import { kitTheme } from "../theme.js";

export function Story({ title, dateLabel, code, qrSrc }: KitData) {
	const fitted = fitTitle(title);
	return h(
		"div",
		{
			"data-kit-card": true,
			style: {
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
			},
		},
		h(
			"div",
			{ style: { display: "flex", fontSize: 40, fontWeight: 800, opacity: 0.85 } },
			kitTheme.copy.brand
		),
		h(
			"div",
			{
				style: {
					display: "flex",
					fontSize: titleFontSize(fitted, 104),
					fontWeight: 800,
					wordBreak: "break-all",
					lineHeight: 1.05,
					marginTop: 40,
				},
			},
			fitted
		),
		h(
			"div",
			{ style: { display: "flex", fontSize: 40, fontWeight: 500, marginTop: 24 } },
			dateLabel
		),
		h(
			"div",
			{ style: { display: "flex", fontSize: 52, fontWeight: 800, marginTop: 96 } },
			kitTheme.copy.storyHeadline
		),
		h(
			"div",
			{ style: { display: "flex", fontSize: 36, fontWeight: 500, marginTop: 40 } },
			kitTheme.copy.codeLabel
		),
		h(
			"div",
			{
				style: {
					display: "flex",
					fontSize: 150,
					fontWeight: 800,
					letterSpacing: 16,
					marginTop: 8,
				},
			},
			code
		),
		h(
			"div",
			{ style: { display: "flex", fontSize: 36, fontWeight: 500, marginTop: 16 } },
			`${kitTheme.copy.openLink}/${code}`
		),
		h(
			"div",
			{
				style: {
					display: "flex",
					backgroundColor: kitTheme.colors.white,
					borderRadius: 32,
					padding: 24,
					marginTop: 72,
				},
			},
			h("img", { src: qrSrc, width: 280, height: 280, alt: "" })
		)
	);
}
