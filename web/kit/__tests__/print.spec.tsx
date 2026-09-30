import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { KitData } from "../event";
import { renderPrintPage } from "../print";
import { renderTemplate } from "../templates";

const data: KitData = {
	title: `<b>Anna & "Ola"'s</b> 🎉`,
	dateLabel: "Sat, Oct 10 · 6:00 PM",
	code: "ABC123",
	joinUrl: "https://recapd.app/join/ABC123",
	qrSrc: "data:image/svg+xml;base64,PHN2Zy8+",
};

describe("renderPrintPage", () => {
	it("puts four table cards on one A4 sheet", () => {
		const html = renderPrintPage("table", data);
		expect(html.match(/data-kit-card/g)?.length).toBe(4);
		expect(html).toContain("size: A4");
	});
	it("renders one poster", () => {
		const html = renderPrintPage("poster", data);
		expect(html.match(/data-kit-card/g)?.length).toBe(1);
	});
	it("escapes the title", () => {
		const html = renderPrintPage("table", data);
		expect(html).not.toContain("<b>Anna");
		expect(html).toContain("&lt;b&gt;Anna");
	});
	it("includes the QR image, code and print button", () => {
		const html = renderPrintPage("poster", data);
		expect(html).toContain(data.qrSrc);
		expect(html).toContain("ABC123");
		expect(html).toContain("window.print()");
	});
});

describe("renderTemplate", () => {
	it.each([
		"social",
		"story",
		"table",
		"poster",
	] as const)("renders %s with code and QR", (format) => {
		const markup = renderToStaticMarkup(renderTemplate(format, data));
		expect(markup).toContain("ABC123");
		expect(markup).toContain(data.qrSrc);
	});
	it("truncates an 80 character title", () => {
		const markup = renderToStaticMarkup(
			renderTemplate("social", { ...data, title: "A".repeat(80) })
		);
		expect(markup).toContain(`${"A".repeat(59)}…`);
		expect(markup).not.toContain("A".repeat(60));
	});
});
