import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchKitEvent = vi.fn();
vi.mock("../event", async (importOriginal) => ({
	...(await importOriginal<typeof import("../event")>()),
	fetchKitEvent: (code: string) => fetchKitEvent(code),
}));

const { loadKitData } = await import("../load");

describe("loadKitData", () => {
	beforeEach(() => fetchKitEvent.mockReset());

	it("returns null without querying for malformed codes", async () => {
		expect(await loadKitData({ code: "<script>" })).toBeNull();
		expect(await loadKitData({ code: ["ABC123", "DEF456"] })).toBeNull();
		expect(fetchKitEvent).not.toHaveBeenCalled();
	});

	it("returns null for unknown events", async () => {
		fetchKitEvent.mockResolvedValue(null);
		expect(await loadKitData({ code: "abc123" })).toBeNull();
		expect(fetchKitEvent).toHaveBeenCalledWith("ABC123");
	});

	it("builds kit data with the https join url and local date", async () => {
		fetchKitEvent.mockResolvedValue({ title: "Party", starts_at: "2026-10-10T22:30:00Z" });
		const data = await loadKitData({ code: "abc123", tz: "Europe/Oslo" });
		expect(data?.code).toBe("ABC123");
		expect(data?.joinUrl).toBe("https://recapd.app/join/ABC123");
		expect(data?.dateLabel.startsWith("Sun, Oct 11")).toBe(true);
		expect(data?.qrSrc.startsWith("data:image/svg+xml;base64,")).toBe(true);
	});
});
