import { describe, expect, it } from "vitest";
import { injectJoinMeta } from "../joinShell";

const shell = `<!doctype html><html><head>
<meta charset="UTF-8" />
<title>Recapd | Home</title>
<meta name="description" content="home" />
<link rel="canonical" href="https://recapd.app/" />
<meta property="og:title" content="Home" />
<meta name="twitter:card" content="summary_large_image" />
<script type="module" src="/assets/index.js"></script>
</head><body><div id="root"></div></body></html>`;

describe("injectJoinMeta", () => {
	const html = injectJoinMeta(shell, {
		code: "ABC123",
		title: `Tom & Jerry's "party"`,
		description: "Sat, Oct 3 · 7:00 PM",
	});

	it("replaces the home page title and social tags", () => {
		expect(html).not.toContain("Recapd | Home");
		expect(html).not.toContain('content="Home"');
		expect(html).not.toContain('content="home"');
		expect(html).not.toContain('href="https://recapd.app/"');
		expect(html.match(/twitter:card/g)).toHaveLength(1);
	});

	it("injects escaped event tags before the closing head", () => {
		expect(html).toContain("<title>Tom &amp; Jerry&#39;s &quot;party&quot;</title>");
		expect(html).toContain(
			'<meta property="og:image" content="https://recapd.app/api/kit/image?code=ABC123&amp;format=social">'
		);
		expect(html).toContain('<meta property="og:url" content="https://recapd.app/join/ABC123">');
		expect(html.indexOf("og:image")).toBeLessThan(html.indexOf("</head>"));
	});

	it("keeps the app scripts and root", () => {
		expect(html).toContain('<script type="module" src="/assets/index.js"></script>');
		expect(html).toContain('<div id="root"></div>');
	});
});
