import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { fetchUploadLimits, type UploadLimits } from "./limits";
import { type MediaKind, resolveMedia } from "./paths";
import { createUploadTask, UploadError, type UploadTask } from "./uploadItem";

export type ItemStatus = "queued" | "uploading" | "paused" | "failed" | "done";

export type QueueItem = {
	id: string;
	name: string;
	mediaType: MediaKind | null;
	status: ItemStatus;
	progress: number;
	error: string | null;
	canRetry: boolean;
};

type Entry = {
	item: QueueItem;
	task: UploadTask;
	interrupted: boolean;
	lastProgressAt: number;
};

type QueueOptions = {
	createTask: (file: File) => UploadTask;
	concurrency?: number;
	now?: () => number;
};

const STALL_CHECK_MS = 5000;

export function createUploadQueue(options: QueueOptions) {
	const { createTask, concurrency = 2, now = Date.now } = options;
	const entries: Entry[] = [];
	const listeners = new Set<() => void>();
	let snapshot: QueueItem[] = [];
	let hidden = false;
	let visibleAt = 0;
	let counter = 0;
	let disposed = false;

	function emit() {
		snapshot = entries.map((entry) => entry.item);
		for (const listener of listeners) listener();
	}

	function update(entry: Entry, patch: Partial<QueueItem>) {
		entry.item = { ...entry.item, ...patch };
	}

	function start(entry: Entry) {
		update(entry, { status: "uploading", error: null, canRetry: false });
		entry.interrupted = hidden;
		entry.lastProgressAt = now();
		entry.task
			.run((fraction) => {
				if (entry.item.status !== "uploading") return;
				entry.lastProgressAt = now();
				entry.interrupted = hidden;
				update(entry, { progress: fraction });
				emit();
			})
			.then(
				() => {
					if (entry.item.status !== "uploading") return;
					update(entry, { status: "done", progress: 1 });
				},
				(error: unknown) => {
					if (entry.item.status !== "uploading") return;
					const uploadError = error instanceof UploadError ? error : null;
					const retryable = uploadError ? uploadError.retryable : true;
					const pause = retryable && (hidden || entry.interrupted);
					update(entry, {
						status: pause ? "paused" : "failed",
						error: pause
							? "Paused, tap to resume"
							: error instanceof Error
								? error.message
								: "Upload failed",
						canRetry: retryable,
					});
				}
			)
			.finally(() => {
				pump();
				emit();
			});
	}

	function pump() {
		if (disposed) return;
		let active = entries.filter((entry) => entry.item.status === "uploading").length;
		for (const entry of entries) {
			if (active >= concurrency) break;
			if (entry.item.status !== "queued") continue;
			start(entry);
			active += 1;
		}
	}

	function find(id: string) {
		return entries.find((entry) => entry.item.id === id);
	}

	return {
		add(files: File[]) {
			disposed = false;
			for (const file of files) {
				counter += 1;
				entries.push({
					item: {
						id: `${now()}-${counter}`,
						name: file.name,
						mediaType: resolveMedia(file.name, file.type)?.mediaType ?? null,
						status: "queued",
						progress: 0,
						error: null,
						canRetry: false,
					},
					task: createTask(file),
					interrupted: false,
					lastProgressAt: 0,
				});
			}
			pump();
			emit();
		},
		retry(id: string) {
			const entry = find(id);
			if (!entry || !entry.item.canRetry) return;
			if (entry.item.status !== "failed" && entry.item.status !== "paused") return;
			update(entry, { status: "queued", error: null, canRetry: false });
			disposed = false;
			pump();
			emit();
		},
		remove(id: string) {
			const index = entries.findIndex((entry) => entry.item.id === id);
			if (index === -1) return;
			const [entry] = entries.splice(index, 1);
			if (entry.item.status !== "done") {
				update(entry, { status: "failed" });
				void entry.task.discard().catch(() => undefined);
			}
			pump();
			emit();
		},
		clearFinished() {
			for (let index = entries.length - 1; index >= 0; index -= 1) {
				const { status, canRetry } = entries[index].item;
				if (status === "done" || (status === "failed" && !canRetry)) entries.splice(index, 1);
			}
			emit();
		},
		markHidden() {
			hidden = true;
			for (const entry of entries) {
				if (entry.item.status === "uploading") entry.interrupted = true;
			}
		},
		markVisible() {
			hidden = false;
			visibleAt = now();
		},
		checkStalled() {
			let changed = false;
			for (const entry of entries) {
				if (entry.item.status !== "uploading" || !entry.interrupted) continue;
				if (entry.task.stage() !== "transfer") continue;
				if (entry.lastProgressAt > visibleAt) continue;
				update(entry, { status: "paused", error: "Paused, tap to resume", canRetry: true });
				entry.task.abort();
				changed = true;
			}
			if (changed) {
				pump();
				emit();
			}
		},
		dispose() {
			disposed = true;
			for (const entry of entries) {
				if (entry.item.status !== "uploading") continue;
				update(entry, { status: "paused", error: "Paused, tap to resume", canRetry: true });
				entry.task.abort();
			}
			emit();
		},
		isActive() {
			return entries.some(
				(entry) => entry.item.status === "queued" || entry.item.status === "uploading"
			);
		},
		getItems() {
			return snapshot;
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

export type UploadQueue = ReturnType<typeof createUploadQueue>;

function useLimitsLoader(eventId: string) {
	const cached = useRef<Promise<UploadLimits> | null>(null);
	return useCallback(() => {
		if (!cached.current) {
			cached.current = fetchUploadLimits(eventId).catch((error: unknown) => {
				cached.current = null;
				throw error;
			});
		}
		return cached.current;
	}, [eventId]);
}

type WakeLockHandle = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & {
	wakeLock?: { request: (type: "screen") => Promise<WakeLockHandle> };
};

function useWakeLock(active: boolean) {
	useEffect(() => {
		const wakeLock = (navigator as WakeLockNavigator).wakeLock;
		if (!active || !wakeLock) return;
		let handle: WakeLockHandle | null = null;
		let disposed = false;
		const acquire = () => {
			if (document.visibilityState !== "visible") return;
			wakeLock
				.request("screen")
				.then((lock) => {
					if (disposed) void lock.release();
					else handle = lock;
				})
				.catch(() => undefined);
		};
		acquire();
		document.addEventListener("visibilitychange", acquire);
		return () => {
			disposed = true;
			document.removeEventListener("visibilitychange", acquire);
			void handle?.release().catch(() => undefined);
		};
	}, [active]);
}

function useLeaveWarning(active: boolean) {
	useEffect(() => {
		if (!active) return;
		const warn = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", warn);
		return () => window.removeEventListener("beforeunload", warn);
	}, [active]);
}

export function useUploadQueue(eventId: string, profileId: string) {
	const getLimits = useLimitsLoader(eventId);
	const queue = useMemo(
		() =>
			createUploadQueue({
				createTask: (file) => createUploadTask({ file, eventId, profileId, getLimits }),
			}),
		[eventId, profileId, getLimits]
	);
	const items = useSyncExternalStore(queue.subscribe, queue.getItems);
	const active = items.some((item) => item.status === "queued" || item.status === "uploading");

	useEffect(() => {
		getLimits().catch(() => undefined);
	}, [getLimits]);

	useEffect(() => () => queue.dispose(), [queue]);

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const onVisibility = () => {
			clearTimeout(timer);
			if (document.visibilityState === "hidden") {
				queue.markHidden();
				return;
			}
			queue.markVisible();
			timer = setTimeout(() => queue.checkStalled(), STALL_CHECK_MS);
		};
		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			clearTimeout(timer);
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [queue]);

	useWakeLock(active);
	useLeaveWarning(active);

	return {
		items,
		active,
		add: queue.add,
		retry: queue.retry,
		remove: queue.remove,
		clearFinished: queue.clearFinished,
	};
}

export type UploadQueueState = ReturnType<typeof useUploadQueue>;
