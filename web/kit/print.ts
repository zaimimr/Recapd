import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { KitData } from "./event.js";
import type { PrintFormat } from "./formats.js";
import { SIGN_STYLES, type SignStyle } from "./signs.js";
import { renderTemplate } from "./templates/index.js";
import { Sign } from "./templates/Sign.js";
import { kitTheme } from "./theme.js";

const CARDS_PER_SHEET: Record<PrintFormat, number> = { table: 4, poster: 1 };

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function chip(label: string, href: string, active: boolean): string {
	return `<a class="chip${active ? " active" : ""}" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function pickers(format: PrintFormat, style?: SignStyle): string {
	const query = (nextFormat: PrintFormat, nextStyle?: SignStyle) =>
		`?format=${nextFormat}${nextStyle ? `&style=${nextStyle}` : ""}`;
	const formats = [
		chip("Table cards", query("table", style), format === "table"),
		chip("Poster", query("poster", style), format === "poster"),
	];
	const styles = [
		chip("Classic", query(format), !style),
		...Object.entries(SIGN_STYLES).map(([key, copy]) =>
			chip(copy.label, query(format, key as SignStyle), key === style)
		),
	];
	return `<div class="chips">${formats.join("")}</div><div class="chips">${styles.join("")}</div>`;
}

export function renderPrintPage(format: PrintFormat, data: KitData, style?: SignStyle): string {
	const count = CARDS_PER_SHEET[format];
	const cards = Array.from({ length: count }, (_, index) =>
		h(
			"div",
			{ key: index, className: "slot" },
			style ? Sign(data, style, format) : renderTemplate(format, data)
		)
	);
	const sheet = renderToStaticMarkup(h("div", { className: `sheet sheet-${format}` }, cards));
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(data.title)} · Recapd</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;800&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #E9E4E1; font-family: Inter, sans-serif; }
.toolbar { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px; }
.chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.chip { font: 500 14px Inter, sans-serif; color: ${kitTheme.colors.dark}; background: #fff; border-radius: 999px; padding: 8px 16px; text-decoration: none; }
.chip.active { color: #fff; background: ${kitTheme.colors.dark}; }
.toolbar button { font: 800 16px Inter, sans-serif; color: #fff; background: ${kitTheme.gradient}; border: 0; border-radius: 999px; padding: 14px 28px; cursor: pointer; }
.sheet { width: 794px; height: 1122px; overflow: hidden; margin: 0 auto 32px; background: #fff; display: flex; flex-wrap: wrap; align-content: flex-start; }
.sheet-table .slot { outline: 1px dashed #BDB5B0; }
@media screen and (max-width: 820px) { .sheet { zoom: var(--fit, 1); margin-bottom: 16px; } }
@media print { body { background: #fff; } .toolbar { display: none; } .sheet { margin: 0; } }
</style>
</head>
<body>
<div class="toolbar">${pickers(format, style)}<button type="button" onclick="window.print()">Print / Save PDF</button></div>
${sheet}
<script>
function fit() { document.documentElement.style.setProperty('--fit', String(document.documentElement.clientWidth / 794)); }
fit();
window.addEventListener('resize', fit);
</script>
</body>
</html>`;
}
