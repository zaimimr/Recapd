import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { resolveTimeZone } from "../../../kit/format";
import { countLabel } from "../gallery/mediaList";
import { createSignedUrlResolver, type StorageSigner } from "../gallery/signedUrls";
import { guestSupabase } from "../supabase";
import type { GuestEvent } from "../types";
import {
	type Batch,
	batchLabel,
	type DownloadItem,
	knownTotalBytes,
	pickZipDestination,
	planBatches,
	planZipParts,
	prepareBatch,
	progressPercent,
	saveZipPart,
	shouldStreamToDisk,
	type Tracker,
	zipName,
	zipPartName,
} from "./downloadAll";
import {
	createShareGate,
	downloadOriginal,
	fileNameFor,
	prefersShare,
	type SaveTarget,
	saveItem,
	shareFiles,
	uniqueNames,
} from "./saveItem";
import "./download.css";

type Stats = {
	done: number;
	total: number;
	bytes: number;
	totalBytes: number;
	failed: number;
	saved: number;
	skipped: number;
};

type SheetState =
	| {
			kind: "zip";
			phase: "running" | "next" | "done" | "error";
			parts: Batch[];
			part: number;
			name: string;
			retryPart: boolean;
	  }
	| {
			kind: "share";
			phase: "preparing" | "ready" | "sharing" | "done";
			batches: Batch[];
			index: number;
			retry: boolean;
	  }
	| { kind: "single"; phase: "preparing" | "ready" | "error"; noun: "photo" | "video" };

type Job = { items: DownloadItem[]; names: string[] };

const STATS_FLUSH_MS = 200;

const EMPTY_STATS: Stats = {
	done: 0,
	total: 0,
	bytes: 0,
	totalBytes: 0,
	failed: 0,
	saved: 0,
	skipped: 0,
};

function rangeText(batch: Batch, total: number): string {
	return batch.end - batch.start === 1
		? `${batch.end} of ${total}`
		: `${batch.start + 1}-${batch.end} of ${total}`;
}

function Sheet({
	title,
	children,
	onClose,
}: {
	title: string;
	children: ReactNode;
	onClose: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		ref.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
		return () => opener?.focus();
	}, []);

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		event.stopPropagation();
		if (event.key === "Escape") {
			event.preventDefault();
			onClose();
			return;
		}
		if (event.key !== "Tab" || !ref.current) return;
		const focusable = [...ref.current.querySelectorAll<HTMLElement>("button:not(:disabled)")];
		if (focusable.length === 0) {
			event.preventDefault();
			return;
		}
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	};

	return (
		<div className="download-backdrop">
			<div
				ref={ref}
				className="download-sheet"
				role="dialog"
				aria-modal="true"
				aria-labelledby="download-title"
				onKeyDown={onKeyDown}
			>
				<h2 id="download-title" className="download-title">
					{title}
				</h2>
				{children}
			</div>
		</div>
	);
}

function ProgressBar({ stats, label }: { stats: Stats; label: string }) {
	const percent = progressPercent(stats);
	return (
		<progress className="download-progress" max={100} value={percent} aria-label={label}>
			{percent}%
		</progress>
	);
}

function Summary({ stats, verb }: { stats: Stats; verb: string }) {
	return (
		<div className="download-summary" aria-live="polite">
			<p className="download-body">
				{countLabel(stats.saved, "item", "items")} {verb}.
			</p>
			{stats.failed > 0 && (
				<p className="download-problem">
					{countLabel(stats.failed, "item", "items")} could not be downloaded.
				</p>
			)}
			{stats.skipped > 0 && (
				<p className="download-body">{countLabel(stats.skipped, "item", "items")} skipped.</p>
			)}
		</div>
	);
}

type DownloadEvent = Pick<GuestEvent, "join_code" | "timezone">;

