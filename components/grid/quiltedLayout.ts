import type { GalleryMediaItem } from "@/types/media";

export type GridTile = {
	item: GalleryMediaItem;
	x: number;
	y: number;
	width: number;
	height: number;
	aspectRatio: number;
};

export type DayCluster = {
	dayKey: string;
	label: string;
	dateMs: number;
	tiles: GridTile[];
	headerY: number;
	height: number;
};

export type QuiltedLayout = {
	clusters: DayCluster[];
	contentHeight: number;
};

const HEADER_HEIGHT = 36;
const HEADER_TOP_GAP = 8;
const HEADER_BOTTOM_GAP = 6;

export function dayKeyFromIso(iso: string) {
	const d = new Date(iso);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

const DAY_FORMATTER = new Intl.DateTimeFormat(undefined, {
	weekday: "long",
	day: "numeric",
	month: "long",
});

export function formatDayLabel(iso: string) {
	const d = new Date(iso);
	return DAY_FORMATTER.format(d);
}

function tileAspect(item: GalleryMediaItem): number {
	const w = item.width ?? 1;
	const h = item.height ?? 1;
	if (!w || !h) return 1;
	const ar = w / h;
	if (ar < 0.45) return 0.45;
	if (ar > 2.6) return 2.6;
	return ar;
}

function packRow(
	rowItems: GalleryMediaItem[],
	availableWidth: number,
	gap: number
): { heights: number; widths: number[] } {
	const aspectSum = rowItems.reduce((s, it) => s + tileAspect(it), 0);
	const totalGaps = gap * (rowItems.length - 1);
	const rowHeight = (availableWidth - totalGaps) / aspectSum;
	const widths = rowItems.map((it) => tileAspect(it) * rowHeight);
	return { heights: rowHeight, widths };
}

export function buildQuiltedLayout(
	items: GalleryMediaItem[],
	containerWidth: number,
	columns: number,
	gap: number
): QuiltedLayout {
	const sorted = [...items].sort(
		(a, b) => new Date(a.capture_time).getTime() - new Date(b.capture_time).getTime()
	);
	const byDay = new Map<string, GalleryMediaItem[]>();
	for (const item of sorted) {
		const key = dayKeyFromIso(item.capture_time);
		const arr = byDay.get(key);
		if (arr) arr.push(item);
		else byDay.set(key, [item]);
	}
	const dayKeys = [...byDay.keys()].sort();
	const clusters: DayCluster[] = [];
	let cursorY = 0;
	for (const dayKey of dayKeys) {
		const dayItems = byDay.get(dayKey) ?? [];
		const firstIso = dayItems[0]?.capture_time ?? dayKey;
		const headerY = cursorY + HEADER_TOP_GAP;
		const tilesStartY = headerY + HEADER_HEIGHT + HEADER_BOTTOM_GAP;
		const tiles: GridTile[] = [];
		let rowY = tilesStartY;
		for (let i = 0; i < dayItems.length; i += columns) {
			const rowItems = dayItems.slice(i, i + columns);
			const isLastRow = i + columns >= dayItems.length;
			const effectiveColumns = isLastRow && rowItems.length < columns ? rowItems.length : columns;
			const packWidth = containerWidth;
			const widthForRow =
				isLastRow && rowItems.length < columns
					? packWidth * (rowItems.length / columns)
					: packWidth;
			void effectiveColumns;
			const { heights: rowHeight, widths } = packRow(rowItems, widthForRow, gap);
			let x = 0;
			for (let j = 0; j < rowItems.length; j += 1) {
				const tileWidth = widths[j];
				tiles.push({
					item: rowItems[j],
					x,
					y: rowY,
					width: tileWidth,
					height: rowHeight,
					aspectRatio: tileWidth / rowHeight,
				});
				x += tileWidth + gap;
			}
			rowY += rowHeight + gap;
		}
		const clusterHeight = rowY - cursorY - gap;
		clusters.push({
			dayKey,
			label: formatDayLabel(firstIso),
			dateMs: new Date(firstIso).getTime(),
			tiles,
			headerY,
			height: clusterHeight,
		});
		cursorY += clusterHeight + gap * 2;
	}
	return { clusters, contentHeight: cursorY };
}

export const GRID_CONSTANTS = {
	HEADER_HEIGHT,
	HEADER_TOP_GAP,
	HEADER_BOTTOM_GAP,
};
