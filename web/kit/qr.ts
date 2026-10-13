import QRCode from "qrcode";
import { kitTheme } from "./theme.js";

export async function qrDataUri(url: string): Promise<string> {
	const svg = await QRCode.toString(url, {
		type: "svg",
		errorCorrectionLevel: "M",
		margin: 0,
		color: { dark: kitTheme.colors.dark, light: "#FFFFFF" },
	});
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
