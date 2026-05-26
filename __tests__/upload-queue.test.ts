jest.mock("@/lib/storage", () => ({ uploadMedia: jest.fn() }));

import { uploadMedia } from "@/lib/storage";
import {
	computeRetryDelayMs,
	generateUploadId,
	type PendingUpload,
	processUpload,
	processUploadQueue,
	setUploadCallbacks,
} from "@/lib/uploadQueue";

const mockedUploadMedia = uploadMedia as jest.MockedFunction<typeof uploadMedia>;

function makePendingUpload(overrides: Partial<PendingUpload> = {}): PendingUpload {
	return {
		id: "upload_123",
		localUri: "file:///photo.jpg",
		eventId: "event1",
		userId: "user1",
		capturedAt: new Date("2025-01-01"),
		width: 1920,
		height: 1080,
		status: "pending",
		retryCount: 0,
		mediaType: "photo",
		...overrides,
	};
}

describe("uploadQueue", () => {
	let onComplete: jest.Mock;
	let onFailed: jest.Mock;
	let onStatusChangeCb: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
		onComplete = jest.fn();
		onFailed = jest.fn();
		onStatusChangeCb = jest.fn();
		setUploadCallbacks({
			onComplete,
			onFailed,
			onStatusChange: onStatusChangeCb,
		});
	});

	describe("processUpload", () => {
		it("calls onStatusChange with syncing, then onUploadComplete on success", async () => {
			mockedUploadMedia.mockResolvedValue({ success: true, path: "some/path" });

			const upload = makePendingUpload();
			const result = await processUpload(upload);

			expect(result).toEqual({ success: true, retryable: false });
			expect(onStatusChangeCb).toHaveBeenCalledWith(
				"upload_123",
				expect.objectContaining({ status: "syncing" })
			);
			expect(onComplete).toHaveBeenCalledWith(upload, { success: true, path: "some/path" });
			expect(onFailed).not.toHaveBeenCalled();
		});

		it("returns false and calls onStatusChange(failed) when below max retries", async () => {
			mockedUploadMedia.mockResolvedValue({ success: false, error: "fail" });

			const upload = makePendingUpload({ retryCount: 1 });
			const result = await processUpload(upload);

			expect(result).toEqual({ success: false, retryable: true });
			expect(onStatusChangeCb).toHaveBeenCalledWith(
				"upload_123",
				expect.objectContaining({ status: "syncing" })
			);
			expect(onStatusChangeCb).toHaveBeenCalledWith(
				"upload_123",
				expect.objectContaining({ status: "failed" })
			);
			expect(onFailed).not.toHaveBeenCalled();
		});

		it("calls onUploadFailed when retryCount >= MAX_RETRIES", async () => {
			mockedUploadMedia.mockResolvedValue({ success: false, error: "permanent fail" });

			const upload = makePendingUpload({ retryCount: 3 });
			const result = await processUpload(upload);

			expect(result).toEqual({ success: false, retryable: true });
			expect(onFailed).toHaveBeenCalledWith(upload, "permanent fail", "unknown");
			expect(onStatusChangeCb).toHaveBeenCalledWith(
				"upload_123",
				expect.objectContaining({ status: "syncing" })
			);
		});

		it("marks storage authorization failures as non-retryable", async () => {
			mockedUploadMedia.mockResolvedValue({
				success: false,
				error: "Your session changed. Re-select the media and try again.",
				failureReason: "storage",
			});

			const result = await processUpload(makePendingUpload());

			expect(result).toEqual({ success: false, retryable: false });
		});

		it("marks network failures as retryable", async () => {
			mockedUploadMedia.mockResolvedValue({
				success: false,
				error: "Network hiccup during upload. We'll retry automatically.",
				failureReason: "network",
			});

			const result = await processUpload(makePendingUpload());

			expect(result).toEqual({ success: false, retryable: true });
		});

		it("classifies thrown network errors as network failureReason", async () => {
			mockedUploadMedia.mockRejectedValue(new Error("Network request failed"));

			const result = await processUpload(makePendingUpload({ retryCount: 3 }));

			expect(result).toEqual({ success: false, retryable: true });
			expect(onFailed).toHaveBeenCalledWith(
				expect.objectContaining({ id: "upload_123" }),
				"Network request failed",
				"network"
			);
		});
	});

	describe("computeRetryDelayMs", () => {
		const originalRandom = Math.random;

		afterEach(() => {
			Math.random = originalRandom;
		});

		it("grows exponentially with attempt number", () => {
			Math.random = () => 0;
			expect(computeRetryDelayMs(0)).toBe(1000);
			expect(computeRetryDelayMs(1)).toBe(2000);
			expect(computeRetryDelayMs(2)).toBe(4000);
			expect(computeRetryDelayMs(3)).toBe(8000);
		});

		it("caps delay at 60 seconds", () => {
			Math.random = () => 0.999999;
			expect(computeRetryDelayMs(100)).toBe(60_000);
		});

		it("adds jitter up to base delay", () => {
			Math.random = () => 0.5;
			const delay = computeRetryDelayMs(0);
			expect(delay).toBeGreaterThanOrEqual(1000);
			expect(delay).toBeLessThan(2000);
		});

		it("handles negative attempts safely", () => {
			Math.random = () => 0;
			expect(computeRetryDelayMs(-1)).toBe(1000);
		});
	});

	describe("processUploadQueue", () => {
		it("processes uploads in concurrent batches of 3", async () => {
			mockedUploadMedia.mockResolvedValue({ success: true, path: "p" });
			const processingOrder: string[] = [];
			const _originalUploadMedia = mockedUploadMedia.getMockImplementation();

			mockedUploadMedia.mockImplementation(async (opts: any) => {
				processingOrder.push(opts.eventId);
				return { success: true, path: "p" };
			});

			const uploads = Array.from({ length: 5 }, (_, i) =>
				makePendingUpload({ id: `upload_${i}`, eventId: `event_${i}`, status: "pending" })
			);

			const getLatestUploads = jest.fn(() => uploads);
			const updateUpload = jest.fn();

			await processUploadQueue(uploads, getLatestUploads, updateUpload);

			expect(mockedUploadMedia).toHaveBeenCalledTimes(5);
		});

		it("returns immediately if already processing (re-entry guard)", async () => {
			let resolveFirst: () => void;
			const firstCallPromise = new Promise<void>((resolve) => {
				resolveFirst = resolve;
			});

			mockedUploadMedia.mockImplementation(async () => {
				await firstCallPromise;
				return { success: true, path: "p" };
			});

			const uploads = [makePendingUpload({ status: "pending" })];
			const getLatestUploads = jest.fn(() => uploads);
			const updateUpload = jest.fn();

			const firstCall = processUploadQueue(uploads, getLatestUploads, updateUpload);

			// Wait a tick for the first call to set isProcessing
			await new Promise((r) => setTimeout(r, 0));

			// First call already started processing (1 call to uploadMedia, blocked on promise)
			expect(mockedUploadMedia).toHaveBeenCalledTimes(1);

			const secondCall = processUploadQueue(uploads, getLatestUploads, updateUpload);
			await secondCall;

			// Second call returned immediately, no additional uploadMedia calls
			expect(mockedUploadMedia).toHaveBeenCalledTimes(1);

			resolveFirst!();
			await firstCall;

			// Still only 1 call total
			expect(mockedUploadMedia).toHaveBeenCalledTimes(1);
		});

		it("only processes pending or syncing uploads, skips failed", async () => {
			mockedUploadMedia.mockResolvedValue({ success: true, path: "p" });

			const uploads = [
				makePendingUpload({ id: "u1", status: "pending" }),
				makePendingUpload({ id: "u2", status: "syncing" }),
				makePendingUpload({ id: "u3", status: "failed" }),
			];

			const getLatestUploads = jest.fn(() => uploads);
			const updateUpload = jest.fn();

			await processUploadQueue(uploads, getLatestUploads, updateUpload);

			expect(mockedUploadMedia).toHaveBeenCalledTimes(2);
		});

		it("does not retry non-retryable failures", async () => {
			const uploads = [makePendingUpload({ status: "pending" })];
			let currentUploads = uploads;
			mockedUploadMedia.mockResolvedValue({
				success: false,
				error: "Your session changed. Re-select the media and try again.",
				failureReason: "storage",
			});

			const getLatestUploads = jest.fn(() => currentUploads);
			const updateUpload = jest.fn((id: string, updates: Partial<PendingUpload>) => {
				currentUploads = currentUploads.map((upload) =>
					upload.id === id ? { ...upload, ...updates } : upload
				);
			});

			await processUploadQueue(uploads, getLatestUploads, updateUpload);

			expect(mockedUploadMedia).toHaveBeenCalledTimes(1);
		});
	});

	describe("generateUploadId", () => {
		it("generates IDs in the expected format", () => {
			const id = generateUploadId();
			expect(id).toMatch(/^upload_\d+_[a-z0-9]+$/);
		});

		it("generates unique IDs across calls", () => {
			const ids = new Set(Array.from({ length: 10 }, () => generateUploadId()));
			expect(ids.size).toBe(10);
		});
	});
});
