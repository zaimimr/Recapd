import { Platform } from "react-native";

export type PaywallFailureReason =
	| "not_configured"
	| "store_problem"
	| "network"
	| "no_plans"
	| "purchases_disabled"
	| "unknown";

export interface PaywallFailureCopy {
	title: string;
	message: string;
	retryable: boolean;
}

const CODE_REASONS: Record<string, PaywallFailureReason> = {
	NOT_CONFIGURED: "not_configured",
	"2": "store_problem",
	STORE_PROBLEM_ERROR: "store_problem",
	"3": "purchases_disabled",
	PURCHASE_NOT_ALLOWED_ERROR: "purchases_disabled",
	"5": "no_plans",
	PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: "no_plans",
	"10": "network",
	NETWORK_ERROR: "network",
	"19": "purchases_disabled",
	INSUFFICIENT_PERMISSIONS_ERROR: "purchases_disabled",
	"23": "no_plans",
	CONFIGURATION_ERROR: "no_plans",
	"24": "purchases_disabled",
	UNSUPPORTED_ERROR: "purchases_disabled",
	"32": "network",
	PRODUCT_REQUEST_TIMED_OUT_ERROR: "network",
	"33": "network",
	API_ENDPOINT_BLOCKED: "network",
	"35": "network",
	OFFLINE_CONNECTION_ERROR: "network",
};

const MESSAGE_REASONS: Array<{ pattern: RegExp; reason: PaywallFailureReason }> = [
	{
		pattern: /not configured|missing revenuecat api key|subscriptions are disabled/i,
		reason: "not_configured",
	},
	{ pattern: /problem with the store|store problem/i, reason: "store_problem" },
	{ pattern: /offline|network|internet connection|timed out/i, reason: "network" },
	{
		pattern: /none of the products|offering|no products|could not be fetched/i,
		reason: "no_plans",
	},
	{ pattern: /not allowed to make the purchase|not permitted/i, reason: "purchases_disabled" },
];

export function classifyPaywallFailure(
	errorCode?: string | null,
	message?: string | null
): PaywallFailureReason {
	const code = errorCode?.trim();
	if (code && CODE_REASONS[code]) {
		return CODE_REASONS[code];
	}

	const text = message?.trim();
	if (text) {
		const match = MESSAGE_REASONS.find((entry) => entry.pattern.test(text));
		if (match) return match.reason;
	}

	return "unknown";
}

export function describePaywallFailure(
	reason: PaywallFailureReason,
	platform: typeof Platform.OS = Platform.OS
): PaywallFailureCopy {
	const storeName = platform === "ios" ? "the App Store" : "Google Play";

	switch (reason) {
		case "not_configured":
			return {
				title: "Pro is unavailable",
				message:
					"Recapd could not reach the subscription service. Check your connection and try again.",
				retryable: true,
			};
		case "store_problem":
			return {
				title: "Store unavailable",
				message: `${storeName} could not load the Pro plans. Make sure you are signed in to ${storeName}, then try again.`,
				retryable: true,
			};
		case "network":
			return {
				title: "You look offline",
				message: "Reconnect to the internet and try again.",
				retryable: true,
			};
		case "no_plans":
			return {
				title: "Plans are not ready",
				message: `Pro plans are not available from ${storeName} on this device yet. This usually clears up within a few minutes.`,
				retryable: true,
			};
		case "purchases_disabled":
			return {
				title: "Purchases are turned off",
				message:
					"This device does not allow in-app purchases. Check your device restrictions and try again.",
				retryable: false,
			};
		default:
			return {
				title: "Pro is unavailable",
				message: "We can't load the upgrade screen right now. Try again in a moment.",
				retryable: true,
			};
	}
}
