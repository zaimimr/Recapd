jest.mock("@/lib/storage", () => ({ uploadMedia: jest.fn() }));

import { uploadMedia } from "@/lib/storage";
import {
	type PendingUpload,
	processUploadQueue,
	setUploadCallbacks,
} from "@/lib/uploadQueue";

const mockedUploadMedia = uploadMedia as jest.MockedFunction<typeof uploadMedia>;

function makePendingUpload(overrides: Partial<PendingUpload> = {}): PendingUpload {
	return {
		id: "upload_chaos",
		localUri: "file:///photo.jpg",
		eventId: "event1",
		userId: "user1",
		capturedAt: new Date("2026-01-01"),
		width: 1920,
		height: 1080,
		status: "pending",
		retryCount: 0,
		mediaType: "photo",
		...overrides,
	};
}

type StoreState = { uploads: PendingUpload[] };

function makeStore(initial: PendingUpload[]): StoreState & {
	getLatest: () => PendingUpload[];
	update: (id: string, updates: Partial<PendingUpload>) => void;
} {
	const state: StoreState = { uploads: initial };
	return {
		uploads: state.uploads,
		getLatest: () => state.uploads,
		update: (id, updates) => {
			state.uploads = state.uploads.map((u) => (u.id === id ? { ...u, ...updates } : u));
		},
	};
}

async function runPendingTimers() {
	for (let i = 0; i < 100; i++) {
		const ran = await jest.advanceTimersByTimeAsync(70 * 1000);
		if (!ran) break;
	}
}

