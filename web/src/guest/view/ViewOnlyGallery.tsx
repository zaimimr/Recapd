import { type SyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import MediaGrid, { GalleryHeader, type GridStatus } from "../gallery/MediaGrid";
import { countLabel } from "../gallery/mediaList";
import Viewer from "../gallery/Viewer";
import HostCta from "../HostCta";
import type { GuestEvent } from "../types";
import {
	fetchGuestView,
	fullUrlFor,
	thumbUrlMap,
	type ViewData,
	type ViewItem,
	ViewNotFoundError,
} from "./viewModel";
import "../gallery/gallery.css";

export const VIEW_ONLY_BANNER =
	"This event is full. You can look, but only guests can add or save photos.";
export const VIDEO_NOTICE = "Videos play for guests in the app";
export const REFRESH_ERROR = "Could not refresh. Showing the photos loaded earlier.";
export const AUTO_REFRESH_MS = 10 * 60 * 1000;

type ViewStatus = GridStatus | "notFound";

function loadFull(item: ViewItem): Promise<string> {
	const url = fullUrlFor(item);
	return url ? Promise.resolve(url) : Promise.reject(new Error("No display image"));
}

function blockImageSave(event: SyntheticEvent) {
	if (event.target instanceof HTMLImageElement) event.preventDefault();
}

export function ViewOnlyGalleryView({
	title,
	startsAt,
	timezone,
	status,
	items,
	participantCount,
	refreshing,
	refreshFailed,
	onRefresh,
}: {
	title: string;
	startsAt: string;
	timezone: string | null;
	status: ViewStatus;
	items: ViewItem[];
	participantCount: number;
	refreshing: boolean;
	refreshFailed: boolean;
	onRefresh: () => void;
}) {
	const [open, setOpen] = useState<{ id: string; index: number } | null>(null);
	const thumbUrls = useMemo(() => thumbUrlMap(items), [items]);

	const found = open ? items.findIndex((item) => item.id === open.id) : -1;
	const viewerIndex =
		open === null ? -1 : found >= 0 ? found : Math.min(open.index, items.length - 1);
	if (open !== null && viewerIndex < 0) setOpen(null);

	const counts =
		status === "ready"
			? `${countLabel(items.length, "item", "items")} · ${countLabel(
					participantCount,
					"guest",
					"guests"
				)}`
			: " ";

	return (
		<main
			className="guest-page view-only"
			onContextMenu={blockImageSave}
			onDragStart={blockImageSave}
		>
			<GalleryHeader title={title} startsAt={startsAt} timezone={timezone} counts={counts}>
				<button
					type="button"
					className="gallery-download"
					onClick={onRefresh}
					disabled={refreshing || status === "loading"}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
					</svg>
					{refreshing ? "Refreshing..." : "Refresh"}
				</button>
			</GalleryHeader>
			<p className="view-only-banner">{VIEW_ONLY_BANNER}</p>
			{refreshFailed && status === "ready" && (
				<output className="view-only-error">{REFRESH_ERROR}</output>
			)}
			{status === "notFound" ? (
				<div className="gallery-empty">
					<p className="gallery-empty-title">Photos are not available</p>
					<p className="guest-body">This event has ended or no longer exists.</p>
				</div>
			) : (
				<MediaGrid
					status={status}
					items={items}
					thumbUrls={thumbUrls}
					emptyBody="Guests have not added any photos yet."
					protect
					onOpen={(item, index) => setOpen({ id: item.id, index })}
					onRetry={onRefresh}
				/>
			)}
			<HostCta placement="view_only" />
			{viewerIndex >= 0 && (
				<Viewer
					items={items}
					index={viewerIndex}
					thumbUrls={thumbUrls}
					loadFull={loadFull}
					videoNotice={VIDEO_NOTICE}
					onIndexChange={(next) => setOpen({ id: items[next].id, index: next })}
					onClose={() => setOpen(null)}
				/>
			)}
		</main>
	);
}

export default function ViewOnlyGallery({ event }: { event: GuestEvent }) {
	const [data, setData] = useState<ViewData | null>(null);
	const [status, setStatus] = useState<ViewStatus>("loading");
	const [refreshing, setRefreshing] = useState(false);
	const [refreshFailed, setRefreshFailed] = useState(false);
	const loadSeq = useRef(0);

	const load = useCallback(async () => {
		const seq = ++loadSeq.current;
		setRefreshing(true);
		try {
			const next = await fetchGuestView(event.join_code);
			if (seq !== loadSeq.current) return;
			setData(next);
			setStatus("ready");
			setRefreshFailed(false);
		} catch (error) {
			if (seq !== loadSeq.current) return;
			if (error instanceof ViewNotFoundError) {
				setData(null);
				setStatus("notFound");
			} else {
				setStatus((current) => (current === "ready" ? current : "error"));
				setRefreshFailed(true);
			}
		} finally {
			if (seq === loadSeq.current) setRefreshing(false);
		}
	}, [event.join_code]);

	useEffect(() => {
		void load();
	}, [load]);

	useEffect(() => {
		const timer = setInterval(() => {
			if (document.visibilityState === "visible") void load();
		}, AUTO_REFRESH_MS);
		const onVisible = () => {
			if (document.visibilityState === "visible") void load();
		};
		document.addEventListener("visibilitychange", onVisible);
		return () => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, [load]);

	return (
		<ViewOnlyGalleryView
			title={data?.event.title || event.title}
			startsAt={data?.event.starts_at || event.starts_at}
			timezone={data ? data.event.timezone : event.timezone}
			status={status}
			items={data?.items ?? []}
			participantCount={data?.event.participant_count ?? event.participant_count}
			refreshing={refreshing}
			refreshFailed={refreshFailed}
			onRefresh={() => void load()}
		/>
	);
}
