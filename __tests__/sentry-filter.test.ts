jest.mock("@sentry/react-native", () => ({
	init: jest.fn(),
	captureException: jest.fn(),
	captureMessage: jest.fn(),
	setUser: jest.fn(),
	expoRouterIntegration: jest.fn(() => ({})),
}));
jest.mock("expo-constants", () => ({
	__esModule: true,
	default: { expoConfig: { extra: {}, version: "1.6.2" } },
}));

import { shouldDropSentryEvent } from "@/lib/sentry";

function eventWith(value: string | undefined, message?: string): any {
	return {
		exception: value !== undefined ? { values: [{ type: "Error", value }] } : undefined,
		message,
	};
}

describe("shouldDropSentryEvent", () => {
	it("drops RevenueCat purchase-not-allowed errors", () => {
		expect(
			shouldDropSentryEvent(eventWith("The device or user is not allowed to make the purchase."))
		).toBe(true);
	});

	it("drops RevenueCat unknown backend errors", () => {
		expect(shouldDropSentryEvent(eventWith("There was an unknown backend error."))).toBe(true);
	});

	it("drops the generic 'Error performing request.' RC SDK error", () => {
		expect(shouldDropSentryEvent(eventWith("Error performing request."))).toBe(true);
		expect(shouldDropSentryEvent(eventWith("Error performing request"))).toBe(true);
	});

	it("drops empty / Sentry-filtered messages", () => {
		expect(shouldDropSentryEvent(eventWith(""))).toBe(true);
		expect(shouldDropSentryEvent(eventWith("[Filtered]"))).toBe(true);
		expect(shouldDropSentryEvent(eventWith("No error message"))).toBe(true);
		expect(shouldDropSentryEvent(eventWith(undefined, "[Filtered]"))).toBe(true);
	});

	it("keeps genuine application errors", () => {
		expect(shouldDropSentryEvent(eventWith("Failed to fetch event from Supabase"))).toBe(false);
		expect(shouldDropSentryEvent(eventWith("File 'ph://abc' is not readable"))).toBe(false);
		expect(shouldDropSentryEvent(eventWith("timeout"))).toBe(false);
	});

	it("keeps events with a real message even if extra fields are filtered", () => {
		expect(shouldDropSentryEvent(eventWith("Upload failed: 500"))).toBe(false);
	});
});
