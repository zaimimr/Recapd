import { type ChangeEvent, useRef } from "react";
import type { QueueItem, UploadQueueState } from "./useUploadQueue";
import "./upload.css";

export function AddMediaButton({ onFiles }: { onFiles: (files: File[]) => void }) {
	const inputRef = useRef<HTMLInputElement>(null);

	function handleChange(changeEvent: ChangeEvent<HTMLInputElement>) {
		const files = Array.from(changeEvent.target.files ?? []);
		changeEvent.target.value = "";
		if (files.length > 0) onFiles(files);
	}

	return (
		<>
			<button type="button" className="guest-button" onClick={() => inputRef.current?.click()}>
				<svg className="upload-add-icon" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M12 5v14M5 12h14" />
				</svg>
				Add photos & videos
			</button>
			<input
				ref={inputRef}
				className="upload-input"
				type="file"
				multiple
				accept="image/*,video/*"
				onChange={handleChange}
				tabIndex={-1}
				aria-hidden="true"
			/>
		</>
	);
}

function summary(items: QueueItem[]): string {
	const done = items.filter((item) => item.status === "done").length;
	const attention = items.filter(
		(item) => item.status === "failed" || item.status === "paused"
	).length;
	const pending = items.filter(
		(item) => item.status === "queued" || item.status === "uploading"
	).length;
	if (pending > 0) return `Uploading ${done + 1} of ${done + pending}`;
	if (attention > 0) return attention === 1 ? "1 needs attention" : `${attention} need attention`;
	return done === 1 ? "1 uploaded" : `All ${done} uploaded`;
}

function statusText(item: QueueItem): string {
	switch (item.status) {
		case "queued":
			return "Waiting";
		case "uploading":
			return `${Math.round(item.progress * 100)}%`;
		case "done":
			return "Uploaded";
		default:
			return item.error ?? "Upload failed";
	}
}

function KindIcon({ mediaType }: { mediaType: QueueItem["mediaType"] }) {
	return (
		<svg className="upload-kind" viewBox="0 0 24 24" aria-hidden="true">
			{mediaType === "video" ? (
				<>
					<rect x="2" y="6" width="14" height="12" rx="2" />
					<path d="M16 10l6-3v10l-6-3z" />
				</>
			) : (
				<>
					<rect x="3" y="3" width="18" height="18" rx="3" />
					<circle cx="9" cy="9" r="2" />
					<path d="M21 15l-5-5L5 21" />
				</>
			)}
		</svg>
	);
}

function TrayRow({ item, queue }: { item: QueueItem; queue: UploadQueueState }) {
	const problem = item.status === "failed" || item.status === "paused";
	const removable = item.status !== "uploading" && item.status !== "done";
	return (
		<li className={`upload-row upload-row-${item.status}`}>
			<KindIcon mediaType={item.mediaType} />
			<div className="upload-row-main">
				<span className="upload-name">{item.name}</span>
				<span className={problem ? "upload-status upload-status-problem" : "upload-status"}>
					{statusText(item)}
				</span>
				{item.status === "uploading" ? (
					<progress
						className="upload-progress"
						max={1}
						value={item.progress}
						aria-label={`Uploading ${item.name}`}
					/>
				) : null}
			</div>
			{problem && item.canRetry ? (
				<button type="button" className="upload-action" onClick={() => queue.retry(item.id)}>
					{item.status === "paused" ? "Resume" : "Retry"}
				</button>
			) : null}
			{removable ? (
				<button
					type="button"
					className="upload-remove"
					onClick={() => queue.remove(item.id)}
					aria-label={`Remove ${item.name}`}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true">
						<path d="M6 6l12 12M18 6L6 18" />
					</svg>
				</button>
			) : null}
		</li>
	);
}

export default function UploadTray({ queue }: { queue: UploadQueueState }) {
	const { items, active } = queue;
	if (items.length === 0) return null;
	const finished = items.some(
		(item) => item.status === "done" || (item.status === "failed" && !item.canRetry)
	);
	return (
		<section className="upload-tray" aria-label="Uploads">
			<header className="upload-tray-header">
				<p className="upload-summary" aria-live="polite">
					{summary(items)}
				</p>
				{!active && finished ? (
					<button type="button" className="upload-clear" onClick={queue.clearFinished}>
						Clear
					</button>
				) : null}
			</header>
			{active ? <p className="upload-note">Keep this page open until uploads finish.</p> : null}
			<ul className="upload-list">
				{items.map((item) => (
					<TrayRow key={item.id} item={item} queue={queue} />
				))}
			</ul>
		</section>
	);
}
