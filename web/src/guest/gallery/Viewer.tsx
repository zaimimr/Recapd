import { type PointerEvent, useEffect, useRef, useState } from "react";
import type { GridItem } from "./MediaGrid";

export type ViewerItem = GridItem & { uploaded_by_user_id?: string | null };

type ViewerProps<T extends ViewerItem> = {
	items: T[];
	index: number;
	thumbUrls: Record<string, string>;
	loadFull: (item: T) => Promise<string>;
	profileId?: string;
	videoNotice?: string;
	onIndexChange: (index: number) => void;
	onClose: () => void;
	onSave?: (item: T) => void;
	onDelete?: (item: T) => Promise<boolean>;
};

const SWIPE_PX = 50;
const FOCUSABLE =
	"button:not([disabled]), video[controls], a[href], [tabindex]:not([tabindex='-1'])";

function useFullUrl<T extends ViewerItem>(item: T, loadFull: (item: T) => Promise<string>) {
	const [state, setState] = useState<{ source: T; url: string | null; failed: boolean }>({
		source: item,
		url: null,
		failed: false,
	});
	useEffect(() => {
		let cancelled = false;
		loadFull(item)
			.then((url) => {
				if (!cancelled) setState({ source: item, url, failed: false });
			})
			.catch(() => {
				if (!cancelled) setState({ source: item, url: null, failed: true });
			});
		return () => {
			cancelled = true;
		};
	}, [item, loadFull]);
	return state.source.id === item.id ? state : { url: null, failed: false };
}

function PosterStage({ thumbUrl, notice }: { thumbUrl: string | undefined; notice: string }) {
	return thumbUrl ? (
		<>
			<img className="viewer-media" src={thumbUrl} alt="" draggable={false} />
			<p className="viewer-note">{notice}</p>
		</>
	) : (
		<p className="viewer-message">{notice}</p>
	);
}

function MediaStage<T extends ViewerItem>({
	item,
	thumbUrl,
	loadFull,
	canSave,
	protect,
}: {
	item: T;
	thumbUrl: string | undefined;
	loadFull: (item: T) => Promise<string>;
	canSave: boolean;
	protect: boolean;
}) {
	const original = useFullUrl(item, loadFull);
	const [broken, setBroken] = useState(false);
	const draggable = protect ? false : undefined;

	if (item.media_type === "video") {
		if (original.failed) return <p className="viewer-message">This video could not be loaded.</p>;
		if (broken) {
			return (
				<p className="viewer-message">
					This video cannot play in this browser.
					{canSave && " Save it to watch it on your device."}
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
				draggable={draggable}
				onError={() => setBroken(true)}
				style={thumbUrl ? { backgroundImage: `url("${thumbUrl}")` } : undefined}
			/>
		);
	}
	if (thumbUrl) {
		return (
			<>
				<img className="viewer-media" src={thumbUrl} alt="" draggable={draggable} />
				{(broken || original.failed) && (
					<p className="viewer-note">Full size preview is not available in this browser.</p>
				)}
			</>
		);
	}
	if (broken || original.failed) {
		return (
			<p className="viewer-message">
				This photo cannot be shown in this browser.
				{canSave && " Save it to view it on your device."}
			</p>
		);
	}
	return <output className="guest-spinner" aria-label="Loading photo" />;
}

export default function Viewer<T extends ViewerItem>({
	items,
	index,
	thumbUrls,
	loadFull,
	profileId,
	videoNotice,
	onIndexChange,
	onClose,
	onSave,
	onDelete,
}: ViewerProps<T>) {
	const item = items[index];
	const closeRef = useRef<HTMLButtonElement>(null);
	const dialogRef = useRef<HTMLDivElement>(null);
	const swipe = useRef<{ x: number; y: number; id: number } | null>(null);
	const [confirming, setConfirming] = useState<string | null>(null);
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const hasPrev = index > 0;
	const hasNext = index < items.length - 1;
	const own = Boolean(profileId) && item.uploaded_by_user_id === profileId;
	const canDelete = own && Boolean(onDelete);
	const video = item.media_type === "video";
	const noun = video ? "video" : "photo";

	const trapTab = (event: KeyboardEvent) => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
		if (focusables.length === 0) {
			event.preventDefault();
			return;
		}
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		const active = document.activeElement;
		if (!dialog.contains(active)) {
			event.preventDefault();
			(event.shiftKey ? last : first).focus();
		} else if (event.shiftKey && active === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	};

	const go = (delta: number) => {
		const next = index + delta;
		if (next < 0 || next >= items.length) return;
		setConfirming(null);
		setDeleteError(null);
		onIndexChange(next);
	};
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
				return;
			}
			if (event.key === "Tab") {
				trapTab(event);
				return;
			}
			if (document.activeElement?.tagName === "VIDEO") return;
			if (event.key === "ArrowLeft") go(-1);
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
			loadFull(neighbor)
				.then((url) => {
					new Image().src = url;
				})
				.catch(() => undefined);
		}
	}, [items, index, loadFull]);

	function onPointerDown(event: PointerEvent<HTMLDivElement>) {
		if (event.pointerType === "mouse") return;
		if (event.target instanceof Element && event.target.closest("video")) {
			swipe.current = null;
			return;
		}
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
		if (!onDelete) return;
		setDeleting(true);
		setDeleteError(null);
		const ok = await onDelete(item);
		setDeleting(false);
		setConfirming(null);
		if (!ok) setDeleteError(`Could not delete this ${noun}. Try again.`);
	}

	const who = own ? "You" : (item.uploader?.display_name ?? "A guest");

	return (
		<div
			ref={dialogRef}
			className="viewer"
			role="dialog"
			aria-modal="true"
			aria-label={`${noun} viewer`}
		>
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
				{video && videoNotice ? (
					<PosterStage key={item.id} thumbUrl={thumbUrls[item.id]} notice={videoNotice} />
				) : (
					<MediaStage
						key={item.id}
						item={item}
						thumbUrl={thumbUrls[item.id]}
						loadFull={loadFull}
						canSave={Boolean(onSave)}
						protect={!onSave}
					/>
				)}
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
							{canDelete && (
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
							{onSave && (
								<button
									type="button"
									className="viewer-action viewer-action-primary"
									onClick={() => onSave(item)}
								>
									Save
								</button>
							)}
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
