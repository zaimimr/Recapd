const mockGetSession = jest.fn();
const mockGetAllOfferings = jest.fn();
const mockPurchasePackage = jest.fn();

jest.mock("@/lib/supabase", () => ({
	supabase: {
		auth: {
			getSession: () => mockGetSession(),
		},
	},
}));

jest.mock("@/lib/subscription", () => ({
	getAllOfferings: () => mockGetAllOfferings(),
	purchasePackage: (pkg: unknown) => mockPurchasePackage(pkg),
}));

jest.mock("@/lib/logger", () => ({
	logger: {
		error: jest.fn(),
		warn: jest.fn(),
		info: jest.fn(),
		debug: jest.fn(),
	},
}));

import type { PurchasesPackage } from "react-native-purchases";
import { getEventPassPackage, purchaseEventPass, redeemEventPass } from "@/lib/eventPass";

const EVENT_ID = "11111111-1111-1111-1111-111111111111";
const BASE_URL = "https://zfrpwfuihfpoqyexbwng.supabase.co";
const PACKAGE = { identifier: "event_pass" } as unknown as PurchasesPackage;

function mockFetchOnce(status: number, body: unknown) {
	(global.fetch as jest.Mock).mockResolvedValueOnce({
		status,
		text: async () => (body === undefined ? "" : JSON.stringify(body)),
	});
}

describe("eventPass", () => {
	beforeEach(() => {
		jest.useFakeTimers();
		process.env.EXPO_PUBLIC_SUPABASE_URL = BASE_URL;
		process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
		mockGetSession.mockResolvedValue({ data: { session: { access_token: "token" } } });
		mockGetAllOfferings.mockReset();
		mockPurchasePackage.mockReset();
		global.fetch = jest.fn();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("returns the first package of the event_pass offering", async () => {
		mockGetAllOfferings.mockResolvedValue({ event_pass: { availablePackages: [PACKAGE] } });
		await expect(getEventPassPackage()).resolves.toBe(PACKAGE);
	});

	it("returns null when the offering is missing", async () => {
		mockGetAllOfferings.mockResolvedValue({ default: { availablePackages: [] } });
		await expect(getEventPassPackage()).resolves.toBeNull();
	});

	it("posts the event id to redeem-event-pass with the bearer token", async () => {
		mockFetchOnce(200, { success: true });
		await expect(redeemEventPass(EVENT_ID)).resolves.toEqual({ ok: true });
		const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
		expect(url).toBe(`${BASE_URL}/functions/v1/redeem-event-pass`);
		expect(init.headers.Authorization).toBe("Bearer token");
		expect(JSON.parse(init.body)).toEqual({ event_id: EVENT_ID });
	});

	it("retries while the purchase is not yet visible", async () => {
		mockFetchOnce(402, { success: false, code: "no_purchase" });
		mockFetchOnce(200, { success: true });
		const pending = redeemEventPass(EVENT_ID);
		await jest.advanceTimersByTimeAsync(2000);
		await expect(pending).resolves.toEqual({ ok: true });
		expect(global.fetch).toHaveBeenCalledTimes(2);
	});

	it("stops on a non-402 failure", async () => {
		mockFetchOnce(403, { success: false, code: "not_host", error: "Only the event host" });
		await expect(redeemEventPass(EVENT_ID)).resolves.toEqual({
			ok: false,
			reason: "not_redeemed",
			message: "Only the event host",
		});
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it("does not redeem when the purchase is cancelled", async () => {
		mockPurchasePackage.mockResolvedValue({ success: false, userCancelled: true });
		await expect(purchaseEventPass(EVENT_ID, PACKAGE)).resolves.toEqual({
			ok: false,
			reason: "cancelled",
		});
		expect(global.fetch).not.toHaveBeenCalled();
	});

	it("redeems after a successful purchase", async () => {
		mockPurchasePackage.mockResolvedValue({ success: true });
		mockFetchOnce(200, { success: true });
		await expect(purchaseEventPass(EVENT_ID, PACKAGE)).resolves.toEqual({ ok: true });
		expect(mockPurchasePackage).toHaveBeenCalledWith(PACKAGE);
	});
});
