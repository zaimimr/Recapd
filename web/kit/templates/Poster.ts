import { createElement as h } from "react";
import type { KitData } from "../event.js";
import { fitTitle, titleFontSize } from "../event.js";
import { FORMAT_SIZE } from "../formats.js";
import { kitTheme } from "../theme.js";

const centered = { display: "flex", flexDirection: "column", alignItems: "center" } as const;

export function Poster({ title, dateLabel, code, qrSrc }: KitData) {
	const fitted = fitTitle(title);
	return h(
		"div",
		{
			"data-kit-card": true,
			style: {
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
			},
		},
		h(
			"div",
			{ style: centered },
			h(
				"div",
				{ style: { display: "flex", fontSize: 22, fontWeight: 800, opacity: 0.85 } },
				kitTheme.copy.brand
			),
			h(
				"div",
				{
					style: {
						display: "flex",
						fontSize: titleFontSize(fitted, 60),
						fontWeight: 800,
						wordBreak: "break-all",
						lineHeight: 1.05,
						marginTop: 20,
					},
				},
				fitted
			),
			h(
				"div",
				{ style: { display: "flex", fontSize: 22, fontWeight: 500, marginTop: 12 } },
				dateLabel
			)
		),
		h(
			"div",
			{
				style: {
					display: "flex",
					backgroundColor: kitTheme.colors.white,
					borderRadius: 40,
					padding: 32,
				},
			},
			h("img", { src: qrSrc, width: 440, height: 440, alt: "" })
		),
		h(
			"div",
			{ style: centered },
			h(
				"div",
				{ style: { display: "flex", fontSize: 40, fontWeight: 800 } },
				kitTheme.copy.scanHeadline
			),
			h(
				"div",
				{ style: { display: "flex", fontSize: 22, fontWeight: 500, marginTop: 12 } },
				`${kitTheme.copy.codeLabel}: ${code}`
			),
			h(
				"div",
				{
					style: {
						display: "flex",
						fontSize: 16,
						fontWeight: 500,
						color: kitTheme.colors.mutedOnDark,
						marginTop: 8,
					},
				},
				kitTheme.copy.noAccount
			)
		)
	);
}
