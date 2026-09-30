import { type PointerEvent, useEffect, useRef, useState } from "react";
import type { GalleryItem } from "./mediaList";
import type { SignedUrlResolver } from "./signedUrls";

type ViewerProps = {
	items: GalleryItem[];
	index: number;
	thumbUrls: Record<string, string>;
	resolver: SignedUrlResolver;
	profileId: string;
	onIndexChange: (index: number) => void;
	onClose: () => void;
	onSave: (item: GalleryItem) => void;
	onDelete: (item: GalleryItem) => Promise<boolean>;
};

const SWIPE_PX = 50;

function useOriginalUrl(item: GalleryItem, resolver: SignedUrlResolver) {
	const [state, setState] = useState<{ path: string; url: string | null; failed: boolean }>({
		path: item.storage_path,
		url: null,
		failed: false,
	});
	useEffect(() => {
		let cancelled = false;
		resolver
			.original(item.storage_path)
			.then((url) => {
				if (!cancelled) setState({ path: item.storage_path, url, failed: false });
			})
			.catch(() => {
				if (!cancelled) setState({ path: item.storage_path, url: null, failed: true });
			});
		return () => {
			cancelled = true;
		};
	}, [item.storage_path, resolver]);
	return state.path === item.storage_path ? state : { url: null, failed: false };
}

function MediaStage({
	item,
	thumbUrl,
	resolver,
}: {
	item: GalleryItem;
	thumbUrl: string | undefined;
	resolver: SignedUrlResolver;
}) {
	const original = useOriginalUrl(item, resolver);
	const [broken, setBroken] = useState(false);

	if (item.media_type === "video") {
		if (original.failed) return <p className="viewer-message">This video could not be loaded.</p>;
		if (broken) {
			return (
				<p className="viewer-message">
					This video cannot play in this browser. Save it to watch it on your device.
				</p>
			);
		}
		if (!original.url) return <output className="guest-spinner" aria-label="Loading video" />;
		return (
			<video
				className="viewer-media"
				src={original.url}
				poster={thumbUrl}
				controls
				playsInline
				preload="metadata"
				onError={() => setBroken(true)}
			>
				<track kind="captions" />
			</video>
		);
	}

	if (original.url && !broken) {
		return (
			<img
				className="viewer-media"
				src={original.url}
				alt=""
				onError={() => setBroken(true)}
				style={thumbUrl ? { backgroundImage: `url("${thumbUrl}")` } : undefined}
			/>
		);
	}
	if (thumbUrl) {
		return (
			<>
				<img className="viewer-media" src={thumbUrl} alt="" />
				{(broken || original.failed) && (
					<p className="viewer-note">Full size preview is not available in this browser.</p>
				)}
			</>
		);
	}
	if (broken || original.failed) {
		return (
			<p className="viewer-message">
				This photo cannot be shown in this browser. Save it to view it on your device.
			</p>
		);
	}
	return <output className="guest-spinner" aria-label="Loading photo" />;
}

