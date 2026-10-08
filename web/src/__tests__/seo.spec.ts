import { describe, expect, it } from "vitest";
import { hub, occasionBySlug, occasions } from "../occasions";
import { pages, renderPage, sitemap } from "../seo";

const template = `<html lang="en"><head><title>Home</title>
<meta name="description" content="home" />
<link rel="canonical" href="https://recapd.app/" />
<meta property="og:locale" content="en_US" />
<meta property="og:title" content="home" />
<meta property="og:description" content="home" />
<meta property="og:url" content="https://recapd.app/" />
<meta name="twitter:title" content="home" />
<meta name="twitter:description" content="home" />
<script type="application/ld+json">{"@type": "MobileApplication"}</script>
<script type="application/ld+json">{"@type": "FAQPage"}</script>
</head><body><div id="root"></div></body></html>`;

const jsonLdBlocks = (html: string) =>
	[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
		(match) => JSON.parse(match[1]) as { "@type": string; mainEntity?: unknown[] }
	);

describe("occasions", () => {
	it("has unique slugs that do not clash with the hub", () => {
		const slugs = occasions.map((occasion) => occasion.slug);
		expect(new Set(slugs).size).toBe(slugs.length);
		expect(slugs).not.toContain(hub.slug);
	});

	it("links only to existing related pages in the same language", () => {
		for (const occasion of occasions) {
			expect(occasion.related.length).toBeGreaterThan(0);
			for (const slug of occasion.related) {
				expect(slug).not.toBe(occasion.slug);
				expect(occasionBySlug(slug).lang).toBe(occasion.lang);
			}
		}
	});

	it("pairs language alternates both ways", () => {
		for (const occasion of occasions.filter((item) => item.alternate)) {
			const other = occasionBySlug(occasion.alternate!);
			expect(other.lang).not.toBe(occasion.lang);
			expect(other.alternate).toBe(occasion.slug);
		}
	});

	it("never uses an em dash", () => {
		expect(JSON.stringify({ occasions, hub })).not.toContain("—");
	});
});

describe("renderPage", () => {
	it("writes per-page meta, hreflang, JSON-LD and static content", () => {
		const page = pages.find((item) => item.path === "/bursdag-bilder")!;
		const html = renderPage(template, page);
		expect(html).toContain('<html lang="nb">');
		expect(html).toContain(`<title>${page.title}</title>`);
		expect(html).toContain('<link rel="canonical" href="https://recapd.app/bursdag-bilder" />');
		expect(html).toContain('<meta property="og:locale" content="nb_NO" />');
		expect(html).toContain('hreflang="en" href="https://recapd.app/birthday-party-photos"');
		expect(html).toContain('hreflang="x-default" href="https://recapd.app/birthday-party-photos"');
		expect(html).toContain('<div id="root"><main><h1>');
		const types = jsonLdBlocks(html).map((block) => block["@type"]);
		expect(types).toEqual(["MobileApplication", "BreadcrumbList", "FAQPage"]);
		const faq = jsonLdBlocks(html).find((block) => block["@type"] === "FAQPage")!;
		expect(faq.mainEntity).toHaveLength(occasionBySlug("bursdag-bilder").faqs.length);
	});

	it("omits the FAQ block on the hub page", () => {
		const html = renderPage(template, pages.find((item) => item.path === `/${hub.slug}`)!);
		expect(jsonLdBlocks(html).map((block) => block["@type"])).toEqual([
			"MobileApplication",
			"BreadcrumbList",
		]);
	});
});

describe("sitemap", () => {
	it("lists home, the hub and every occasion with lastmod", () => {
		const xml = sitemap("2026-10-08");
		expect(xml).toContain("<loc>https://recapd.app/</loc>");
		expect(xml).toContain(`<loc>https://recapd.app/${hub.slug}</loc>`);
		for (const occasion of occasions) {
			expect(xml).toContain(`<loc>https://recapd.app/${occasion.slug}</loc>`);
		}
		expect(xml.match(/<lastmod>2026-10-08<\/lastmod>/g)).toHaveLength(pages.length + 4);
	});
});
