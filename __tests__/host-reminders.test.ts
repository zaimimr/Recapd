const mockGetSession = jest.fn();

jest.mock("@/lib/supabase", () => ({
	supabase: {
		auth: {
			getSession: () => mockGetSession(),
		},
	},
}));

jest.mock("@/lib/logger", () => ({
	logger: {
		error: jest.fn(),
		warn: jest.fn(),
		info: jest.fn(),
		debug: jest.fn(),
	},
}));

import { sendHostReminder } from "@/lib/hostReminders";

const EVENT_ID = "11111111-1111-1111-1111-111111111111";
const ACCESS_TOKEN = "user-access-token";
const ANON_KEY = "anon-key";
const BASE_URL = "https://zfrpwfuihfpoqyexbwng.supabase.co";

function mockFetchOnce(status: number, body: unknown) {
	(global.fetch as jest.Mock).mockResolvedValueOnce({
		status,
		text: async () => (body === undefined ? "" : JSON.stringify(body)),
	});
}

describe("sendHostReminder", () => {
	const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
	const originalKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

	beforeEach(() => {
		process.env.EXPO_PUBLIC_SUPABASE_URL = BASE_URL;
		process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;
		mockGetSession.mockResolvedValue({ data: { session: { access_token: ACCESS_TOKEN } } });
		global.fetch = jest.fn();
	});

	afterAll(() => {
		process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
		process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalKey;
	});

	it("calls the single /functions/v1/ path with apikey and bearer headers", async () => {
		mockFetchOnce(200, { success: true, sent: 3, recipients: 4, skipped: 1 });

		await sendHostReminder(EVENT_ID, "upload");

		expect(global.fetch).toHaveBeenCalledTimes(1);
		const [calledUrl, init] = (global.fetch as jest.Mock).mock.calls[0];
		expect(calledUrl).toBe(`${BASE_URL}/functions/v1/send-host-reminder`);
		expect(calledUrl).not.toContain("/functions/v1/functions/v1/");
		expect(init.method).toBe("POST");
		expect(init.headers.apikey).toBe(ANON_KEY);
		expect(init.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
		expect(JSON.parse(init.body)).toEqual({ event_id: EVENT_ID, reminder_type: "upload" });
	});

	it("strips a trailing slash from the base url to avoid a double-slash 404", async () => {
		process.env.EXPO_PUBLIC_SUPABASE_URL = `${BASE_URL}/`;
		mockFetchOnce(200, { success: true, sent: 0, recipients: 0, skipped: 0 });

		await sendHostReminder(EVENT_ID, "upload");

		const [calledUrl] = (global.fetch as jest.Mock).mock.calls[0];
		expect(calledUrl).toBe(`${BASE_URL}/functions/v1/send-host-reminder`);
	});

	it("maps a successful response to ok", async () => {
		mockFetchOnce(200, { success: true, sent: 2, recipients: 5, skipped: 3 });

		const result = await sendHostReminder(EVENT_ID, "take_photos");

		expect(result).toEqual({ ok: true, sent: 2, recipients: 5, skipped: 3 });
	});

	it("treats a gateway NOT_FOUND 404 as a service issue, not a silent success", async () => {
		mockFetchOnce(404, { code: "NOT_FOUND", message: "Requested function was not found" });

		const result = await sendHostReminder(EVENT_ID, "upload");

		expect(result.ok).toBe(false);
		if (!result.ok && result.reason === "unknown") {
			expect(result.message).toMatch(/temporarily unavailable/i);
		} else {
			throw new Error("expected unknown reason");
		}
	});

	it("maps the function's own 404 to not_found", async () => {
		mockFetchOnce(404, { success: false, error: "Event not found" });

		const result = await sendHostReminder(EVENT_ID, "upload");

		expect(result.ok).toBe(false);
		if (!result.ok && result.reason === "not_found") {
			expect(result.message).toBe("Event not found");
		} else {
			throw new Error("expected not_found reason");
		}
	});

	it("maps 429 to a cooldown with retry seconds", async () => {
		mockFetchOnce(429, { success: false, retry_after_seconds: 120 });

		const result = await sendHostReminder(EVENT_ID, "upload");

		expect(result).toEqual({ ok: false, reason: "cooldown", retryAfterSeconds: 120 });
	});

	it("maps 403 to unauthorized", async () => {
		mockFetchOnce(403, { success: false, error: "Only the event host can send reminders" });

		const result = await sendHostReminder(EVENT_ID, "upload");

		expect(result).toEqual({ ok: false, reason: "unauthorized" });
	});

	it("maps 409 to event_inactive", async () => {
		mockFetchOnce(409, { success: false, error: "Event is no longer active" });

		const result = await sendHostReminder(EVENT_ID, "upload");

		expect(result).toEqual({ ok: false, reason: "event_inactive" });
	});

	it("returns unauthorized when there is no session", async () => {
		mockGetSession.mockResolvedValue({ data: { session: null } });

		const result = await sendHostReminder(EVENT_ID, "upload");

		expect(result).toEqual({ ok: false, reason: "unauthorized" });
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it("returns unknown on a network error", async () => {
		(global.fetch as jest.Mock).mockRejectedValueOnce(new Error("offline"));

		const result = await sendHostReminder(EVENT_ID, "upload");

		expect(result).toEqual({ ok: false, reason: "unknown", message: "Network error" });
	});
});