describe("upload chaos scenarios", () => {
	let onComplete: jest.Mock;
	let onFailed: jest.Mock;

	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		onComplete = jest.fn();
		onFailed = jest.fn();
		setUploadCallbacks({
			onComplete,
			onFailed,
			onStatusChange: jest.fn(),
		});
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("recovers from a transient network drop on the first attempt", async () => {
		mockedUploadMedia
			.mockResolvedValueOnce({
				success: false,
				error: "Network hiccup during upload. We'll retry automatically.",
				failureReason: "network",
			})
			.mockResolvedValue({ success: true, path: "ok/path" });

		const store = makeStore([makePendingUpload()]);
		const run = processUploadQueue(store.uploads, store.getLatest, store.update);
		await runPendingTimers();
		await run;

		expect(mockedUploadMedia).toHaveBeenCalledTimes(2);
		expect(onComplete).toHaveBeenCalledTimes(1);
		expect(onFailed).not.toHaveBeenCalled();
	});

	it("recovers from a 503 burst then a thrown network error then success", async () => {
		mockedUploadMedia
			.mockResolvedValueOnce({
				success: false,
				error: "Service Unavailable",
				failureReason: "network",
			})
			.mockRejectedValueOnce(new Error("Network request failed"))
			.mockResolvedValue({ success: true, path: "ok/path" });

		const store = makeStore([makePendingUpload()]);
		const run = processUploadQueue(store.uploads, store.getLatest, store.update);
		await runPendingTimers();
		await run;

		expect(mockedUploadMedia).toHaveBeenCalledTimes(3);
		expect(onComplete).toHaveBeenCalledTimes(1);
	});

	it("gives up after MAX_RETRIES on persistent network error and calls onFailed once", async () => {
		mockedUploadMedia.mockResolvedValue({
			success: false,
			error: "Network down",
			failureReason: "network",
		});

		const store = makeStore([makePendingUpload()]);
		const run = processUploadQueue(store.uploads, store.getLatest, store.update);
		await runPendingTimers();
		await run;

		expect(mockedUploadMedia).toHaveBeenCalledTimes(4);
		expect(onFailed).toHaveBeenCalledTimes(1);
		expect(onComplete).not.toHaveBeenCalled();
	});

	it("treats stale-profile storage failure as terminal (no retry)", async () => {
		mockedUploadMedia.mockResolvedValue({
			success: false,
			error: "Your session changed. Re-select the media and try again.",
			failureReason: "storage",
		});

		const store = makeStore([makePendingUpload()]);
		const run = processUploadQueue(store.uploads, store.getLatest, store.update);
		await runPendingTimers();
		await run;

		expect(mockedUploadMedia).toHaveBeenCalledTimes(1);
		expect(onFailed).not.toHaveBeenCalled();
	});

	it("disk-full surfaces as storage failure without retry", async () => {
		mockedUploadMedia.mockResolvedValue({
			success: false,
			error: "Not enough free space on device. Need 600MB, have 120MB free.",
			failureReason: "storage",
		});

		const store = makeStore([makePendingUpload({ mediaType: "video", duration: 30000 })]);
		const run = processUploadQueue(store.uploads, store.getLatest, store.update);
		await runPendingTimers();
		await run;

		expect(mockedUploadMedia).toHaveBeenCalledTimes(1);
		expect(onFailed).not.toHaveBeenCalled();
	});

	it("iCloud-unavailable surfaces as storage failure without retry", async () => {
		mockedUploadMedia.mockResolvedValue({
			success: false,
			error:
				"This item is in iCloud and could not be downloaded. Open it in Photos first, then retry.",
			failureReason: "storage",
		});

		const store = makeStore([makePendingUpload()]);
		const run = processUploadQueue(store.uploads, store.getLatest, store.update);
		await runPendingTimers();
		await run;

		expect(mockedUploadMedia).toHaveBeenCalledTimes(1);
		expect(onFailed).not.toHaveBeenCalled();
	});

	it("recovers a timeout-then-success sequence", async () => {
		mockedUploadMedia
			.mockResolvedValueOnce({
				success: false,
				error:
					"Upload took too long. Reconnect to a stable network and we'll retry automatically.",
				failureReason: "timeout",
			})
			.mockResolvedValue({ success: true, path: "ok/path" });

		const store = makeStore([makePendingUpload({ mediaType: "video", duration: 30000 })]);
		const run = processUploadQueue(store.uploads, store.getLatest, store.update);
		await runPendingTimers();
		await run;

		expect(mockedUploadMedia).toHaveBeenCalledTimes(2);
		expect(onComplete).toHaveBeenCalledTimes(1);
	});

	it("mixed batch: 3 succeed instantly, 2 recover after one network blip", async () => {
		const callCounts: Record<string, number> = {};
		mockedUploadMedia.mockImplementation(async (opts: any) => {
			const id = opts.eventId;
			callCounts[id] = (callCounts[id] ?? 0) + 1;
			if ((id === "flaky_a" || id === "flaky_b") && callCounts[id] === 1) {
				return {
					success: false,
					error: "Network hiccup",
					failureReason: "network",
				};
			}
			return { success: true, path: `path_${id}` };
		});

		const uploads = [
			makePendingUpload({ id: "u1", eventId: "ok_1" }),
			makePendingUpload({ id: "u2", eventId: "flaky_a" }),
			makePendingUpload({ id: "u3", eventId: "ok_2" }),
			makePendingUpload({ id: "u4", eventId: "flaky_b" }),
			makePendingUpload({ id: "u5", eventId: "ok_3" }),
		];
		const store = makeStore(uploads);
		const run = processUploadQueue(store.uploads, store.getLatest, store.update);
		await runPendingTimers();
		await run;

		expect(onComplete).toHaveBeenCalledTimes(5);
		expect(onFailed).not.toHaveBeenCalled();
		expect(callCounts.flaky_a).toBe(2);
		expect(callCounts.flaky_b).toBe(2);
		expect(callCounts.ok_1).toBe(1);
	});

	it("permanent failure on one upload does not block siblings", async () => {
		mockedUploadMedia.mockImplementation(async (opts: any) => {
			if (opts.eventId === "doomed") {
				return {
					success: false,
					error: "Network down",
					failureReason: "network",
				};
			}
			return { success: true, path: `path_${opts.eventId}` };
		});

		const uploads = [
			makePendingUpload({ id: "u1", eventId: "ok_1" }),
			makePendingUpload({ id: "u2", eventId: "doomed" }),
			makePendingUpload({ id: "u3", eventId: "ok_2" }),
		];
		const store = makeStore(uploads);
		const run = processUploadQueue(store.uploads, store.getLatest, store.update);
		await runPendingTimers();
		await run;

		expect(onComplete).toHaveBeenCalledTimes(2);
		expect(onFailed).toHaveBeenCalledTimes(1);
	});
});
