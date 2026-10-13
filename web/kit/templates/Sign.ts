import { createElement as h } from "react";
import type { KitData } from "../event.js";
import { FORMAT_SIZE, type PrintFormat } from "../formats.js";
import { SIGN_STYLES, type SignStyle } from "../signs.js";
import { kitTheme } from "../theme.js";

const stack = { display: "flex", flexDirection: "column", alignItems: "center" } as const;

export function Sign(data: KitData, style: SignStyle, format: PrintFormat) {
	const copy = SIGN_STYLES[style];
	const { width, height } = FORMAT_SIZE[format];
	const px = (value: number) => Math.round((value * width) / 794);
	return h(
		"div",
		{
			"data-kit-card": true,
			lang: copy.lang,
			style: {
				...stack,
				justifyContent: "space-between",
				textAlign: "center",
				width,
				height,
				padding: px(56),
				border: `${px(12)}px solid transparent`,
				background: `linear-gradient(#fff, #fff) padding-box, ${kitTheme.gradient} border-box`,
				fontFamily: kitTheme.fontFamily,
				color: kitTheme.colors.dark,
			},
		},
		h(
			"div",
			{ style: stack },
			h(
				"div",
				{
					style: {
						background: kitTheme.gradient,
						color: kitTheme.colors.white,
						fontSize: px(20),
						fontWeight: 800,
						letterSpacing: "0.12em",
						textTransform: "uppercase",
						padding: `${px(10)}px ${px(24)}px`,
						borderRadius: 999,
					},
				},
				copy.kicker
			),
			h(
				"div",
				{
					style: {
						fontSize: px(72),
						fontWeight: 800,
						lineHeight: 1.05,
						letterSpacing: "-0.02em",
						marginTop: px(32),
					},
				},
				copy.headline
			),
			h(
				"div",
				{
					style: {
						fontSize: px(26),
						fontWeight: 500,
						color: kitTheme.colors.mutedOnLight,
						marginTop: px(20),
					},
				},
				copy.line
			)
		),
		h(
			"div",
			{
				style: {
					display: "flex",
					padding: px(20),
					borderRadius: px(32),
					border: `${px(6)}px solid ${kitTheme.colors.pink}`,
					background: kitTheme.colors.white,
				},
			},
			h("img", { src: data.qrSrc, width: px(380), height: px(380), alt: "" })
		),
		h(
			"div",
			{ style: stack },
			h("div", { style: { fontSize: px(30), fontWeight: 800 } }, `${copy.codeLabel}: ${data.code}`),
			h(
				"div",
				{
					style: {
						fontSize: px(20),
						fontWeight: 500,
						color: kitTheme.colors.mutedOnLight,
						marginTop: px(16),
					},
				},
				`${kitTheme.copy.brand} · ${copy.foot}`
			)
		)
	);
}
