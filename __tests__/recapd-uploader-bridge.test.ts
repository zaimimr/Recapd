const mockConfigure = jest.fn(async (..._args: any[]) => {});
const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();

jest.mock("recapd-uploader", () => ({
	RecapdUploader: {
		configure: (...args: any[]) => mockConfigure(...args),
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

jest.mock("@/lib/sentry", () => ({
	addUploadBreadcrumb: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	},
}));

jest.mock("@/lib/supabase", () => ({
	supabase: {
		auth: {
			getSession: (...args: any[]) => mockGetSession(...args),
			refreshSession: (...args: any[]) => mockRefreshSession(...args),
		},
	},
}));

import { refreshUploaderConfig } from "@/lib/recapdUploaderBridge";

function freshSession(accessToken: string, refreshToken: string, secondsUntilExpiry: number) {
	return {
		session: {
			access_token: accessToken,
			refresh_token: refreshToken,
			expires_at: Math.floor(Date.now() / 1000) + secondsUntilExpiry,
		},
	};
}

describe("refreshUploaderConfig single-flight", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
		process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
	});

	it("coalesces concurrent callers into a single refresh and a single configure", async () => {
		let resolveRefresh: (value: unknown) => void = () => {};
		const refreshPromise = new Promise((resolve) => {
			resolveRefresh = resolve;
		});

		mockGetSession.mockResolvedValue({ data: freshSession("old-access", "old-refresh", 10) });
		mockRefreshSession.mockReturnValue(refreshPromise);

		const a = refreshUploaderConfig();
		const b = refreshUploaderConfig();
		const c = refreshUploaderConfig();

		await Promise.resolve();
		await Promise.resolve();

		expect(mockRefreshSession).toHaveBeenCalledTimes(1);

		resolveRefresh({ data: freshSession("new-access", "new-refresh", 3600), error: null });
		await Promise.all([a, b, c]);

		expect(mockRefreshSession).toHaveBeenCalledTimes(1);
		expect(mockConfigure).toHaveBeenCalledTimes(1);
		expect(mockConfigure).toHaveBeenCalledWith(
			expect.objectContaining({ bearerToken: "new-access", refreshToken: "new-refresh" })
		);
	});

	it("skips the network refresh when the token still has plenty of life", async () => {
		mockGetSession.mockResolvedValue({ data: freshSession("live-access", "live-refresh", 3600) });

		await refreshUploaderConfig();

		expect(mockRefreshSession).not.toHaveBeenCalled();
		expect(mockConfigure).toHaveBeenCalledWith(
			expect.objectContaining({ bearerToken: "live-access", refreshToken: "live-refresh" })
		);
	});

	it("allows a new refresh after the previous one settles", async () => {
		mockGetSession.mockResolvedValue({ data: freshSession("a", "b", 5) });
		mockRefreshSession.mockResolvedValue({ data: freshSession("c", "d", 3600), error: null });

		await refreshUploaderConfig();
		await refreshUploaderConfig();

		expect(mockRefreshSession).toHaveBeenCalledTimes(2);
	});
});
