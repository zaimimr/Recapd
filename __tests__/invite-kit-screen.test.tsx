import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

const mockShareKitImage = jest.fn();
const mockOpenKitPrint = jest.fn().mockResolvedValue(undefined);
const mockSetStringAsync = jest.fn().mockResolvedValue(true);
let mockQrValue: string | undefined;

jest.mock("@/lib/inviteKit", () => ({
	...jest.requireActual("@/lib/inviteKit"),
	shareKitImage: (...args: unknown[]) => mockShareKitImage(...args),
	openKitPrint: (...args: unknown[]) => mockOpenKitPrint(...args),
}));
jest.mock("expo-file-system/legacy", () => ({ cacheDirectory: "file:///cache/" }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("expo-web-browser", () => ({ openBrowserAsync: jest.fn() }));
jest.mock("expo-clipboard", () => ({
	setStringAsync: (...args: unknown[]) => mockSetStringAsync(...args),
}));
jest.mock("expo-image", () => ({ Image: "ExpoImage" }));
jest.mock("@expo/vector-icons/Feather", () => "Feather");
jest.mock("react-native-qrcode-svg", () => (props: { value: string }) => {
	mockQrValue = props.value;
	return null;
});
jest.mock("react-native-safe-area-context", () => ({
	SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
	useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => ({
	useRouter: () => ({ replace: jest.fn() }),
	useLocalSearchParams: () => ({ id: "event-1" }),
}));
jest.mock("@/store/eventStore", () => ({
	useEventStore: () => ({
		fetchEventById: jest.fn(),
		subscribeToParticipants: () => () => {},
		isLoading: false,
		currentEvent: {
			id: "event-1",
			title: "Party",
			join_code: "ABC123",
			starts_at: "2026-10-10T18:00:00Z",
			ends_at: "2026-10-10T23:00:00Z",
			participants: [],
			participant_count: 1,
		},
	}),
}));

import ShareEventScreen from "@/app/event/share/[id]";
import InviteKit from "@/components/InviteKit";

describe("share screen", () => {
	it("encodes the https join url in the QR", () => {
		render(<ShareEventScreen />);
		expect(mockQrValue).toBe("https://recapd.app/join/ABC123");
	});
});

describe("InviteKit", () => {
	beforeEach(() => jest.clearAllMocks());

	it("shares the social image", async () => {
		mockShareKitImage.mockResolvedValue(undefined);
		const { getByLabelText } = render(<InviteKit code="ABC123" />);
		fireEvent.press(getByLabelText("Share Facebook / post image"));
		await waitFor(() => expect(mockShareKitImage).toHaveBeenCalledWith("ABC123", "social"));
	});

	it("opens the table card print page", async () => {
		const { getByLabelText } = render(<InviteKit code="ABC123" />);
		fireEvent.press(getByLabelText("Open Table cards for printing"));
		await waitFor(() => expect(mockOpenKitPrint).toHaveBeenCalledWith("ABC123", "table"));
	});

	it("copies the poster print link", async () => {
		const { getByLabelText } = render(<InviteKit code="ABC123" />);
		fireEvent.press(getByLabelText("Copy Poster print link"));
		await waitFor(() =>
			expect(mockSetStringAsync).toHaveBeenCalledWith(
				expect.stringContaining("https://recapd.app/kit/ABC123/print?format=poster")
			)
		);
	});

	it("alerts when the image cannot be loaded", async () => {
		const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
		mockShareKitImage.mockRejectedValue(new Error("offline"));
		const { getByLabelText } = render(<InviteKit code="ABC123" />);
		fireEvent.press(getByLabelText("Share Story image"));
		await waitFor(() =>
			expect(alertSpy).toHaveBeenCalledWith(
				"Invite kit",
				"Couldn't load the invite card. Check your connection."
			)
		);
	});
});
