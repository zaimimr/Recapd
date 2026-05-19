jest.mock("@react-native-async-storage/async-storage", () =>
	require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-constants", () => {
	const actual = jest.requireActual("expo-constants");
	return {
		__esModule: true,
		...actual,
		default: {
			...(actual.default ?? {}),
			executionEnvironment: actual.ExecutionEnvironment?.Bare ?? "bare",
			expoConfig: {
				scheme: "recapd",
				extra: {
					supabaseUrl: "https://example.supabase.co",
					supabaseAnonKey: "anon-key",
					eas: { projectId: "test-project" },
				},
			},
		},
	};
});

import { buildContributeDeepLink, parseDeepLink } from "../lib/notifications";
import { formatCooldownLabel, HOST_NUDGE_COOLDOWN_HOURS } from "../lib/reminderScheduler";

describe("buildContributeDeepLink", () => {
	it("encodes the prefill parameter", () => {
		expect(buildContributeDeepLink("abc-123")).toBe(
			"recapd://event/abc-123/contribute?prefill=window"
		);
		expect(buildContributeDeepLink("abc-123", "all")).toBe(
			"recapd://event/abc-123/contribute?prefill=all"
		);
	});
});

describe("parseDeepLink", () => {
	it("returns null for empty input", () => {
		expect(parseDeepLink(null)).toBeNull();
		expect(parseDeepLink(undefined)).toBeNull();
		expect(parseDeepLink("")).toBeNull();
	});

	it("parses a valid contribute deep link", () => {
		const link = "recapd://event/abc-123/contribute?prefill=window";
		expect(parseDeepLink(link)).toEqual({
			type: "open_contribute",
			eventId: "abc-123",
			prefill: "window",
		});
	});

	it("ignores unrelated schemes", () => {
		expect(parseDeepLink("https://recapd.app/event/abc/contribute")).toBeTruthy();
		expect(parseDeepLink("recapd://event/abc-123/share")).toBeNull();
		expect(parseDeepLink("recapd://other/abc-123/contribute")).toBeNull();
	});
});

describe("formatCooldownLabel", () => {
	it("returns Ready for non-positive ms", () => {
		expect(formatCooldownLabel(0)).toBe("Ready");
		expect(formatCooldownLabel(-1000)).toBe("Ready");
	});

	it("formats minute granularity under an hour", () => {
		expect(formatCooldownLabel(5 * 60 * 1000)).toBe("5m");
		expect(formatCooldownLabel(59 * 60 * 1000)).toBe("59m");
	});

	it("formats hours and minutes above an hour", () => {
		expect(formatCooldownLabel(60 * 60 * 1000)).toBe("1h");
		expect(formatCooldownLabel(90 * 60 * 1000)).toBe("1h 30m");
		expect(formatCooldownLabel(HOST_NUDGE_COOLDOWN_HOURS * 60 * 60 * 1000)).toBe("6h");
	});
});