export default function Viewer({
	items,
	index,
	thumbUrls,
	resolver,
	profileId,
	onIndexChange,
	onClose,
	onSave,
	onDelete,
}: ViewerProps) {
	const item = items[index];
	const closeRef = useRef<HTMLButtonElement>(null);
	const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
	const [confirming, setConfirming] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const hasPrev = index > 0;
	const hasNext = index < items.length - 1;
	const own = item.uploaded_by_user_id === profileId;
	const video = item.media_type === "video";
	const noun = video ? "video" : "photo";

	const go = (delta: number) => {
		const next = index + delta;
		if (next < 0 || next >= items.length) return;
		setConfirming(null);
		setDeleteError(null);
		onIndexChange(next);
	};
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
			else if (event.key === "ArrowLeft") go(-1);
			else if (event.key === "ArrowRight") go(1);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	});

	useEffect(() => {
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		const previousFocus = document.activeElement as HTMLElement | null;
		closeRef.current?.focus();
		return () => {
			document.body.style.overflow = previousOverflow;
			previousFocus?.focus?.();
		};
	}, []);

	useEffect(() => {
		for (const neighbor of [items[index - 1], items[index + 1]]) {
			if (!neighbor || neighbor.media_type !== "photo") continue;
			resolver
				.original(neighbor.storage_path)
				.then((url) => {
					new Image().src = url;
				})
				.catch(() => undefined);
		}
	}, [items, index, resolver]);

	function onPointerDown(event: PointerEvent<HTMLDivElement>) {
		if (event.pointerType === "mouse") return;
		swipe.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
	}

	function onPointerUp(event: PointerEvent<HTMLDivElement>) {
		const start = swipe.current;
		swipe.current = null;
		if (!start || start.id !== event.pointerId) return;
		const dx = event.clientX - start.x;
		const dy = event.clientY - start.y;
		if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
		go(dx < 0 ? 1 : -1);
	}

	async function confirmDelete() {
		setDeleting(true);
		setDeleteError(null);
		const ok = await onDelete(item);
		setDeleting(false);
		setConfirming(null);
		if (!ok) setDeleteError(`Could not delete this ${noun}. Try again.`);
	}

	const who = own ? "You" : (item.uploader?.display_name ?? "A guest");

	return (
		<div className="viewer" role="dialog" aria-modal="true" aria-label={`${noun} viewer`}>
			<div className="viewer-top">
				<button
					ref={closeRef}
					type="button"
					className="viewer-icon-button"
					onClick={onClose}
					aria-label="Close"
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M6 6l12 12M18 6 6 18" />
					</svg>
				</button>
				<p className="viewer-position">
					{index + 1} / {items.length}
				</p>
			</div>
			<div
				className="viewer-stage"
				onPointerDown={onPointerDown}
				onPointerUp={onPointerUp}
				onPointerCancel={() => {
					swipe.current = null;
				}}
			>
				<MediaStage key={item.id} item={item} thumbUrl={thumbUrls[item.id]} resolver={resolver} />
				{hasPrev && (
					<button
						type="button"
						className="viewer-nav viewer-nav-prev"
						onClick={() => go(-1)}
						aria-label="Previous"
					>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="m15 5-7 7 7 7" />
						</svg>
					</button>
				)}
				{hasNext && (
					<button
						type="button"
						className="viewer-nav viewer-nav-next"
						onClick={() => go(1)}
						aria-label="Next"
					>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="m9 5 7 7-7 7" />
						</svg>
					</button>
				)}
			</div>
			<div className="viewer-bottom">
				{confirming === item.id ? (
					<div className="viewer-confirm">
						<p className="viewer-confirm-text">Delete this {noun}? It is removed for everyone.</p>
						<div className="viewer-actions">
							<button
								type="button"
								className="viewer-action"
								onClick={() => setConfirming(null)}
								disabled={deleting}
							>
								Cancel
							</button>
							<button
								type="button"
								className="viewer-action viewer-action-danger"
								onClick={() => void confirmDelete()}
								disabled={deleting}
							>
								{deleting ? "Deleting..." : "Delete"}
							</button>
						</div>
					</div>
				) : (
					<>
						<p className="viewer-uploader">
							<span className="viewer-uploader-label">Added by</span> {who}
						</p>
						<div className="viewer-actions">
							{own && (
								<button
									type="button"
									className="viewer-action"
									onClick={() => {
										setDeleteError(null);
										setConfirming(item.id);
									}}
								>
									Delete
								</button>
							)}
							<button
								type="button"
								className="viewer-action viewer-action-primary"
								onClick={() => onSave(item)}
							>
								Save
							</button>
						</div>
					</>
				)}
				{deleteError && (
					<p className="viewer-error" role="alert">
						{deleteError}
					</p>
				)}
			</div>
		</div>
	);
}
