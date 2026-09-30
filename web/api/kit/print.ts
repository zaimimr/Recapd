import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isPrintFormat } from "../../kit/formats.js";
import { loadKitData } from "../../kit/load.js";
import { renderPrintPage } from "../../kit/print.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
	const format = req.query.format ?? "table";
	if (!isPrintFormat(format)) return res.status(404).send("Not found");
	const data = await loadKitData(req.query);
	if (!data) return res.status(404).send("Not found");

	res.setHeader("Content-Type", "text/html; charset=utf-8");
	res.setHeader("Cache-Control", "public, max-age=3600");
	return res.status(200).send(renderPrintPage(format, data));
}