function useDownloads(event: DownloadEvent) {
	const resolver = useMemo(
		() => createSignedUrlResolver(guestSupabase.storage as unknown as StorageSigner),
		[]
	);
	const shareSingle = useMemo(() => createShareGate(), []);
	const timeZone = resolveTimeZone(event.timezone);
	const [state, setState] = useState<SheetState | null>(null);
	const [stats, setStats] = useState<Stats>(EMPTY_STATS);
	const statsRef = useRef<Stats>(EMPTY_STATS);
	const abortRef = useRef<AbortController | null>(null);
	const filesRef = useRef<File[]>([]);
	const jobRef = useRef<Job | null>(null);
	const lastItems = useRef<DownloadItem[]>([]);
	const partStartStats = useRef<Stats>(EMPTY_STATS);
	const active = state !== null;

	useEffect(() => () => abortRef.current?.abort(), []);

	useEffect(() => {
		if (!active) return;
		const timer = setInterval(() => setStats({ ...statsRef.current }), STATS_FLUSH_MS);
		return () => clearInterval(timer);
	}, [active]);

	const flush = () => setStats({ ...statsRef.current });

	const begin = (items: DownloadItem[]) => {
		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;
		filesRef.current = [];
		statsRef.current = {
			...EMPTY_STATS,
			total: items.length,
			totalBytes: knownTotalBytes(items),
		};
		flush();
		return controller;
	};

	const tracker = (controller: AbortController): Tracker => ({
		onBytes: (bytes) => {
			if (!controller.signal.aborted) statsRef.current.bytes += bytes;
		},
		onItemDone: () => {
			if (!controller.signal.aborted) statsRef.current.done += 1;
		},
		onItemFailed: () => {
			if (!controller.signal.aborted) statsRef.current.failed += 1;
		},
	});

	const close = () => {
		abortRef.current?.abort();
		abortRef.current = null;
		filesRef.current = [];
		jobRef.current = null;
		setState(null);
	};

	const deps = (controller: AbortController) => ({
		originalUrl: resolver.original,
		signal: controller.signal,
	});

	const prepare = async (batches: Batch[], index: number, controller: AbortController) => {
		const job = jobRef.current;
		if (!job || controller.signal.aborted) return;
		if (index >= batches.length) {
			flush();
			setState({ kind: "share", phase: "done", batches, index, retry: false });
			return;
		}
		setState({ kind: "share", phase: "preparing", batches, index, retry: false });
		const { start, end } = batches[index];
		const files = await prepareBatch(
			job.items.slice(start, end),
			job.names.slice(start, end),
			deps(controller),
			tracker(controller)
		);
		if (controller.signal.aborted) return;
		flush();
		if (files.length === 0) {
			void prepare(batches, index + 1, controller);
			return;
		}
		filesRef.current = files;
		setState({ kind: "share", phase: "ready", batches, index, retry: false });
	};

	const saveBatch = () => {
		if (state?.kind !== "share" || state.phase !== "ready") return;
		const controller = abortRef.current;
		const files = filesRef.current;
		if (!controller || files.length === 0) return;
		const current = state;
		setState({ ...current, phase: "sharing" });
		void shareFiles(files).then((outcome) => {
			if (controller.signal.aborted) return;
			if (outcome === "cancelled" || outcome === "needs_tap") {
				setState({ ...current, phase: "ready", retry: true });
				return;
			}
			if (outcome === "shared") statsRef.current.saved += files.length;
			else statsRef.current.failed += files.length;
			filesRef.current = [];
			void prepare(current.batches, current.index + 1, controller);
		});
	};

	const skipBatch = () => {
		if (state?.kind !== "share" || state.phase !== "ready" || !abortRef.current) return;
		statsRef.current.skipped += filesRef.current.length;
		filesRef.current = [];
		void prepare(state.batches, state.index + 1, abortRef.current);
	};

	const runPart = async (
		parts: Batch[],
		part: number,
		controller: AbortController,
		handle?: FileSystemFileHandle
	) => {
		const job = jobRef.current;
		if (!job || controller.signal.aborted) return;
		const { start, end } = parts[part];
		const name = zipPartName(event.join_code, part, parts.length);
		const zip = { kind: "zip" as const, parts, part, name, retryPart: false };
		partStartStats.current = { ...statsRef.current };
		setState({ ...zip, phase: "running" });
		try {
			const entries = await saveZipPart(
				job.items.slice(start, end),
				job.names.slice(start, end),
				name,
				deps(controller),
				tracker(controller),
				{ handle }
			);
			if (controller.signal.aborted) return;
			statsRef.current.saved = statsRef.current.done;
			flush();
			if (part + 1 < parts.length) {
				if (entries === 0) void runPart(parts, part + 1, controller);
				else setState({ ...zip, phase: "next" });
				return;
			}
			setState({ ...zip, phase: statsRef.current.saved > 0 ? "done" : "error" });
		} catch {
			if (controller.signal.aborted) return;
			flush();
			setState({ ...zip, phase: "error", retryPart: parts.length > 1 });
		}
	};

	const runZip = (items: DownloadItem[]) => {
		const destination = shouldStreamToDisk(items)
			? pickZipDestination(zipName(event.join_code))
			: null;
		const controller = begin(items);
		if (!jobRef.current) return;
		setState({
			kind: "zip",
			phase: "running",
			parts: [],
			part: 0,
			name: zipName(event.join_code),
			retryPart: false,
		});
		void (async () => {
			let handle: FileSystemFileHandle | undefined;
			if (destination) {
				try {
					handle = await destination;
				} catch (error) {
					if (error instanceof DOMException && error.name === "AbortError") {
						close();
						return;
					}
				}
			}
			const parts = handle ? [{ start: 0, end: items.length }] : planZipParts(items);
			await runPart(parts, 0, controller, handle);
		})();
	};

	const nextPart = () => {
		const controller = abortRef.current;
		if (state?.kind !== "zip" || state.phase !== "next" || !controller) return;
		void runPart(state.parts, state.part + 1, controller);
	};

	const retryZip = () => {
		const controller = abortRef.current;
		if (state?.kind !== "zip") return;
		if (state.retryPart && controller) {
			statsRef.current = { ...partStartStats.current };
			flush();
			void runPart(state.parts, state.part, controller);
			return;
		}
		runZip(lastItems.current);
	};

	const downloadAll = (items: DownloadItem[]) => {
		if (items.length === 0) return;
		lastItems.current = items;
		jobRef.current = {
			items,
			names: uniqueNames(items.map((item) => fileNameFor(item, timeZone))),
		};
		if (!prefersShare()) {
			runZip(items);
			return;
		}
		const controller = begin(items);
		void prepare(planBatches(items), 0, controller);
	};

	const saveOne = (item: SaveTarget) => {
		const name = fileNameFor(item, timeZone);
		const noun = item.media_type === "video" ? "video" : "photo";
		if (!prefersShare()) {
			downloadOriginal(item, name, resolver.original).catch(() =>
				setState({ kind: "single", phase: "error", noun })
			);
			return;
		}
		const controller = begin([item]);
		jobRef.current = null;
		setState({ kind: "single", phase: "preparing", noun });
		saveItem(item, name, { ...deps(controller), share: true })
			.then(({ outcome, file }) => {
				if (controller.signal.aborted) return;
				if (outcome === "needs_tap" && file) {
					filesRef.current = [file];
					setState({ kind: "single", phase: "ready", noun });
				} else if (outcome === "failed") {
					setState({ kind: "single", phase: "error", noun });
				} else {
					close();
				}
			})
			.catch(() => {
				if (!controller.signal.aborted) setState({ kind: "single", phase: "error", noun });
			});
	};

	const saveSingle = () => {
		if (state?.kind !== "single" || filesRef.current.length === 0) return;
		const noun = state.noun;
		void shareSingle(filesRef.current).then((outcome) => {
			if (outcome === "busy" || outcome === "needs_tap") return;
			if (outcome === "failed") setState({ kind: "single", phase: "error", noun });
			else close();
		});
	};

	let sheet: ReactNode = null;
	if (state?.kind === "zip") {
		const running = state.phase === "running";
		const total = state.parts.length;
		const split = total > 1;
		const partText = `part ${state.part + 1} of ${total}`;
		sheet = (
			<Sheet
				title={
					running
						? split
							? `Downloading ${partText}`
							: "Downloading everything"
						: state.phase === "next"
							? `Part ${state.part + 1} of ${total} saved`
							: state.phase === "done"
								? "Download complete"
								: "Download stopped"
				}
				onClose={close}
			>
				{running && (
					<>
						<p className="download-body">
							Building {state.name} with{" "}
							{countLabel(
								split ? state.parts[state.part].end - state.parts[state.part].start : stats.total,
								"item",
								"items"
							)}
							. Keep this tab open until it is saved.
						</p>
						<ProgressBar stats={stats} label="Download progress" />
						<p className="download-status" aria-live="polite">
							{Math.min(stats.done + stats.failed + 1, stats.total)} of {stats.total}
							{stats.failed > 0 ? ` · ${stats.failed} failed` : ""}
						</p>
					</>
				)}
				{state.phase === "next" && (
					<>
						<p className="download-body">
							This gallery is big, so it comes in {total} ZIP files. Tap to download the next one.
						</p>
						<ProgressBar stats={stats} label="Download progress" />
						<p className="download-status" aria-live="polite">
							{countLabel(stats.saved, "item", "items")} saved of {stats.total}
							{stats.failed > 0 ? ` · ${stats.failed} failed` : ""}
						</p>
					</>
				)}
				{state.phase === "done" && (
					<Summary
						stats={stats}
						verb={split ? `saved in ${total} ZIP files` : `saved to ${state.name}`}
					/>
				)}
				{state.phase === "error" && (
					<p className="download-problem" role="alert">
						We could not build the ZIP. Check your connection and try again.
					</p>
				)}
				<div className="download-actions">
					{state.phase === "next" && (
						<button type="button" className="download-primary" onClick={nextPart}>
							Download part {state.part + 2} of {total}
						</button>
					)}
					{state.phase === "error" && (
						<button type="button" className="download-primary" onClick={retryZip}>
							Try again
						</button>
					)}
					<button
						type="button"
						className={state.phase === "done" ? "download-primary" : "download-secondary"}
						onClick={close}
					>
						{running
							? "Cancel"
							: state.phase === "done"
								? "Done"
								: state.phase === "next"
									? "Stop"
									: "Close"}
					</button>
				</div>
			</Sheet>
		);
	} else if (state?.kind === "share") {
		const batch = state.batches[state.index];
		const done = state.phase === "done";
		const clean = stats.failed === 0 && stats.skipped === 0;
		sheet = (
			<Sheet
				title={done ? (clean ? "All saved" : "Finished") : "Save to your phone"}
				onClose={close}
			>
				{done ? (
					<Summary stats={stats} verb="saved" />
				) : (
					<>
						<p className="download-body" aria-live="polite">
							{state.phase === "preparing"
								? `Getting ${rangeText(batch, stats.total)} ready`
								: state.retry
									? "Not saved yet. Tap to open the share sheet again."
									: "Tap below and choose Save in the share sheet."}
						</p>
						<ProgressBar
							stats={
								state.phase === "preparing"
									? stats
									: {
											...stats,
											done: stats.saved + stats.failed + stats.skipped,
											bytes: 0,
											totalBytes: 0,
										}
							}
							label="Save progress"
						/>
						<p className="download-status">
							{countLabel(stats.saved, "item", "items")} saved of {stats.total}
							{stats.failed > 0 ? ` · ${stats.failed} failed` : ""}
						</p>
					</>
				)}
				<div className="download-actions">
					{!done && (
						<button
							type="button"
							className="download-primary"
							onClick={saveBatch}
							disabled={state.phase !== "ready"}
						>
							{state.phase === "preparing"
								? "Preparing…"
								: state.phase === "sharing"
									? "Saving…"
									: batchLabel(batch, stats.total)}
						</button>
					)}
					{state.phase === "ready" && (
						<button type="button" className="download-secondary" onClick={skipBatch}>
							Skip these
						</button>
					)}
					<button
						type="button"
						className={done ? "download-primary" : "download-secondary"}
						onClick={close}
					>
						{done ? "Done" : "Stop"}
					</button>
				</div>
			</Sheet>
		);
	} else if (state?.kind === "single") {
		sheet = (
			<Sheet
				title={
					state.phase === "preparing"
						? `Getting your ${state.noun}`
						: state.phase === "ready"
							? `Your ${state.noun} is ready`
							: "Could not save"
				}
				onClose={close}
			>
				{state.phase === "preparing" && (
					<output className="download-spinner" aria-label={`Getting your ${state.noun}`} />
				)}
				{state.phase === "error" && (
					<p className="download-problem" role="alert">
						Could not save this {state.noun}. Check your connection and try again.
					</p>
				)}
				<div className="download-actions">
					{state.phase === "ready" && (
						<button type="button" className="download-primary" onClick={saveSingle}>
							Save {state.noun}
						</button>
					)}
					<button type="button" className="download-secondary" onClick={close}>
						{state.phase === "preparing" ? "Cancel" : "Close"}
					</button>
				</div>
			</Sheet>
		);
	}

	return { saveOne, downloadAll, sheet };
}

export type DownloadHandlers = {
	saveOne: (item: SaveTarget) => void;
	downloadAll: (items: DownloadItem[]) => void;
};

export default function DownloadSheet({
	event,
	children,
}: {
	event: DownloadEvent;
	children: (handlers: DownloadHandlers) => ReactNode;
}) {
	const { saveOne, downloadAll, sheet } = useDownloads(event);
	return (
		<>
			{children({ saveOne, downloadAll })}
			{sheet}
		</>
	);
}
