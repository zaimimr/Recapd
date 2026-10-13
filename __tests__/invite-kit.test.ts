const mockDownloadAsync = jest.fn();
const mockDeleteAsync = jest.fn().mockResolvedValue(undefined);
const mockShareAsync = jest.fn().mockResolvedValue(undefined);
const mockOpenBrowserAsync = jest.fn().mockResolvedValue({ type: "dismiss" });

jest.mock("expo-file-system/legacy", () => ({
	cacheDirectory: "file:///cache/",
	downloadAsync: (...args: unknown[]) => mockDownloadAsync(...args),
	deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));
jest.mock("expo-sharing", () => ({
	shareAsync: (...args: unknown[]) => mockShareAsync(...args),
}));
jest.mock("expo-web-browser", () => ({
	openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

import {
	buildJoinUrl,
	buildKitImageUrl,
	buildKitPrintUrl,
	openKitPrint,
	shareKitImage,
} from "@/lib/inviteKit";

describe("invite kit urls", () => {
	it("builds the https join url", () => {
		expect(buildJoinUrl("ABC123")).toBe("https://recapd.app/join/ABC123");
	});
	it("builds image and print urls with an encoded time zone", () => {
		expect(buildKitImageUrl("ABC123", "story", "Europe/Oslo")).toBe(
			"https://recapd.app/api/kit/image?code=ABC123&format=story&tz=Europe%2FOslo"
		);
		expect(buildKitPrintUrl("ABC123", "table", "Europe/Oslo")).toBe(
			"https://recapd.app/kit/ABC123/print?format=table&tz=Europe%2FOslo"
		);
	});
});

describe("shareKitImage", () => {
	beforeEach(() => jest.clearAllMocks());

	it("downloads to a fixed cache file and opens the share sheet", async () => {
		mockDownloadAsync.mockResolvedValue({
			status: 200,
			uri: "file:///cache/recapd-ABC123-social.png",
		});
		await shareKitImage("ABC123", "social");
		expect(mockDownloadAsync).toHaveBeenCalledWith(
			expect.stringContaining("format=social"),
			"file:///cache/recapd-ABC123-social.png"
		);
		expect(mockShareAsync).toHaveBeenCalledWith("file:///cache/recapd-ABC123-social.png", {
			mimeType: "image/png",
			UTI: "public.png",
		});
	});

	it("throws and never shares when the server does not return 200", async () => {
		mockDownloadAsync.mockResolvedValue({
			status: 404,
			uri: "file:///cache/recapd-ABC123-social.png",
		});
		await expect(shareKitImage("ABC123", "social")).rejects.toThrow();
		expect(mockShareAsync).not.toHaveBeenCalled();
		expect(mockDeleteAsync).toHaveBeenCalledWith("file:///cache/recapd-ABC123-social.png", {
			idempotent: true,
		});
	});

	it("throws when offline", async () => {
		mockDownloadAsync.mockRejectedValue(new Error("offline"));
		await expect(shareKitImage("ABC123", "story")).rejects.toThrow("offline");
		expect(mockShareAsync).not.toHaveBeenCalled();
	});
});

describe("openKitPrint", () => {
	it("opens the print page in the in-app browser", async () => {
		await openKitPrint("ABC123", "poster");
		expect(mockOpenBrowserAsync).toHaveBeenCalledWith(
			expect.stringContaining("https://recapd.app/kit/ABC123/print?format=poster")
		);
	});
});
