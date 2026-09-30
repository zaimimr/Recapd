import { useEffect, useMemo, useRef, useState } from "react";
import { formatDateLabel, resolveTimeZone } from "../../../kit/format";
import { guestSupabase } from "../supabase";
import type { GalleryProps } from "../types";
import UploadTray, { AddMediaButton } from "../upload/UploadTray";
import { useUploadQueue } from "../upload/useUploadQueue";
import { countLabel, formatDuration, type GalleryItem } from "./mediaList";
import { createSignedUrlResolver, type StorageSigner } from "./signedUrls";
import { useEventMedia } from "./useEventMedia";
import Viewer from "./Viewer";
import "./gallery.css";

export type GalleryHandlers = {
	onSave?: (item: GalleryItem) => void;
	onDownloadAll?: (items: GalleryItem[]) => void;
};

const URL_REFRESH_MS = 5 * 60 * 1000;
const UPLOAD_RELOAD_DEBOUNCE_MS = 2500;

function PlaceholderIcon({ video }: { video: boolean }) {
	return video ? (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<rect x="3" y="6" width="13" height="12" rx="2" />
			<path d="m16 10 5-3v10l-5-3z" />
		</svg>
	) : (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<rect x="3" y="4" width="18" height="16" rx="2" />
			<circle cx="9" cy="10" r="2" />
			<path d="m21 16-5-5-9 9" />
		</svg>
	);
}

function Tile({
	item,
	url,
	onOpen,
}: {
	item: GalleryItem;
	url: string | undefined;
	onOpen: () => void;
}) {
	const [failedUrl, setFailedUrl] = useState<string | null>(null);
	const video = item.media_type === "video";
	const duration = video ? formatDuration(item.duration_milliseconds) : null;
	const showImage = Boolean(url) && failedUrl !== url;
	const who = item.uploader?.display_name;
	return (
		<li className="gallery-cell">
			<button
				type="button"
				className="gallery-tile"
				onClick={onOpen}
				aria-label={`${video ? "Video" : "Photo"}${who ? ` from ${who}` : ""}`}
			>
				{showImage ? (
					<img
						src={url}
						alt=""
						loading="lazy"
						decoding="async"
						onError={() => setFailedUrl(url ?? null)}
					/>
				) : (
					<span className="gallery-placeholder">
						<PlaceholderIcon video={video} />
					</span>
				)}
				{video && (
					<span className="gallery-video-badge">
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="M8 5v14l11-7z" />
						</svg>
						{duration}
					</span>
				)}
			</button>
		</li>
	);
}

export default function Gallery({
	event,
	profileId,
	onSave,
	onDownloadAll,
}: GalleryProps & GalleryHandlers) {
	const uploads = useUploadQueue(event.id, profileId);
	const media = useEventMedia(event.id, event.participant_count);
	const { items, reload } = media;
	const resolver = useMemo(
		() => createSignedUrlResolver(guestSupabase.storage as unknown as StorageSigner),
		[]
	);
	const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
	const [open, setOpen] = useState<{ id: string; index: number } | null>(null);

	const doneCount = uploads.items.filter((item) => item.status === "done").length;
	const seenDone = useRef(doneCount);
	const reloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	useEffect(() => {
		const grew = doneCount > seenDone.current;
		seenDone.current = doneCount;
		if (!grew) return;
		clearTimeout(reloadTimer.current);
		reloadTimer.current = setTimeout(() => void reload(), UPLOAD_RELOAD_DEBOUNCE_MS);
	}, [doneCount, reload]);
	useEffect(() => () => clearTimeout(reloadTimer.current), []);

	useEffect(() => {
		let cancelled = false;
		const refresh = () => {
			resolver
				.thumbnails(items)
				.then((urls) => {
					if (!cancelled) setThumbUrls((current) => ({ ...current, ...urls }));
				})
				.catch(() => undefined);
		};
		refresh();
		const timer = setInterval(refresh, URL_REFRESH_MS);
		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	}, [items, resolver]);

	const found = open ? items.findIndex((item) => item.id === open.id) : -1;
	const viewerIndex =
		open === null ? -1 : found >= 0 ? found : Math.min(open.index, items.length - 1);

	if (open !== null && viewerIndex < 0) setOpen(null);

	const dateLabel = formatDateLabel(event.starts_at, resolveTimeZone(event.timezone));
	const counts = `${countLabel(items.length, "item", "items")} · ${countLabel(
		media.participantCount,
		"guest",
		"guests"
	)}`;

	return (
		<main className="guest-page">
			<header className="gallery-header">
				<div className="gallery-heading">
					<p className="guest-eyebrow">{dateLabel}</p>
					<h1 className="guest-title">{event.title}</h1>
					<p className="gallery-counts">{media.status === "loading" ? " " : counts}</p>
				</div>
				<button
					type="button"
					className="gallery-download"
					onClick={() => onDownloadAll?.(items)}
					disabled={items.length === 0}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14" />
					</svg>
					Download all
				</button>
			</header>
			<AddMediaButton onFiles={uploads.add} />
			<UploadTray queue={uploads} />
			{media.status === "loading" && (
				<ul className="gallery-grid" aria-busy="true" aria-label="Loading photos">
					{Array.from({ length: 9 }, (_, index) => (
						<li key={index} className="gallery-cell gallery-skeleton" />
					))}
				</ul>
			)}
			{media.status === "error" && (
				<div className="gallery-empty">
					<p className="guest-body">We could not load the photos. Check your connection.</p>
					<button type="button" className="gallery-retry" onClick={() => void reload()}>
						Try again
					</button>
				</div>
			)}
			{media.status === "ready" && items.length === 0 && (
				<div className="gallery-empty">
					<p className="gallery-empty-title">No photos yet</p>
					<p className="guest-body">Add yours and they show up here for everyone.</p>
				</div>
			)}
			{media.status === "ready" && items.length > 0 && (
				<ul className="gallery-grid">
					{items.map((item, index) => (
						<Tile
							key={item.id}
							item={item}
							url={thumbUrls[item.id]}
							onOpen={() => setOpen({ id: item.id, index })}
						/>
					))}
				</ul>
			)}
			{viewerIndex >= 0 && (
				<Viewer
					items={items}
					index={viewerIndex}
					thumbUrls={thumbUrls}
					resolver={resolver}
					profileId={profileId}
					onIndexChange={(next) => setOpen({ id: items[next].id, index: next })}
					onClose={() => setOpen(null)}
					onSave={(item) => onSave?.(item)}
					onDelete={media.remove}
				/>
			)}
		</main>
	);
}
