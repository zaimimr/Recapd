jest.mock("expo-network", () => {
	const listeners: Array<(event: any) => void> = [];
	return {
		addNetworkStateListener: jest.fn((listener: (event: any) => void) => {
			listeners.push(listener);
			return {
				remove: jest.fn(() => {
					const idx = listeners.indexOf(listener);
					if (idx >= 0) listeners.splice(idx, 1);
				}),
			};
		}),
		getNetworkStateAsync: jest.fn(async () => ({ isConnected: true, type: "WIFI" })),
		__emit: (event: any) => {
			for (const l of listeners) l(event);
		},
		__reset: () => {
			listeners.length = 0;
		},
	};
});

import * as Network from "expo-network";
import { AppState, type AppStateStatus } from "react-native";
import { installUploadQueueKicker, teardownUploadQueueKicker } from "@/lib/networkKick";

const NetworkMock = Network as any;
const appStateListeners: Array<(state: AppStateStatus) => void> = [];
const emitAppState = (state: AppStateStatus) => {
	for (const l of [...appStateListeners]) l(state);
};

beforeAll(() => {
	jest.spyOn(AppState, "addEventListener").mockImplementation(((
		_event: string,
		listener: (state: AppStateStatus) => void
	) => {
		appStateListeners.push(listener);
		return {
			remove: () => {
				const idx = appStateListeners.indexOf(listener);
				if (idx >= 0) appStateListeners.splice(idx, 1);
			},
		};
	}) as any);
});

async function flushMicrotasks() {
	await Promise.resolve();
	await Promise.resolve();
}

describe("installUploadQueueKicker", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		NetworkMock.__reset();
		appStateListeners.length = 0;
		teardownUploadQueueKicker();
	});

	afterEach(() => {
		teardownUploadQueueKicker();
		jest.useRealTimers();
	});

	it("kicks queue when app becomes active", async () => {
		const run = jest.fn();
		installUploadQueueKicker(run);
		await flushMicrotasks();

		emitAppState("active");
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("does not kick on background transitions", async () => {
		const run = jest.fn();
		installUploadQueueKicker(run);
		await flushMicrotasks();

		emitAppState("background");
		emitAppState("inactive");
		expect(run).not.toHaveBeenCalled();
	});

	it("kicks queue when connectivity restored after a drop", async () => {
		const run = jest.fn();
		installUploadQueueKicker(run);
		await flushMicrotasks();

		NetworkMock.__emit({ isConnected: false, type: "NONE" });
		expect(run).not.toHaveBeenCalled();

		NetworkMock.__emit({ isConnected: true, type: "WIFI" });
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("does not kick on initial network state if never dropped", async () => {
		const run = jest.fn();
		installUploadQueueKicker(run);
		await flushMicrotasks();

		NetworkMock.__emit({ isConnected: true, type: "CELLULAR" });
		expect(run).not.toHaveBeenCalled();
	});

	it("debounces back-to-back kicks within window", async () => {
		const run = jest.fn();
		installUploadQueueKicker(run);
		await flushMicrotasks();

		emitAppState("active");
		expect(run).toHaveBeenCalledTimes(1);

		emitAppState("active");
		await jest.advanceTimersByTimeAsync(100);
		expect(run).toHaveBeenCalledTimes(1);

		await jest.advanceTimersByTimeAsync(1500);
		expect(run).toHaveBeenCalledTimes(2);
	});

	it("swallows kick errors so listener stays alive", async () => {
		const run = jest.fn(() => {
			throw new Error("boom");
		});
		installUploadQueueKicker(run);
		await flushMicrotasks();

		expect(() => emitAppState("active")).not.toThrow();
		expect(run).toHaveBeenCalledTimes(1);
	});

	it("teardown removes listeners", async () => {
		const run = jest.fn();
		const teardown = installUploadQueueKicker(run);
		await flushMicrotasks();

		teardown();

		emitAppState("active");
		NetworkMock.__emit({ isConnected: false, type: "NONE" });
		NetworkMock.__emit({ isConnected: true, type: "WIFI" });
		expect(run).not.toHaveBeenCalled();
	});
});
