import { createElement as h } from "react";
import type { KitData } from "../event.js";
import { fitTitle, titleFontSize } from "../event.js";
import { FORMAT_SIZE } from "../formats.js";
import { kitTheme } from "../theme.js";

const centered = { display: "flex", flexDirection: "column", alignItems: "center" } as const;

export function TableCard({ title, dateLabel, code, qrSrc }: KitData) {
	const fitted = fitTitle(title);
	return h(
		"div",
		{
			"data-kit-card": true,
			style: {
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
			},
		},
		h(
			"div",
			{ style: centered },
			h(
				"div",
				{
					style: {
						display: "flex",
						fontSize: titleFontSize(fitted, 28),
						fontWeight: 800,
						wordBreak: "break-all",
					},
				},
				fitted
			),
			h(
				"div",
				{
					style: {
						display: "flex",
						fontSize: 13,
						fontWeight: 500,
						color: kitTheme.colors.mutedOnLight,
						marginTop: 6,
					},
				},
				dateLabel
			)
		),
		h(
			"div",
			{
				style: {
					display: "flex",
					backgroundColor: kitTheme.colors.white,
					borderRadius: 20,
					padding: 14,
					border: `4px solid ${kitTheme.colors.pink}`,
				},
			},
			h("img", { src: qrSrc, width: 200, height: 200, alt: "" })
		),
		h(
			"div",
			{ style: centered },
			h(
				"div",
				{ style: { display: "flex", fontSize: 20, fontWeight: 800 } },
				kitTheme.copy.scanHeadline
			),
			h(
				"div",
				{
					style: {
						display: "flex",
						fontSize: 13,
						fontWeight: 500,
						color: kitTheme.colors.mutedOnLight,
						marginTop: 6,
					},
				},
				`${kitTheme.copy.codeLabel}: ${code}`
			),
			h(
				"div",
				{
					style: {
						display: "flex",
						fontSize: 11,
						fontWeight: 500,
						color: kitTheme.colors.mutedOnLight,
						marginTop: 4,
					},
				},
				kitTheme.copy.noAccount
			)
		)
	);
}
