const mockAsyncStorage = {
	getItem: jest.fn(),
	setItem: jest.fn(),
	removeItem: jest.fn(),
};

const mockInsert = jest.fn();
const mockFrom = jest.fn(() => ({
	insert: mockInsert,
}));
const mockGetSession = jest.fn();

jest.mock("@react-native-async-storage/async-storage", () => ({
	__esModule: true,
	default: mockAsyncStorage,
}));

jest.mock("expo-application", () => ({
	nativeApplicationVersion: "1.2.3",
	nativeBuildVersion: "42",
}));

jest.mock("expo-constants", () => ({
	__esModule: true,
	default: {
		expoConfig: {
			version: "1.2.3",
		},
	},
}));

jest.mock("expo-device", () => ({
	modelName: "iPhone Test",
}));

jest.mock("@/lib/supabase", () => ({
	supabase: {
		auth: {
			getSession: mockGetSession,
		},
		from: mockFrom,
	},
}));

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function loadLogger() {
	return require("@/lib/logger") as typeof import("@/lib/logger");
}

describe("lib/logger telemetry", () => {
	beforeEach(() => {
		jest.resetModules();
		jest.clearAllMocks();
		mockAsyncStorage.getItem.mockResolvedValue(null);
		mockAsyncStorage.setItem.mockResolvedValue(undefined);
		mockAsyncStorage.removeItem.mockResolvedValue(undefined);
		mockInsert.mockResolvedValue({ error: null });
		mockGetSession.mockResolvedValue({
			data: {
				session: {
					user: { id: "auth-user-1" },
				},
			},
		});
		delete (globalThis as typeof globalThis & { ErrorUtils?: unknown }).ErrorUtils;
	});

	it("persists normalized screen traces", async () => {
		const { traceScreen } = loadLogger();

		traceScreen("/event/123");
		await flushPromises();

		expect(mockAsyncStorage.setItem).toHaveBeenCalled();
		const [, payload] = mockAsyncStorage.setItem.mock.calls.at(-1) ?? [];
		const events = JSON.parse(String(payload));

		expect(events).toHaveLength(1);
		expect(events[0]).toEqual(
			expect.objectContaining({
				event_kind: "trace",
				severity: "info",
				name: "screen.view",
				route: "/event/:id",
				screen: "/event/:id",
			})
		);
	});

	it("installs global JS error capture and forwards to the previous handler", async () => {
		const previousHandler = jest.fn();
		const setGlobalHandler = jest.fn();
		(
			globalThis as typeof globalThis & {
				ErrorUtils?: {
					getGlobalHandler: () => typeof previousHandler;
					setGlobalHandler: typeof setGlobalHandler;
				};
			}
		).ErrorUtils = {
			getGlobalHandler: () => previousHandler,
			setGlobalHandler,
		};

		const { installTelemetry } = loadLogger();
		installTelemetry();

		const handler = setGlobalHandler.mock.calls[0]?.[0] as
			| ((error: Error, isFatal?: boolean) => void)
			| undefined;

		expect(handler).toBeDefined();

		handler?.(new Error("boom"), true);
		await flushPromises();

		expect(previousHandler).toHaveBeenCalledWith(expect.any(Error), true);
		const [, payload] = mockAsyncStorage.setItem.mock.calls.at(-1) ?? [];
		const events = JSON.parse(String(payload));
		expect(events[0]).toEqual(
			expect.objectContaining({
				event_kind: "error",
				severity: "fatal",
				name: "error.unhandled_js_exception",
				message: "boom",
			})
		);
	});

	it("flushes queued telemetry to Supabase and clears it on success", async () => {
		mockAsyncStorage.getItem.mockResolvedValue(
			JSON.stringify([
				{
					id: "event-1",
					occurred_at: "2026-03-28T00:00:00.000Z",
					event_kind: "error",
					severity: "error",
					name: "log.error",
					message: "boom",
					source: "logger",
					route: "/event/:id",
					screen: null,
					metadata: {},
				},
			])
		);

		const { flushTelemetryQueue, setTelemetryContext } = loadLogger();
		setTelemetryContext({ userId: "user-1" });
		const result = await flushTelemetryQueue(true);

		expect(result).toBe(true);
		expect(mockFrom).toHaveBeenCalledWith("telemetry_events");
		expect(mockInsert).toHaveBeenCalledWith([
			expect.objectContaining({
				actor_user_id: "user-1",
				event_kind: "error",
				severity: "error",
				name: "log.error",
				message: "boom",
				route: "/event/:id",
				platform: expect.any(String),
				app_version: "1.2.3",
			}),
		]);
		expect(mockAsyncStorage.setItem).toHaveBeenLastCalledWith("recapd.telemetry.queue.v2", "[]");
	});
});
