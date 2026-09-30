import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadError, type UploadStage, type UploadTask } from "../uploadItem";
import { createUploadQueue } from "../useUploadQueue";

vi.mock("../uploadItem", async () => {
	class MockUploadError extends Error {
		code: string;
		retryable: boolean;
		constructor(code: string, message: string) {
			super(message);
			this.code = code;
			this.retryable = code === "network" || code === "verify_failed";
		}
	}
	return { UploadError: MockUploadError, createUploadTask: vi.fn() };
});

type Controlled = UploadTask & {
	runs: number;
	resolve: () => void;
	reject: (error: unknown) => void;
	progress: (fraction: number) => void;
	aborted: number;
	discarded: number;
	currentStage: UploadStage;
};

function controlledTask(): Controlled {
	let resolveRun: () => void = () => {};
	let rejectRun: (error: unknown) => void = () => {};
	let report: (fraction: number) => void = () => {};
	const task: Controlled = {
		runs: 0,
		aborted: 0,
		discarded: 0,
		currentStage: "transfer",
		run(onProgress) {
			task.runs += 1;
			report = onProgress;
			return new Promise<void>((resolve, reject) => {
				resolveRun = resolve;
				rejectRun = reject;
			});
		},
		abort() {
			task.aborted += 1;
			rejectRun(new UploadError("network", "Aborted"));
		},
		async discard() {
			task.discarded += 1;
			task.abort();
		},
		stage: () => task.currentStage,
		resolve: () => resolveRun(),
		reject: (error) => rejectRun(error),
		progress: (fraction) => report(fraction),
	};
	return task;
}

