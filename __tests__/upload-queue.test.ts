jest.mock("@/lib/recapdUploaderBridge", () => ({
	enqueueRecapdUploads: jest.fn(async () => {}),
	setRecapdUploaderHandlers: jest.fn(),
}));

jest.mock("@/lib/sentry", () => ({
	addUploadBreadcrumb: jest.fn(),
}));

jest.mock("@/lib/storage", () => ({
	getContentType: (extension: string, mediaType: string) => {
		if (mediaType === "video") {
			if (extension === "mov") return "video/quicktime";
			return "video/mp4";
		}
		if (extension === "heic") return "image/heic";
		if (extension === "png") return "image/png";
		return "image/jpeg";
	},
	getPathExtension: (uri: string, mediaType: string) => {
		const last = uri.split("/").pop() ?? "";
		const dot = last.lastIndexOf(".");
		if (dot >= 0) return last.slice(dot + 1).toLowerCase();
		return mediaType === "video" ? "mp4" : "jpg";
	},
}));

jest.mock("recapd-uploader", () => ({
	RecapdUploader: {
		configure: jest.fn(),
		enqueue: jest.fn(async () => []),
		cancel: jest.fn(),
		clearFailed: jest.fn(),
		getQueueState: jest.fn(async () => ({ items: [] })),
		retry: jest.fn(),
		kick: jest.fn(),
		addProgressListener: jest.fn(() => ({ remove: jest.fn() })),
		addCompletedListener: jest.fn(() => ({ remove: jest.fn() })),
		addFailedListener: jest.fn(() => ({ remove: jest.fn() })),
		addDrainedListener: jest.fn(() => ({ remove: jest.fn() })),
	},
}));

import { enqueueRecapdUploads } from "@/lib/recapdUploaderBridge";
import {
	generateUploadId,
	type PendingUpload,
	processUploadQueue,
} from "@/lib/uploadQueue";

const mockedEnqueue = enqueueRecapdUploads as jest.MockedFunction<typeof enqueueRecapdUploads>;

function makePendingUpload(overrides: Partial<PendingUpload> = {}): PendingUpload {
	return {
		id: "upload_123",
		localUri: "file:///photo.heic",
		eventId: "event1",
		userId: "user1",
		capturedAt: new Date("2026-05-29T00:00:00Z"),
		width: 1920,
		height: 1080,
		status: "pending",
		retryCount: 0,
		mediaType: "photo",
		...overrides,
	};
}

describe("uploadQueue (native bridge)", () => {
	beforeEach(() => {
		mockedEnqueue.mockClear();
	});

	test("generateUploadId returns a unique-looking string", () => {
		const a = generateUploadId();
		const b = generateUploadId();
		expect(a).not.toBe(b);
		expect(a).toMatch(/^upload_/);
	});

	test("processUploadQueue enqueues only pending uploads via the native bridge", async () => {
		const uploads: PendingUpload[] = [
			makePendingUpload({ id: "u1", status: "pending" }),
			makePendingUpload({ id: "u2", status: "failed" }),
			makePendingUpload({ id: "u3", status: "syncing" }),
			makePendingUpload({ id: "u4", status: "pending", mediaType: "video", localUri: "file:///vid.mp4" }),
		];
		const updates: Array<[string, Partial<PendingUpload>]> = [];

		await processUploadQueue(
			uploads,
			() => uploads,
			(id, u) => updates.push([id, u])
		);

		expect(mockedEnqueue).toHaveBeenCalledTimes(1);
		const items = mockedEnqueue.mock.calls[0][0];
		expect(items).toHaveLength(2);
		expect(items[0].uploadId).toBe("u1");
		expect(items[1].uploadId).toBe("u4");
		expect(items[0].mediaType).toBe("photo");
		expect(items[1].mediaType).toBe("video");
		expect(items[0].objectName).toMatch(/^event1\/user1\/\d+_[a-z0-9]+\.heic$/);
		expect(items[1].objectName).toMatch(/^event1\/user1\/\d+_[a-z0-9]+\.mp4$/);
		expect(items[0].contentType).toBe("image/heic");
		expect(items[1].contentType).toBe("video/mp4");
		expect(updates.find(([id]) => id === "u1")?.[1].status).toBe("syncing");
		expect(updates.find(([id]) => id === "u2")).toBeUndefined();
	});

	test("processUploadQueue is a no-op when nothing is pending", async () => {
		const uploads: PendingUpload[] = [makePendingUpload({ status: "failed" })];
		await processUploadQueue(
			uploads,
			() => uploads,
			() => {}
		);
		expect(mockedEnqueue).not.toHaveBeenCalled();
	});
});
