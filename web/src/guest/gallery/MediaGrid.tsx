import { type ReactNode, useState } from "react";
import { formatDateLabel, resolveTimeZone } from "../../../kit/format";
import { formatDuration } from "./mediaList";

export type GridItem = {
	id: string;
	media_type: "photo" | "video";
	duration_milliseconds: number | null;
	uploader: { display_name: string } | null;
};

export type GridStatus = "loading" | "ready" | "error";

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
	protect,
	onOpen,
}: {
	item: GridItem;
	url: string | undefined;
	protect: boolean;
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
						draggable={protect ? false : undefined}
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

export function GalleryHeader({
	title,
	startsAt,
	timezone,
	counts,
	children,
}: {
	title: string;
	startsAt: string;
	timezone: string | null;
	counts: string;
	children: ReactNode;
}) {
	return (
		<header className="gallery-header">
			<div className="gallery-heading">
				<p className="guest-eyebrow">{formatDateLabel(startsAt, resolveTimeZone(timezone))}</p>
				<h1 className="guest-title">{title}</h1>
				<p className="gallery-counts">{counts}</p>
			</div>
			{children}
		</header>
	);
}

export default function MediaGrid<T extends GridItem>({
	status,
	items,
	thumbUrls,
	emptyBody,
	protect = false,
	onOpen,
	onRetry,
}: {
	status: GridStatus;
	items: T[];
	thumbUrls: Record<string, string>;
	emptyBody: string;
	protect?: boolean;
	onOpen: (item: T, index: number) => void;
	onRetry: () => void;
}) {
	if (status === "loading") {
		return (
			<ul className="gallery-grid" aria-busy="true" aria-label="Loading photos">
				{Array.from({ length: 9 }, (_, index) => (
					<li key={index} className="gallery-cell gallery-skeleton" />
				))}
			</ul>
		);
	}
	if (status === "error") {
		return (
			<div className="gallery-empty">
				<p className="guest-body">We could not load the photos. Check your connection.</p>
				<button type="button" className="gallery-retry" onClick={onRetry}>
					Try again
				</button>
			</div>
		);
	}
	if (items.length === 0) {
		return (
			<div className="gallery-empty">
				<p className="gallery-empty-title">No photos yet</p>
				<p className="guest-body">{emptyBody}</p>
			</div>
		);
	}
	return (
		<ul className="gallery-grid">
			{items.map((item, index) => (
				<Tile
					key={item.id}
					item={item}
					url={thumbUrls[item.id]}
					protect={protect}
					onOpen={() => onOpen(item, index)}
				/>
			))}
		</ul>
	);
}
