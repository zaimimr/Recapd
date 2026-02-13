jest.mock("expo-router", () => ({
	useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
	useFocusEffect: (cb: () => void) => cb(),
	useLocalSearchParams: () => ({}),
}));
jest.mock("expo-camera", () => ({
	Camera: {
		getCameraPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
	},
	useCameraPermissions: () => [{ granted: true }, jest.fn()],
	CameraView: "CameraView",
}));
jest.mock("expo-constants", () => ({ expoConfig: { version: "1.0.0" } }));
jest.mock("expo-media-library", () => ({
	getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true, accessPrivileges: "all" }),
	requestPermissionsAsync: jest.fn(),
}));
jest.mock("expo-notifications", () => ({
	getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
	requestPermissionsAsync: jest.fn(),
}));
jest.mock("@expo/vector-icons/FontAwesome", () => "FontAwesome");

const mockRestore = jest.fn().mockResolvedValue({ success: false });
const mockShowPaywall = jest.fn();
const mockShowCustomerCenter = jest.fn();

jest.mock("@/store/subscriptionStore", () => ({
	useSubscriptionStore: () => ({
		status: {
			isActive: false,
			expiresAt: null,
			productId: null,
			willRenew: false,
		},
		showPaywall: mockShowPaywall,
		showCustomerCenter: mockShowCustomerCenter,
		restore: mockRestore,
		isLoading: false,
	}),
	useIsPro: jest.fn(() => false),
}));

jest.mock("@/store/authStore", () => ({
	useAuthStore: (selector: any) =>
		selector({
			user: {
				id: "test-user",
				display_name: "Test User",
				created_at: "2024-01-01",
			},
			isLoading: false,
			createUser: jest.fn(),
			updateDisplayName: jest.fn(),
		}),
}));

const mockFetchEventByCode = jest.fn();
jest.mock("@/store/eventStore", () => ({
	useEventStore: () => ({
		fetchEventByCode: mockFetchEventByCode,
		joinEvent: jest.fn(),
		isLoading: false,
		error: null,
		clearError: jest.fn(),
		events: [],
		fetchUserEvents: jest.fn(),
		subscribeToUserEvents: jest.fn(() => jest.fn()),
	}),
}));

let mockSubscriptionsEnabled = true;
jest.mock("@/lib/subscription", () => ({
	get SUBSCRIPTIONS_ENABLED() {
		return mockSubscriptionsEnabled;
	},
}));

jest.mock("@/components/useColorScheme", () => ({
	useColorScheme: () => "light",
}));

jest.mock("date-fns", () => ({
	format: jest.fn(() => "January 1, 2025"),
	isAfter: jest.fn(() => false),
	isBefore: jest.fn(() => true),
	addDays: jest.fn(),
}));

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import HomeScreen from "@/app/(tabs)/index";
import SettingsScreen from "@/app/(tabs)/settings";
import JoinEventScreen from "@/app/event/join";
import { useIsPro } from "@/store/subscriptionStore";

const mockedUseIsPro = useIsPro as jest.MockedFunction<typeof useIsPro>;

function makeEvent(overrides: Record<string, any> = {}) {
	return {
		id: "evt-1",
		title: "Test Event",
		starts_at: "2025-01-01T18:00:00Z",
		ends_at: "2025-01-01T22:00:00Z",
		expires_at: "2025-01-08T22:00:00Z",
		join_code: "ABC123",
		created_by: "host-1",
		created_at: "2025-01-01T00:00:00Z",
		participant_count: 5,
		hostIsPro: false,
		...overrides,
	};
}

describe("Settings - Restore Button", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSubscriptionsEnabled = true;
		mockedUseIsPro.mockReturnValue(false);
	});

	it("renders Restore Purchases when user is not pro", () => {
		const { getByText } = render(<SettingsScreen />);
		expect(getByText("Restore Purchases")).toBeTruthy();
	});

	it("does not render Restore Purchases when isPro is true", () => {
		mockedUseIsPro.mockReturnValue(true);
		const { queryByText } = render(<SettingsScreen />);
		expect(queryByText("Restore Purchases")).toBeNull();
	});

	it("calls restore when Restore Purchases is pressed", async () => {
		const { getByText } = render(<SettingsScreen />);
		fireEvent.press(getByText("Restore Purchases"));
		await waitFor(() => {
			expect(mockRestore).toHaveBeenCalledTimes(1);
		});
	});
});

