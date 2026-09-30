import { renderToStaticMarkup } from "react-dom/server";
import type { KitData } from "./event";
import type { PrintFormat } from "./formats";
import { renderTemplate } from "./templates";
import { kitTheme } from "./theme";

const CARDS_PER_SHEET: Record<PrintFormat, number> = { table: 4, poster: 1 };

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

export function renderPrintPage(format: PrintFormat, data: KitData): string {
	const count = CARDS_PER_SHEET[format];
	const cards = Array.from({ length: count }, (_, index) => (
		<div key={index} className="slot">
			{renderTemplate(format, data)}
		</div>
	));
	const sheet = renderToStaticMarkup(<div className={`sheet sheet-${format}`}>{cards}</div>);
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
.toolbar { display: flex; justify-content: center; padding: 16px; }
.toolbar button { font: 800 16px Inter, sans-serif; color: #fff; background: ${kitTheme.gradient}; border: 0; border-radius: 999px; padding: 14px 28px; cursor: pointer; }
.sheet { width: 794px; height: 1123px; margin: 0 auto 32px; background: #fff; display: flex; flex-wrap: wrap; align-content: flex-start; }
.sheet-table .slot { outline: 1px dashed #BDB5B0; }
@media print { body { background: #fff; } .toolbar { display: none; } .sheet { margin: 0; } }
</style>
</head>
<body>
<div class="toolbar"><button type="button" onclick="window.print()">Print / Save PDF</button></div>
${sheet}
</body>
</html>`;
}