function file(name: string, type = "image/jpeg"): File {
	return new File([new Uint8Array(4)], name, { type });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createUploadQueue", () => {
	let tasks: Controlled[];
	let clock: number;
	let queue: ReturnType<typeof createUploadQueue>;

	beforeEach(() => {
		tasks = [];
		clock = 1000;
		queue = createUploadQueue({
			createTask: () => {
				const task = controlledTask();
				tasks.push(task);
				return task;
			},
			now: () => clock,
		});
	});

	const statuses = () => queue.getItems().map((item) => item.status);

	it("runs two at a time and queues the rest", () => {
		queue.add([file("a.jpg"), file("b.jpg"), file("c.mp4", "video/mp4")]);
		expect(statuses()).toEqual(["uploading", "uploading", "queued"]);
		expect(queue.getItems()[2].mediaType).toBe("video");
		expect(queue.isActive()).toBe(true);
	});

	it("reports progress and starts the next item when one finishes", async () => {
		queue.add([file("a.jpg"), file("b.jpg"), file("c.jpg")]);
		tasks[0].progress(0.5);
		expect(queue.getItems()[0].progress).toBe(0.5);
		tasks[0].resolve();
		await flush();
		expect(statuses()).toEqual(["done", "uploading", "uploading"]);
		expect(queue.getItems()[0].progress).toBe(1);
	});

	it("marks failures without retrying automatically", async () => {
		queue.add([file("a.jpg")]);
		tasks[0].reject(new UploadError("network", "Connection lost"));
		await flush();
		expect(queue.getItems()[0]).toMatchObject({
			status: "failed",
			error: "Connection lost",
			canRetry: true,
		});
		expect(tasks[0].runs).toBe(1);
		expect(queue.isActive()).toBe(false);
	});

	it("retry reruns the same task", async () => {
		queue.add([file("a.jpg")]);
		tasks[0].reject(new UploadError("verify_failed", "Missing"));
		await flush();
		queue.retry(queue.getItems()[0].id);
		expect(statuses()).toEqual(["uploading"]);
		expect(tasks).toHaveLength(1);
		expect(tasks[0].runs).toBe(2);
		tasks[0].resolve();
		await flush();
		expect(statuses()).toEqual(["done"]);
	});

	it("does not offer retry for limit rejections", async () => {
		queue.add([file("a.mp4", "video/mp4")]);
		tasks[0].reject(new UploadError("too_long", "Video is 45 s, max is 30 s"));
		await flush();
		expect(queue.getItems()[0]).toMatchObject({
			status: "failed",
			error: "Video is 45 s, max is 30 s",
			canRetry: false,
		});
		queue.retry(queue.getItems()[0].id);
		expect(tasks[0].runs).toBe(1);
	});

	it("treats unknown errors as retryable failures", async () => {
		queue.add([file("a.jpg")]);
		tasks[0].reject(new Error("boom"));
		await flush();
		expect(queue.getItems()[0]).toMatchObject({ status: "failed", canRetry: true });
	});

	it("marks an upload paused when its request died while hidden", async () => {
		queue.add([file("a.jpg")]);
		queue.markHidden();
		tasks[0].reject(new UploadError("network", "Failed to fetch"));
		await flush();
		expect(queue.getItems()[0]).toMatchObject({ status: "paused", canRetry: true });
		expect(queue.isActive()).toBe(false);
		queue.retry(queue.getItems()[0].id);
		expect(statuses()).toEqual(["uploading"]);
		expect(tasks[0].runs).toBe(2);
	});

	it("pauses stalled in-flight uploads after returning", async () => {
		queue.add([file("a.jpg"), file("b.jpg")]);
		queue.markHidden();
		clock = 5000;
		queue.markVisible();
		tasks[1].progress(0.4);
		clock = 10000;
		queue.checkStalled();
		await flush();
		expect(tasks[0].aborted).toBe(1);
		expect(tasks[1].aborted).toBe(0);
		expect(statuses()).toEqual(["paused", "uploading"]);
	});

	it("does not pause items that are past the transfer stage", async () => {
		queue.add([file("a.jpg")]);
		tasks[0].currentStage = "record";
		queue.markHidden();
		clock = 5000;
		queue.markVisible();
		clock = 10000;
		queue.checkStalled();
		await flush();
		expect(tasks[0].aborted).toBe(0);
		expect(statuses()).toEqual(["uploading"]);
	});

	it("keeps uploads that finished while hidden", async () => {
		queue.add([file("a.jpg")]);
		queue.markHidden();
		tasks[0].resolve();
		await flush();
		expect(statuses()).toEqual(["done"]);
	});

	it("removes items and discards in-flight work", async () => {
		queue.add([file("a.jpg"), file("b.jpg"), file("c.jpg")]);
		queue.remove(queue.getItems()[0].id);
		await flush();
		expect(tasks[0].discarded).toBe(1);
		expect(statuses()).toEqual(["uploading", "uploading"]);
	});

	it("discards uploaded objects when a failed item is removed", async () => {
		queue.add([file("a.jpg")]);
		tasks[0].reject(new UploadError("network", "Connection lost"));
		await flush();
		queue.remove(queue.getItems()[0].id);
		expect(tasks[0].discarded).toBe(1);
		expect(statuses()).toEqual([]);
	});

	it("does not discard finished uploads when removed", async () => {
		queue.add([file("a.jpg")]);
		tasks[0].resolve();
		await flush();
		queue.remove(queue.getItems()[0].id);
		expect(tasks[0].discarded).toBe(0);
	});

	it("aborts in-flight uploads on dispose", async () => {
		queue.add([file("a.jpg"), file("b.jpg"), file("c.jpg")]);
		queue.dispose();
		await flush();
		expect(tasks.map((task) => task.aborted)).toEqual([1, 1, 0]);
		expect(tasks[2].runs).toBe(0);
		expect(statuses()).toEqual(["paused", "paused", "queued"]);
	});

	it("clears finished items only", async () => {
		queue.add([file("a.jpg"), file("b.jpg"), file("c.jpg")]);
		tasks[0].resolve();
		tasks[1].reject(new UploadError("rejected", "Not allowed"));
		await flush();
		queue.clearFinished();
		expect(statuses()).toEqual(["uploading"]);
	});

	it("notifies subscribers with a new snapshot", () => {
		const listener = vi.fn();
		queue.subscribe(listener);
		const before = queue.getItems();
		queue.add([file("a.jpg")]);
		expect(listener).toHaveBeenCalled();
		expect(queue.getItems()).not.toBe(before);
	});
});
