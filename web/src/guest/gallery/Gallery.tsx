import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { guestSupabase } from "../supabase";
import HostCta from "../HostCta";
import { RECAP_MAX_TILES } from "../recap/recapLayout";
import { renderRecap, shareRecap } from "../recap/shareRecap";
import type { GalleryProps } from "../types";
import UploadTray, { AddMediaButton } from "../upload/UploadTray";
import { useUploadQueue } from "../upload/useUploadQueue";
import MediaGrid, { GalleryHeader } from "./MediaGrid";
import { countLabel, type GalleryItem } from "./mediaList";
import EventInfo from "./EventInfo";
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
	const loadFull = useCallback(
		(item: GalleryItem) => resolver.original(item.storage_path),
		[resolver]
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

	const counts = `${countLabel(items.length, "item", "items")} · ${countLabel(
		media.participantCount,
		"guest",
		"guests"
	)}`;

	const [recapBusy, setRecapBusy] = useState(false);
	const recapUrls = items
		.map((item) => thumbUrls[item.id])
		.filter((url): url is string => Boolean(url))
		.slice(0, RECAP_MAX_TILES);

	const onShareRecap = async () => {
		setRecapBusy(true);
		try {
			const blob = await renderRecap({ title: event.title, subtitle: counts, thumbUrls: recapUrls });
			await shareRecap(blob, "recap.png");
		} finally {
			setRecapBusy(false);
		}
	};

	return (
		<main className="guest-page">
			<GalleryHeader
				title={event.title}
				startsAt={event.starts_at}
				timezone={event.timezone}
				counts={media.status === "loading" ? " " : counts}
			>
				<div className="gallery-actions">
				<button
					type="button"
					className="gallery-download"
					onClick={onShareRecap}
					disabled={recapUrls.length === 0 || recapBusy}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 13v6h14v-6" />
					</svg>
					{recapBusy ? "Making recap" : "Share recap"}
				</button>
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
				</div>
			</GalleryHeader>
			<EventInfo event={event} />
			<AddMediaButton onFiles={uploads.add} />
			<UploadTray queue={uploads} />
			<MediaGrid
				status={media.status}
				items={items}
				thumbUrls={thumbUrls}
				emptyBody="Add yours and they show up here for everyone."
				onOpen={(item, index) => setOpen({ id: item.id, index })}
				onRetry={() => void reload()}
			/>
			{items.length > 0 && <HostCta placement="gallery" />}
			{viewerIndex >= 0 && (
				<Viewer
					items={items}
					index={viewerIndex}
					thumbUrls={thumbUrls}
					loadFull={loadFull}
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
