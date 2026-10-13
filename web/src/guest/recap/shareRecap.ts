import { coverCrop, fitText, RECAP_HEIGHT, RECAP_WIDTH, recapTiles } from "./recapLayout";

const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export type RecapInput = {
	title: string;
	subtitle: string;
	thumbUrls: string[];
};

async function loadBitmap(url: string): Promise<ImageBitmap | null> {
	try {
		const response = await fetch(url, { mode: "cors", cache: "no-store" });
		if (!response.ok) return null;
		return await createImageBitmap(await response.blob());
	} catch {
		return null;
	}
}

function roundedClip(context: CanvasRenderingContext2D, x: number, y: number, size: number) {
	context.beginPath();
	context.roundRect(x, y, size, size, 24);
	context.clip();
}

export async function renderRecap(input: RecapInput): Promise<Blob> {
	const canvas = document.createElement("canvas");
	canvas.width = RECAP_WIDTH;
	canvas.height = RECAP_HEIGHT;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Canvas is not supported");

	await document.fonts?.ready;
	const [bitmaps, logo] = await Promise.all([
		Promise.all(input.thumbUrls.map(loadBitmap)),
		loadBitmap("/icon.png"),
	]);
	const photos = bitmaps.filter((bitmap): bitmap is ImageBitmap => bitmap !== null);

	context.fillStyle = "#0b0b12";
	context.fillRect(0, 0, RECAP_WIDTH, RECAP_HEIGHT);

	const glow = context.createRadialGradient(RECAP_WIDTH / 2, 0, 0, RECAP_WIDTH / 2, 0, 900);
	glow.addColorStop(0, "rgba(255, 45, 142, 0.35)");
	glow.addColorStop(1, "rgba(255, 45, 142, 0)");
	context.fillStyle = glow;
	context.fillRect(0, 0, RECAP_WIDTH, 900);

	const accent = context.createLinearGradient(60, 0, 420, 0);
	accent.addColorStop(0, "#ff5e62");
	accent.addColorStop(0.52, "#ff2d8e");
	accent.addColorStop(1, "#8b2fe0");

	context.textBaseline = "alphabetic";
	context.fillStyle = accent;
	context.font = `800 34px ${FONT}`;
	context.fillText("THE RECAP", 60, 190);

	context.fillStyle = "#ffffff";
	context.font = `800 76px ${FONT}`;
	const title = fitText(input.title, RECAP_WIDTH - 120, (value) => context.measureText(value).width);
	context.fillText(title, 60, 285);

	context.fillStyle = "rgba(255, 255, 255, 0.72)";
	context.font = `500 36px ${FONT}`;
	context.fillText(input.subtitle, 60, 345);

	recapTiles(photos.length).forEach((tile, index) => {
		const photo = photos[index];
		const crop = coverCrop(photo.width, photo.height);
		context.save();
		roundedClip(context, tile.x, tile.y, tile.size);
		context.drawImage(photo, crop.sx, crop.sy, crop.side, crop.side, tile.x, tile.y, tile.size, tile.size);
		context.restore();
	});

	const footerY = 1790;
	let textX = 60;
	if (logo) {
		context.save();
		roundedClip(context, 60, footerY - 62, 84);
		context.drawImage(logo, 60, footerY - 62, 84, 84);
		context.restore();
		textX = 168;
	}
	context.fillStyle = "#ffffff";
	context.font = `800 40px ${FONT}`;
	context.fillText("Made with Recapd", textX, footerY - 14);
	context.fillStyle = "rgba(255, 255, 255, 0.72)";
	context.font = `500 30px ${FONT}`;
	context.fillText("recapd.app", textX, footerY + 26);

	for (const bitmap of [...photos, logo]) bitmap?.close();

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error("Could not create image"))),
			"image/png"
		);
	});
}

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

export async function shareRecap(blob: Blob, fileName: string): Promise<ShareOutcome> {
	const file = new File([blob], fileName, { type: "image/png" });
	if (navigator.canShare?.({ files: [file] })) {
		try {
			await navigator.share({ files: [file] });
			return "shared";
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
		}
	}
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
	return "downloaded";
}
