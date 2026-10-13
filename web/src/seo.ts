import { hub, labels, type Occasion, occasionBySlug, occasions } from "./occasions";

export const SITE = "https://recapd.app";

type Link = { name: string; path: string };

export type Page = {
	path: string;
	lang: Occasion["lang"];
	title: string;
	description: string;
	alternates: { lang: string; path: string }[];
	breadcrumbs: Link[];
	faqs: Occasion["faqs"];
	body: string;
};

const escapeHtml = (value: string) =>
	value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const absolute = (path: string) => `${SITE}${path}`;

const jsonLd = (data: object) =>
	`<script type="application/ld+json">${JSON.stringify({
		"@context": "https://schema.org",
		...data,
	}).replace(/</g, "\\u003c")}</script>`;

const linkList = (items: Link[]) =>
	`<ul>${items.map((item) => `<li><a href="${item.path}">${escapeHtml(item.name)}</a></li>`).join("")}</ul>`;

const occasionLink = (occasion: Occasion): Link => ({
	name: occasion.kicker,
	path: `/${occasion.slug}`,
});

function alternatesFor(occasion: Occasion) {
	if (!occasion.alternate) return [];
	const pair = [occasion, occasionBySlug(occasion.alternate)];
	const english = pair.find((item) => item.lang === "en") ?? occasion;
	return [
		...pair.map((item) => ({ lang: item.lang, path: `/${item.slug}` })),
		{ lang: "x-default", path: `/${english.slug}` },
	];
}

function occasionPage(occasion: Occasion): Page {
	const text = labels[occasion.lang];
	return {
		path: `/${occasion.slug}`,
		lang: occasion.lang,
		title: occasion.metaTitle,
		description: occasion.metaDescription,
		alternates: alternatesFor(occasion),
		breadcrumbs: [
			{ name: "Recapd", path: "/" },
			{ name: text.all, path: `/${hub.slug}` },
			{ name: occasion.kicker, path: `/${occasion.slug}` },
		],
		faqs: occasion.faqs,
		body: [
			`<h1>${escapeHtml(occasion.h1)}</h1>`,
			`<p>${escapeHtml(occasion.intro)}</p>`,
			...occasion.points.map(
				(point) => `<h2>${escapeHtml(point.title)}</h2><p>${escapeHtml(point.copy)}</p>`
			),
			`<h2>${text.faq}</h2>`,
			...occasion.faqs.map((faq) => `<h3>${escapeHtml(faq.q)}</h3><p>${escapeHtml(faq.a)}</p>`),
			`<h2>${text.more}</h2>`,
			linkList([
				...occasion.related.map((slug) => occasionLink(occasionBySlug(slug))),
				{ name: text.all, path: `/${hub.slug}` },
			]),
		].join(""),
	};
}

const hubPage: Page = {
	path: `/${hub.slug}`,
	lang: "en",
	title: hub.metaTitle,
	description: hub.metaDescription,
	alternates: [],
	breadcrumbs: [
		{ name: "Recapd", path: "/" },
		{ name: hub.kicker, path: `/${hub.slug}` },
	],
	faqs: [],
	body: [
		`<h1>${escapeHtml(hub.h1)}</h1>`,
		`<p>${escapeHtml(hub.intro)}</p>`,
		linkList(occasions.filter((item) => item.lang === "en").map(occasionLink)),
		`<h2>${hub.nbHeading}</h2>`,
		linkList(occasions.filter((item) => item.lang === "nb").map(occasionLink)),
	].join(""),
};

export const pages: Page[] = [hubPage, ...occasions.map(occasionPage)];

function setAttribute(html: string, pattern: RegExp, value: string) {
	return html.replace(pattern, (_, start, end) => `${start}${escapeHtml(value)}${end}`);
}

export function renderPage(template: string, page: Page) {
	const url = absolute(page.path);
	const head = [
		...page.alternates.map(
			(item) => `<link rel="alternate" hreflang="${item.lang}" href="${absolute(item.path)}" />`
		),
		jsonLd({
			"@type": "BreadcrumbList",
			itemListElement: page.breadcrumbs.map((crumb, index) => ({
				"@type": "ListItem",
				position: index + 1,
				name: crumb.name,
				item: absolute(crumb.path),
			})),
		}),
		...(page.faqs.length > 0
			? [
					jsonLd({
						"@type": "FAQPage",
						mainEntity: page.faqs.map((faq) => ({
							"@type": "Question",
							name: faq.q,
							acceptedAnswer: { "@type": "Answer", text: faq.a },
						})),
					}),
				]
			: []),
	].join("\n");

	const metas: [RegExp, string][] = [
		[/(<meta name="description" content=")[^"]*(")/, page.description],
		[/(<link rel="canonical" href=")[^"]*(")/, url],
		[/(<meta property="og:title" content=")[^"]*(")/, page.title],
		[/(<meta property="og:description" content=")[^"]*(")/, page.description],
		[/(<meta property="og:url" content=")[^"]*(")/, url],
		[/(<meta property="og:locale" content=")[^"]*(")/, page.lang === "nb" ? "nb_NO" : "en_US"],
		[/(<meta name="twitter:title" content=")[^"]*(")/, page.title],
		[/(<meta name="twitter:description" content=")[^"]*(")/, page.description],
	];

	return metas
		.reduce(
			(html, [pattern, value]) => setAttribute(html, pattern, value),
			template
				.replace(/<html lang="[^"]*">/, `<html lang="${page.lang}">`)
				.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(page.title)}</title>`)
				.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, (block) =>
					block.includes('"FAQPage"') ? "" : block
				)
		)
		.replace("</head>", () => `${head}\n</head>`)
		.replace('<div id="root"></div>', () => `<div id="root"><main>${page.body}</main></div>`);
}

export function sitemap(lastmod: string) {
	const entries: Pick<Page, "path" | "alternates">[] = [
		{ path: "/", alternates: [] },
		...pages,
		{ path: "/privacy", alternates: [] },
		{ path: "/support", alternates: [] },
		{ path: "/terms", alternates: [] },
	];
	const urls = entries.map((entry) =>
		[
			"  <url>",
			`    <loc>${absolute(entry.path)}</loc>`,
			`    <lastmod>${lastmod}</lastmod>`,
			...entry.alternates.map(
				(item) =>
					`    <xhtml:link rel="alternate" hreflang="${item.lang}" href="${absolute(item.path)}" />`
			),
			"  </url>",
		].join("\n")
	);
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
		...urls,
		"</urlset>",
		"",
	].join("\n");
}
