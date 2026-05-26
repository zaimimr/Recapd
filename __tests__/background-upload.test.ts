jest.mock("expo-background-task", () => {
	const tasks = new Map<string, () => Promise<unknown>>();
	return {
		__esModule: true,
		BackgroundTaskResult: { Success: 1, Failed: 0 },
		BackgroundTaskStatus: { Available: 2, Denied: 1, Restricted: 0 },
		registerTaskAsync: jest.fn(async (_name: string) => undefined),
		unregisterTaskAsync: jest.fn(async (_name: string) => undefined),
		getStatusAsync: jest.fn(async () => 2),
		addExpirationListener: jest.fn(() => ({ remove: jest.fn() })),
		__tasks: tasks,
	};
});

jest.mock("expo-task-manager", () => {
	const mod = jest.requireMock("expo-background-task") as {
		__tasks: Map<string, () => Promise<unknown>>;
	};
	return {
		defineTask: jest.fn((name: string, executor: () => Promise<unknown>) => {
			mod.__tasks.set(name, executor);
		}),
		isTaskDefined: jest.fn((name: string) => mod.__tasks.has(name)),
	};
});

import * as BackgroundTask from "expo-background-task";

const mockedBg = BackgroundTask as unknown as {
	registerTaskAsync: jest.Mock;
	unregisterTaskAsync: jest.Mock;
	getStatusAsync: jest.Mock;
	addExpirationListener: jest.Mock;
	__tasks: Map<string, () => Promise<unknown>>;
};

import {
	UPLOAD_BACKGROUND_TASK,
	installBackgroundUploadTask,
	uninstallBackgroundUploadTask,
} from "@/lib/backgroundUpload";

describe("backgroundUpload task", () => {
	beforeEach(() => {
		mockedBg.registerTaskAsync.mockClear();
		mockedBg.unregisterTaskAsync.mockClear();
		mockedBg.getStatusAsync.mockClear();
		mockedBg.addExpirationListener.mockClear();
		mockedBg.getStatusAsync.mockResolvedValue(2);
	});

	afterEach(async () => {
		await uninstallBackgroundUploadTask();
	});

	it("defines the task at module load", () => {
		expect(mockedBg.__tasks.has(UPLOAD_BACKGROUND_TASK)).toBe(true);
	});

	it("registers the task when background API is available", async () => {
		await installBackgroundUploadTask(async () => undefined);
		expect(mockedBg.registerTaskAsync).toHaveBeenCalledWith(
			UPLOAD_BACKGROUND_TASK,
			expect.objectContaining({ minimumInterval: 15 })
		);
	});

	it("skips registration when API restricted", async () => {
		mockedBg.getStatusAsync.mockResolvedValueOnce(0);
		await uninstallBackgroundUploadTask();
		await installBackgroundUploadTask(async () => undefined);
		expect(mockedBg.registerTaskAsync).not.toHaveBeenCalled();
	});

	it("task executor runs the supplied processUploads and returns Success", async () => {
		const run = jest.fn(async () => undefined);
		await installBackgroundUploadTask(run);
		const result = await mockedBg.__tasks.get(UPLOAD_BACKGROUND_TASK)!();
		expect(result).toBe(1);
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("task executor returns Failed when no runner is registered", async () => {
		await uninstallBackgroundUploadTask();
		const result = await mockedBg.__tasks.get(UPLOAD_BACKGROUND_TASK)!();
		expect(result).toBe(0);
	});

	it("task executor returns Failed when runner throws", async () => {
		const run = jest.fn(async () => {
			throw new Error("boom");
		});
		await installBackgroundUploadTask(run);
		const result = await mockedBg.__tasks.get(UPLOAD_BACKGROUND_TASK)!();
		expect(result).toBe(0);
	});

	it("task executor times out and returns Failed when runner hangs", async () => {
		jest.useFakeTimers();
		const run = jest.fn(() => new Promise<void>(() => {}));
		await installBackgroundUploadTask(run);
		const resultPromise = mockedBg.__tasks.get(UPLOAD_BACKGROUND_TASK)!();
		await jest.advanceTimersByTimeAsync(30 * 1000);
		const result = await resultPromise;
		expect(result).toBe(0);
		jest.useRealTimers();
	});

	it("uninstall unregisters the task", async () => {
		await installBackgroundUploadTask(async () => undefined);
		await uninstallBackgroundUploadTask();
		expect(mockedBg.unregisterTaskAsync).toHaveBeenCalledWith(UPLOAD_BACKGROUND_TASK);
	});
});
