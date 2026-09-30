export type GalleryItem = {
	id: string;
	event_id: string;
	uploaded_by_user_id: string | null;
	captured_at: string;
	uploaded_at: string | null;
	media_type: "photo" | "video";
	width: number | null;
	height: number | null;
	duration_milliseconds: number | null;
	storage_path: string;
	thumbnail_path: string | null;
	visibility: string;
	deleted_at: string | null;
	uploader: { display_name: string } | null;
};

export type MediaChange =
	| { type: "INSERT" | "UPDATE"; row: GalleryItem }
	| { type: "DELETE"; id: string };

function time(value: string | null): number {
	const parsed = value ? new Date(value).getTime() : 0;
	return Number.isNaN(parsed) ? 0 : parsed;
}

function compareNewestFirst(a: GalleryItem, b: GalleryItem): number {
	return (
		time(b.captured_at) - time(a.captured_at) ||
		time(b.uploaded_at) - time(a.uploaded_at) ||
		(a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
	);
}

export function sortNewestFirst(items: GalleryItem[]): GalleryItem[] {
	return [...items].sort(compareNewestFirst);
}

export function isVisibleItem(row: Pick<GalleryItem, "visibility" | "deleted_at">): boolean {
	return row.visibility === "shared" && !row.deleted_at;
}

export function applyMediaChange(items: GalleryItem[], change: MediaChange): GalleryItem[] {
	if (change.type === "DELETE") {
		const next = items.filter((entry) => entry.id !== change.id);
		return next.length === items.length ? items : next;
	}
	const { row } = change;
	const index = items.findIndex(
		(entry) => entry.id === row.id || entry.storage_path === row.storage_path
	);
	if (!isVisibleItem(row)) {
		return index >= 0 ? items.filter((_, position) => position !== index) : items;
	}
	if (index < 0) return sortNewestFirst([...items, row]);
	const next = [...items];
	next[index] = { ...next[index], ...row, uploader: row.uploader ?? next[index].uploader };
	return sortNewestFirst(next);
}

export function formatDuration(ms: number | null): string | null {
	if (ms === null || !Number.isFinite(ms) || ms <= 0) return null;
	const totalSeconds = Math.max(1, Math.round(ms / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function countLabel(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}
