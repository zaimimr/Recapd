jest.mock("react-native", () => ({
	Platform: { OS: "ios" },
}));

import { classifyPaywallFailure, describePaywallFailure } from "@/lib/billing/paywallErrors";

describe("classifyPaywallFailure", () => {
	it("maps the RevenueCat numeric store code", () => {
		expect(classifyPaywallFailure("2", "There was a problem with the store.")).toBe(
			"store_problem"
		);
	});

	it("maps readable error codes", () => {
		expect(classifyPaywallFailure("OFFLINE_CONNECTION_ERROR", "")).toBe("network");
		expect(classifyPaywallFailure("CONFIGURATION_ERROR", "")).toBe("no_plans");
		expect(classifyPaywallFailure("PURCHASE_NOT_ALLOWED_ERROR", "")).toBe("purchases_disabled");
	});

	it("marks the silent not-configured path", () => {
		expect(classifyPaywallFailure("NOT_CONFIGURED", "RevenueCat not configured")).toBe(
			"not_configured"
		);
	});

	it("falls back to the message when no code is present", () => {
		expect(classifyPaywallFailure(null, "There was a problem with the store.")).toBe(
			"store_problem"
		);
		expect(
			classifyPaywallFailure(
				undefined,
				"None of the products registered in the RevenueCat dashboard could be fetched from App Store Connect"
			)
		).toBe("no_plans");
		expect(classifyPaywallFailure(undefined, "Missing RevenueCat API key for ios")).toBe(
			"not_configured"
		);
	});

	it("returns unknown for anything unrecognised", () => {
		expect(classifyPaywallFailure(undefined, "something odd happened")).toBe("unknown");
		expect(classifyPaywallFailure(undefined, undefined)).toBe("unknown");
	});
});

describe("describePaywallFailure", () => {
	it("names the store the user is actually on", () => {
		expect(describePaywallFailure("store_problem", "ios").message).toContain("the App Store");
		expect(describePaywallFailure("store_problem", "android").message).toContain("Google Play");
	});

	it("does not offer a retry for device restrictions", () => {
		expect(describePaywallFailure("purchases_disabled", "ios").retryable).toBe(false);
	});

	it("keeps the old copy as the unknown fallback", () => {
		expect(describePaywallFailure("unknown", "ios").message).toBe(
			"We can't load the upgrade screen right now. Try again in a moment."
		);
	});
});
