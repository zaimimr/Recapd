import { createElement as h } from "react";
import type { KitData } from "../event.js";
import { fitTitle, titleFontSize } from "../event.js";
import { FORMAT_SIZE } from "../formats.js";
import { kitTheme } from "../theme.js";

export function Social({ title, dateLabel, code, qrSrc }: KitData) {
	const fitted = fitTitle(title);
	return h(
		"div",
		{
			"data-kit-card": true,
			style: {
				display: "flex",
				width: FORMAT_SIZE.social.width,
				height: FORMAT_SIZE.social.height,
				backgroundImage: kitTheme.gradient,
				padding: 96,
				alignItems: "center",
				justifyContent: "space-between",
				fontFamily: kitTheme.fontFamily,
				color: kitTheme.colors.white,
			},
		},
		h(
			"div",
			{ style: { display: "flex", flexDirection: "column", maxWidth: 1040 } },
			h(
				"div",
				{ style: { display: "flex", fontSize: 36, fontWeight: 800, opacity: 0.85 } },
				kitTheme.copy.brand
			),
			h(
				"div",
				{
					style: {
						display: "flex",
						fontSize: titleFontSize(fitted, 112),
						fontWeight: 800,
						wordBreak: "break-word",
						lineHeight: 1.05,
						marginTop: 32,
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
				{ style: { display: "flex", fontSize: 44, fontWeight: 800, marginTop: 64 } },
				kitTheme.copy.scanHeadline
			),
			h(
				"div",
				{ style: { display: "flex", fontSize: 32, fontWeight: 500, marginTop: 12 } },
				`${kitTheme.copy.codeLabel}: ${code}`
			)
		),
		h(
			"div",
			{
				style: {
					display: "flex",
					backgroundColor: kitTheme.colors.white,
					borderRadius: 48,
					padding: 40,
				},
			},
			h("img", { src: qrSrc, width: 560, height: 560, alt: "" })
		)
	);
}