describe("Join - Event Full", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSubscriptionsEnabled = true;
		mockedUseIsPro.mockReturnValue(false);
	});

	it("shows Event Full banner when participant_count >= 12 and hostIsPro is false", async () => {
		mockFetchEventByCode.mockResolvedValue(makeEvent({ participant_count: 12, hostIsPro: false }));

		const { getByPlaceholderText, getByText, queryByText } = render(<JoinEventScreen />);

		fireEvent.changeText(getByPlaceholderText("ABC123"), "ABCDEF");
		fireEvent.press(getByText("Find Event"));

		await waitFor(() => {
			expect(queryByText(/Event Full/)).toBeTruthy();
		});
	});

	it("shows Event Full on the join button and banner text when at limit", async () => {
		mockFetchEventByCode.mockResolvedValue(makeEvent({ participant_count: 15, hostIsPro: false }));

		const { getByPlaceholderText, getByText, queryByText } = render(<JoinEventScreen />);

		fireEvent.changeText(getByPlaceholderText("ABC123"), "ABCDEF");
		fireEvent.press(getByText("Find Event"));

		await waitFor(() => {
			expect(getByText("Event Full")).toBeTruthy();
			expect(queryByText(/free plan limit/)).toBeTruthy();
		});
	});

	it("hides name input section when event is full", async () => {
		mockFetchEventByCode.mockResolvedValue(makeEvent({ participant_count: 12, hostIsPro: false }));

		const { getByPlaceholderText, getByText, queryByText } = render(<JoinEventScreen />);

		fireEvent.changeText(getByPlaceholderText("ABC123"), "ABCDEF");
		fireEvent.press(getByText("Find Event"));

		await waitFor(() => {
			expect(getByText(/free plan limit/)).toBeTruthy();
		});

		expect(queryByText("What should we call you?")).toBeNull();
	});

	it("does not show Event Full banner when hostIsPro is true", async () => {
		mockFetchEventByCode.mockResolvedValue(makeEvent({ participant_count: 15, hostIsPro: true }));

		const { getByPlaceholderText, getByText, queryByText } = render(<JoinEventScreen />);

		fireEvent.changeText(getByPlaceholderText("ABC123"), "ABCDEF");
		fireEvent.press(getByText("Find Event"));

		await waitFor(() => {
			expect(getByText("Test Event")).toBeTruthy();
		});

		expect(queryByText(/free plan limit/)).toBeNull();
	});

	it("does not show Event Full banner when participant_count < 12", async () => {
		mockFetchEventByCode.mockResolvedValue(makeEvent({ participant_count: 5, hostIsPro: false }));

		const { getByPlaceholderText, getByText, queryByText } = render(<JoinEventScreen />);

		fireEvent.changeText(getByPlaceholderText("ABC123"), "ABCDEF");
		fireEvent.press(getByText("Find Event"));

		await waitFor(() => {
			expect(getByText("Test Event")).toBeTruthy();
		});

		expect(queryByText(/free plan limit/)).toBeNull();
	});
});

describe("Home - Pro Badge", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSubscriptionsEnabled = true;
	});

	it("renders PRO badge when isPro is true and SUBSCRIPTIONS_ENABLED is true", () => {
		mockedUseIsPro.mockReturnValue(true);
		const { getByText } = render(<HomeScreen />);
		expect(getByText("PRO")).toBeTruthy();
	});

	it("does not render PRO badge when isPro is false", () => {
		mockedUseIsPro.mockReturnValue(false);
		const { queryByText } = render(<HomeScreen />);
		expect(queryByText("PRO")).toBeNull();
	});

	it("does not render PRO badge when SUBSCRIPTIONS_ENABLED is false", () => {
		mockSubscriptionsEnabled = false;
		mockedUseIsPro.mockReturnValue(true);
		const { queryByText } = render(<HomeScreen />);
		expect(queryByText("PRO")).toBeNull();
	});
});
