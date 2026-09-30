import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeThumbnail } from "../thumbnail";
import { createUploadTask, UploadError } from "../uploadItem";

type TusOptions = {
	metadata: { objectName: string };
	onSuccess?: () => void;
	onError?: (error: Error) => void;
	onProgress?: (sent: number, total: number) => void;
};

const mocks = vi.hoisted(() => ({
	tusInstances: [] as { options: TusOptions; url: string | null; starts: number }[],
	terminated: [] as string[],
	storageRemoves: [] as { bucket: string; paths: string[] }[],
	thumbnailUploads: [] as string[],
	infoResults: [] as { data: { size: number } | null; error: { status: number } | null }[],
	inserts: [] as Record<string, unknown>[],
	insertResult: null as
		| null
		| (() => Promise<{ error: { code?: string; message: string } | null }>),
}));

vi.mock("tus-js-client", () => {
	class Upload {
		options: TusOptions;
		url: string | null = null;
		starts = 0;
		constructor(_file: unknown, options: TusOptions) {
			this.options = options;
			mocks.tusInstances.push(this);
		}
		start() {
			this.starts += 1;
			this.url = `https://tus/${this.options.metadata.objectName}`;
			queueMicrotask(() => this.options.onSuccess?.());
		}
		abort() {
			return Promise.resolve();
		}
		static terminate(url: string) {
			mocks.terminated.push(url);
			return Promise.resolve();
		}
	}
	class DetailedError extends Error {}
	return { Upload, DetailedError };
});

vi.mock("../../supabase", () => {
	const storageBucket = (bucket: string) => ({
		upload: async (path: string) => {
			mocks.thumbnailUploads.push(path);
			return { data: { path }, error: null };
		},
		info: async () => mocks.infoResults.shift() ?? { data: { size: 4 }, error: null },
		remove: async (paths: string[]) => {
			mocks.storageRemoves.push({ bucket, paths });
			return { data: [], error: null };
		},
	});
	return {
		guestSupabase: {
			auth: {
				getSession: async () => ({
					data: { session: { access_token: "token", expires_at: 4102444800 } },
				}),
				refreshSession: async () => ({ data: { session: null } }),
			},
			storage: { from: storageBucket },
			from: () => ({
				insert: (row: Record<string, unknown>) => {
					mocks.inserts.push(row);
					return mocks.insertResult ? mocks.insertResult() : Promise.resolve({ error: null });
				},
				select: () => ({
					eq: (_column: string, value: string) => ({
						maybeSingle: async () => ({
							data: mocks.inserts.some((row) => row.storage_path === value) ? { id: "x" } : null,
							error: null,
						}),
					}),
				}),
			}),
		},
	};
});

vi.mock("../metadata", () => ({
	readMetadata: async () => ({
		width: 10,
		height: 10,
		durationMs: null,
		capturedAt: new Date("2026-09-30T12:00:00Z"),
	}),
}));

vi.mock("../thumbnail", () => ({ makeThumbnail: vi.fn(async () => null) }));

const limits = async () => ({ maxFileSizeBytes: 1024, maxVideoDurationMs: 30000 });
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function newTask() {
	const file = new File([new Uint8Array(4)], "a.jpg", { type: "image/jpeg" });
	return createUploadTask({ file, eventId: "ev", profileId: "pr", getLimits: limits });
}

beforeEach(() => {
	mocks.tusInstances.length = 0;
	mocks.terminated.length = 0;
	mocks.storageRemoves.length = 0;
	mocks.thumbnailUploads.length = 0;
	mocks.infoResults.length = 0;
	mocks.inserts.length = 0;
	mocks.insertResult = null;
	vi.mocked(makeThumbnail).mockResolvedValue(null);
});

describe("createUploadTask", () => {
	it("uploads, verifies and records once", async () => {
		const task = newTask();
		await task.run(() => {});
		expect(mocks.inserts).toHaveLength(1);
		expect(mocks.inserts[0]).toMatchObject({
			event_id: "ev",
			uploaded_by_user_id: "pr",
			media_type: "photo",
			file_size_bytes: 4,
			visibility: "shared",
		});
		expect(String(mocks.inserts[0].storage_path)).toMatch(/^ev\/pr\/\d+_[a-z0-9]{8}\.jpg$/);
		expect(task.stage()).toBe("idle");
	});

	it("inserts exactly once when retried while the previous run is still inserting", async () => {
		let finishInsert: (value: { error: null }) => void = () => {};
		mocks.insertResult = () =>
			new Promise((resolve) => {
				finishInsert = resolve;
			});
		const task = newTask();
		const first = task.run(() => {});
		while (mocks.inserts.length === 0) await flush();
		expect(task.stage()).toBe("record");
		task.abort();
		await expect(first).rejects.toBeInstanceOf(UploadError);
		mocks.insertResult = null;
		const second = task.run(() => {});
		await flush();
		finishInsert({ error: null });
		await second;
		expect(mocks.inserts).toHaveLength(1);
	});

	it("reports the transfer stage while TUS is running", async () => {
		const task = newTask();
		const run = task.run(() => {});
		const stages: string[] = [];
		for (let index = 0; index < 20; index += 1) {
			stages.push(task.stage());
			await Promise.resolve();
		}
		await run;
		expect(stages).toContain("transfer");
	});

	it("removes a size-mismatched original and retries on a fresh path", async () => {
		mocks.infoResults.push({ data: { size: 3 }, error: null });
		const task = newTask();
		await expect(task.run(() => {})).rejects.toMatchObject({ code: "verify_failed" });
		const badPath = mocks.tusInstances[0].options.metadata.objectName;
		expect(mocks.storageRemoves).toContainEqual({ bucket: "event-photos", paths: [badPath] });
		await task.run(() => {});
		expect(mocks.tusInstances).toHaveLength(2);
		const goodPath = mocks.tusInstances[1].options.metadata.objectName;
		expect(goodPath).not.toBe(badPath);
		expect(mocks.inserts).toHaveLength(1);
		expect(mocks.inserts[0].storage_path).toBe(goodPath);
	});

	it("deletes the original and thumbnail when a failed upload is discarded", async () => {
		vi.mocked(makeThumbnail).mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }));
		mocks.infoResults.push({ data: null, error: { status: 0 } });
		const task = newTask();
		await expect(task.run(() => {})).rejects.toMatchObject({ code: "network" });
		const original = mocks.tusInstances[0].options.metadata.objectName;
		await task.discard();
		expect(mocks.storageRemoves).toEqual([
			{ bucket: "event-photos", paths: [original] },
			{ bucket: "thumbnails", paths: [original.replace(/\.jpg$/, "_thumb.jpg")] },
		]);
	});

	it("keeps objects when a recorded upload is discarded", async () => {
		const task = newTask();
		await task.run(() => {});
		await task.discard();
		expect(mocks.storageRemoves).toEqual([]);
	});
});
