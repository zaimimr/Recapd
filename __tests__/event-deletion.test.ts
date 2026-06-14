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

import { delayEventDeletion } from "@/lib/eventDeletion";

const EVENT_ID = "11111111-1111-1111-1111-111111111111";
const ACCESS_TOKEN = "user-access-token";
const ANON_KEY = "anon-key";
const BASE_URL = "https://zfrpwfuihfpoqyexbwng.supabase.co";
const NEW_EXPIRES_AT = "2026-06-28T00:00:00.000Z";

function mockFetchOnce(status: number, body: unknown) {
	(global.fetch as jest.Mock).mockResolvedValueOnce({
		status,
		text: async () => (body === undefined ? "" : JSON.stringify(body)),
	});
}

describe("delayEventDeletion", () => {
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
		mockFetchOnce(200, {
			success: true,
			new_expires_at: NEW_EXPIRES_AT,
			sent: 3,
			recipients: 4,
			skipped: 1,
		});

		await delayEventDeletion(EVENT_ID);

		expect(global.fetch).toHaveBeenCalledTimes(1);
		const [calledUrl, init] = (global.fetch as jest.Mock).mock.calls[0];
		expect(calledUrl).toBe(`${BASE_URL}/functions/v1/delay-event-deletion`);
		expect(calledUrl).not.toContain("/functions/v1/functions/v1/");
		expect(init.method).toBe("POST");
		expect(init.headers.apikey).toBe(ANON_KEY);
		expect(init.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
		expect(JSON.parse(init.body)).toEqual({ event_id: EVENT_ID });
	});

	it("strips a trailing slash from the base url to avoid a double-slash 404", async () => {
		process.env.EXPO_PUBLIC_SUPABASE_URL = `${BASE_URL}/`;
		mockFetchOnce(200, { success: true, new_expires_at: NEW_EXPIRES_AT });

		await delayEventDeletion(EVENT_ID);

		const [calledUrl] = (global.fetch as jest.Mock).mock.calls[0];
		expect(calledUrl).toBe(`${BASE_URL}/functions/v1/delay-event-deletion`);
	});

	it("maps a successful response to ok with the new expiry", async () => {
		mockFetchOnce(200, {
			success: true,
			new_expires_at: NEW_EXPIRES_AT,
			sent: 2,
			recipients: 5,
			skipped: 3,
		});

		const result = await delayEventDeletion(EVENT_ID);

		expect(result).toEqual({
			ok: true,
			newExpiresAt: NEW_EXPIRES_AT,
			sent: 2,
			recipients: 5,
			skipped: 3,
		});
	});

	it("maps 409 already_delayed to already_delayed", async () => {
		mockFetchOnce(409, { success: false, code: "already_delayed", error: "Already delayed" });

		const result = await delayEventDeletion(EVENT_ID);

		expect(result).toEqual({ ok: false, reason: "already_delayed" });
	});

	it("maps 409 without already_delayed code to event_inactive", async () => {
		mockFetchOnce(409, { success: false, code: "event_inactive", error: "no longer active" });

		const result = await delayEventDeletion(EVENT_ID);

		expect(result).toEqual({ ok: false, reason: "event_inactive" });
	});

	it("maps 422 to too_early", async () => {
		mockFetchOnce(422, { success: false, code: "too_early", error: "within 2 days" });

		const result = await delayEventDeletion(EVENT_ID);

		expect(result.ok).toBe(false);
		if (!result.ok && result.reason === "too_early") {
			expect(result.message).toBe("within 2 days");
		} else {
			throw new Error("expected too_early reason");
		}
	});

	it("maps 403 to unauthorized", async () => {
		mockFetchOnce(403, { success: false, error: "Only the event host can delay deletion" });

		const result = await delayEventDeletion(EVENT_ID);

		expect(result).toEqual({ ok: false, reason: "unauthorized" });
	});

	it("maps the function's 404 to not_found", async () => {
		mockFetchOnce(404, { success: false, error: "Event not found" });

		const result = await delayEventDeletion(EVENT_ID);

		expect(result.ok).toBe(false);
		if (!result.ok && result.reason === "not_found") {
			expect(result.message).toBe("Event not found");
		} else {
			throw new Error("expected not_found reason");
		}
	});

	it("treats a 200 without new_expires_at as unknown failure", async () => {
		mockFetchOnce(200, { success: true });

		const result = await delayEventDeletion(EVENT_ID);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("unknown");
		}
	});

	it("returns unauthorized when there is no session", async () => {
		mockGetSession.mockResolvedValue({ data: { session: null } });

		const result = await delayEventDeletion(EVENT_ID);

		expect(result).toEqual({ ok: false, reason: "unauthorized" });
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it("returns unknown on a network error", async () => {
		(global.fetch as jest.Mock).mockRejectedValueOnce(new Error("offline"));

		const result = await delayEventDeletion(EVENT_ID);

		expect(result).toEqual({ ok: false, reason: "unknown", message: "Network error" });
	});
});
