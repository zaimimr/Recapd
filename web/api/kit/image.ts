import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadFonts } from "../../kit/fonts.js";
import { FORMAT_SIZE, isKitFormat } from "../../kit/formats.js";
import { loadKitData } from "../../kit/load.js";
import { loadImageResponse } from "../../kit/og.js";
import { renderTemplate } from "../../kit/templates/index.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
	const format = req.query.format;
	if (!isKitFormat(format)) return res.status(404).send("Not found");
	const data = await loadKitData(req.query);
	if (!data) return res.status(404).send("Not found");

	const ImageResponse = await loadImageResponse();
	const image = new ImageResponse(renderTemplate(format, data), {
		...FORMAT_SIZE[format],
		fonts: await loadFonts(),
		emoji: "twemoji",
	});
	const png = Buffer.from(await image.arrayBuffer());

	res.setHeader("Content-Type", "image/png");
	res.setHeader("Cache-Control", "public, max-age=3600");
	return res.status(200).send(png);
}
