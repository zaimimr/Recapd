export const RECAP_WIDTH = 1080;
export const RECAP_HEIGHT = 1920;
export const RECAP_MAX_TILES = 12;

const SIDE = 60;
const GAP = 12;
const GRID_TOP = 420;
const GRID_BOTTOM = 1680;
const COLUMNS = 3;

export type Tile = { x: number; y: number; size: number };

export function recapTiles(count: number): Tile[] {
	const total = Math.min(Math.max(count, 0), RECAP_MAX_TILES);
	if (total === 0) return [];
	const columns = total === 1 ? 1 : total <= 4 ? 2 : COLUMNS;
	const rows = Math.ceil(total / columns);
	const byWidth = (RECAP_WIDTH - SIDE * 2 - GAP * (columns - 1)) / columns;
	const byHeight = (GRID_BOTTOM - GRID_TOP - GAP * (rows - 1)) / rows;
	const size = Math.floor(Math.min(byWidth, byHeight));
	const gridHeight = size * rows + GAP * (rows - 1);
	const top = GRID_TOP + Math.floor((GRID_BOTTOM - GRID_TOP - gridHeight) / 2);
	const tiles: Tile[] = [];
	for (let index = 0; index < total; index += 1) {
		const row = Math.floor(index / columns);
		const inRow = row === rows - 1 ? total - row * columns : columns;
		const rowWidth = size * inRow + GAP * (inRow - 1);
		const left = Math.floor((RECAP_WIDTH - rowWidth) / 2);
		const column = index % columns;
		tiles.push({ x: left + column * (size + GAP), y: top + row * (size + GAP), size });
	}
	return tiles;
}

export function coverCrop(width: number, height: number) {
	const side = Math.min(width, height);
	return { sx: (width - side) / 2, sy: (height - side) / 2, side };
}

export function fitText(text: string, maxWidth: number, measure: (value: string) => number) {
	if (measure(text) <= maxWidth) return text;
	let end = text.length;
	while (end > 0 && measure(`${text.slice(0, end).trimEnd()}…`) > maxWidth) end -= 1;
	return `${text.slice(0, end).trimEnd()}…`;
}
