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
		await jest.advanceTimersByTimeAsync(70 * 1000);
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


	it("fails terminally on the first network drop (no auto-retry)", async () => {
		mockedUploadMedia.mockResolvedValueOnce({
			success: false,
			error: "Network hiccup during upload.",
			failureReason: "network",
		});

		const store = makeStore([makePendingUpload()]);
		await processUploadQueue(store.uploads, store.getLatest, store.update);
		await runPendingTimers();

		expect(mockedUploadMedia).toHaveBeenCalledTimes(1);
		expect(onComplete).not.toHaveBeenCalled();
		expect(onFailed).toHaveBeenCalledTimes(1);
		expect(onFailed).toHaveBeenCalledWith(
			expect.objectContaining({ id: "upload_chaos" }),
			"Network hiccup during upload.",
			"network"
		);
	});

	it("fails terminally on a thrown network error (no auto-retry)", async () => {
		mockedUploadMedia.mockRejectedValueOnce(new Error("Network request failed"));

		const store = makeStore([makePendingUpload()]);
		await processUploadQueue(store.uploads, store.getLatest, store.update);
		await runPendingTimers();

		expect(mockedUploadMedia).toHaveBeenCalledTimes(1);
		expect(onFailed).toHaveBeenCalledTimes(1);
		expect(onFailed).toHaveBeenCalledWith(
			expect.objectContaining({ id: "upload_chaos" }),
			"Network request failed",
			"network"
		);
	});

	it("fails terminally on a timeout (no auto-retry)", async () => {
		mockedUploadMedia.mockResolvedValueOnce({
			success: false,
			error: "Upload took too long. Reconnect to a stable network.",
			failureReason: "timeout",
		});

		const store = makeStore([makePendingUpload()]);
		await processUploadQueue(store.uploads, store.getLatest, store.update);
		await runPendingTimers();

		expect(mockedUploadMedia).toHaveBeenCalledTimes(1);
		expect(onFailed).toHaveBeenCalledTimes(1);
	});

	it("treats stale-profile storage failure as terminal", async () => {
		mockedUploadMedia.mockResolvedValueOnce({
			success: false,
			error: "Your session changed. Re-select the media and try again.",
			failureReason: "storage",
		});

		const store = makeStore([makePendingUpload()]);
		await processUploadQueue(store.uploads, store.getLatest, store.update);
		await runPendingTimers();

		expect(mockedUploadMedia).toHaveBeenCalledTimes(1);
		expect(onFailed).toHaveBeenCalledTimes(1);
	});

	it("disk-full surfaces as storage failure without retry", async () => {
		mockedUploadMedia.mockResolvedValueOnce({
			success: false,
			error: "Not enough free space on device.",
			failureReason: "storage",
		});

		const store = makeStore([makePendingUpload()]);
		await processUploadQueue(store.uploads, store.getLatest, store.update);
		await runPendingTimers();

		expect(mockedUploadMedia).toHaveBeenCalledTimes(1);
		expect(onFailed).toHaveBeenCalledTimes(1);
	});

	it("iCloud-unavailable (permission) surfaces as failure without retry", async () => {
		mockedUploadMedia.mockResolvedValueOnce({
			success: false,
			error: "This item is in iCloud and could not be downloaded.",
			failureReason: "permission",
		});

		const store = makeStore([makePendingUpload()]);
		await processUploadQueue(store.uploads, store.getLatest, store.update);
		await runPendingTimers();

		expect(mockedUploadMedia).toHaveBeenCalledTimes(1);
		expect(onFailed).toHaveBeenCalledTimes(1);
	});

	it("mixed batch: 3 succeed, 2 fail terminally on first attempt", async () => {
		const uploads = [
			makePendingUpload({ id: "u1", eventId: "evt1" }),
			makePendingUpload({ id: "u2", eventId: "evt2" }),
			makePendingUpload({ id: "u3", eventId: "evt3" }),
			makePendingUpload({ id: "u4", eventId: "evt4" }),
			makePendingUpload({ id: "u5", eventId: "evt5" }),
		];
		mockedUploadMedia.mockImplementation(async (opts: any) => {
			if (opts.eventId === "evt2" || opts.eventId === "evt4") {
				return {
					success: false,
					error: "Network hiccup.",
					failureReason: "network",
				};
			}
			return { success: true, path: `path-${opts.eventId}` };
		});

		const store = makeStore(uploads);
		await processUploadQueue(store.uploads, store.getLatest, store.update);
		await runPendingTimers();

		expect(mockedUploadMedia).toHaveBeenCalledTimes(5);
		expect(onComplete).toHaveBeenCalledTimes(3);
		expect(onFailed).toHaveBeenCalledTimes(2);
	});
});
