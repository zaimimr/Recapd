export type JoinMeta = {
	code: string;
	title: string;
	description: string;
};

export function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

const REPLACED_TAGS = [
	/<title>[\s\S]*?<\/title>\s*/gi,
	/<meta\s+(?:property|name)="(?:og:[^"]*|twitter:[^"]*|description|robots)"[^>]*>\s*/gi,
	/<link\s+rel="canonical"[^>]*>\s*/gi,
];

export function injectJoinMeta(shell: string, meta: JoinMeta): string {
	const title = escapeHtml(meta.title);
	const description = escapeHtml(meta.description);
	const url = `https://recapd.app/join/${meta.code}`;
	const image = `https://recapd.app/api/kit/image?code=${meta.code}&amp;format=social`;
	const tags = [
		`<title>${title}</title>`,
		`<meta name="description" content="${description}">`,
		`<meta name="robots" content="noindex">`,
		`<link rel="canonical" href="${url}">`,
		`<meta property="og:title" content="${title}">`,
		`<meta property="og:description" content="${description}">`,
		`<meta property="og:type" content="website">`,
		`<meta property="og:url" content="${url}">`,
		`<meta property="og:image" content="${image}">`,
		`<meta property="og:image:width" content="1920">`,
		`<meta property="og:image:height" content="1005">`,
		`<meta property="og:site_name" content="Recapd">`,
		`<meta name="twitter:card" content="summary_large_image">`,
		`<meta name="twitter:title" content="${title}">`,
		`<meta name="twitter:description" content="${description}">`,
		`<meta name="twitter:image" content="${image}">`,
	].join("\n");
	const stripped = REPLACED_TAGS.reduce((html, pattern) => html.replace(pattern, ""), shell);
	return stripped.replace("</head>", () => `${tags}\n</head>`);
}
