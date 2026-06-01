jest.mock("expo-router", () => ({
	useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
	useFocusEffect: jest.fn(),
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
let mockIsPro = false;
const mockPlans = {
	free: {
		id: "free",
		displayName: "Free",
		description: null,
		isActive: true,
		sortOrder: 0,
		revenueCatEntitlementIdentifier: null,
		revenueCatOfferingIdentifier: null,
		capabilities: {
			maxParticipants: 12,
			participantWarningThreshold: 10,
			maxSingleVideoDurationMs: 30_000,
			canUploadVideos: true,
		},
	},
	pro: {
		id: "pro",
		displayName: "Pro",
		description: null,
		isActive: true,
		sortOrder: 1,
		revenueCatEntitlementIdentifier: "Recapd Pro",
		revenueCatOfferingIdentifier: null,
		capabilities: {
			maxParticipants: null,
			participantWarningThreshold: null,
			maxSingleVideoDurationMs: 300_000,
			canUploadVideos: true,
		},
	},
};

let mockStatus = {
	isActive: false,
	expiresAt: null as Date | null,
	productId: null as string | null,
	willRenew: false,
};

jest.mock("@/store/subscriptionStore", () => ({
	useSubscriptionStore: (selector?: any) => {
		const state = {
			status: mockStatus,
			showPaywall: mockShowPaywall,
			showCustomerCenter: mockShowCustomerCenter,
			restore: mockRestore,
			isLoading: false,
			isPro: mockIsPro,
			planId: mockIsPro ? "pro" : "free",
			plans: mockPlans,
		};
		return typeof selector === "function" ? selector(state) : state;
	},
	useIsPro: jest.fn(() => mockIsPro),
	useSubscriptionPlanId: jest.fn(() => (mockIsPro ? "pro" : "free")),
	useSubscriptionPlans: jest.fn(() => mockPlans),
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
jest.mock("@/lib/billing/config", () => ({
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

describe("Settings - Subscription Status Text", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSubscriptionsEnabled = true;
		mockIsPro = false;
		mockStatus = { isActive: false, expiresAt: null, productId: null, willRenew: false };
	});

	it("shows 'Renews' with date when subscription is active and will renew", () => {
		mockIsPro = true;
		mockedUseIsPro.mockReturnValue(true);
		mockStatus = {
			isActive: true,
			expiresAt: new Date("2026-03-24"),
			productId: "monthly",
			willRenew: true,
		};
		const { getByText } = render(<SettingsScreen />);
		expect(getByText(/Renews/)).toBeTruthy();
		expect(getByText(/Renews/)).not.toHaveTextContent(/Expires/);
	});

	it("shows 'Expires' with date when subscription is cancelled (willRenew false)", () => {
		mockIsPro = true;
		mockedUseIsPro.mockReturnValue(true);
		mockStatus = {
			isActive: true,
			expiresAt: new Date("2026-03-24"),
			productId: "monthly",
			willRenew: false,
		};
		const { getByText } = render(<SettingsScreen />);
		expect(getByText(/Expires/)).toBeTruthy();
		expect(getByText(/Expires/)).not.toHaveTextContent(/Renews/);
	});

	it("shows 'Active subscription' when pro but no expiration date", () => {
		mockIsPro = true;
		mockedUseIsPro.mockReturnValue(true);
		mockStatus = {
			isActive: true,
			expiresAt: null,
			productId: "monthly",
			willRenew: true,
		};
		const { getByText } = render(<SettingsScreen />);
		expect(getByText("Active subscription")).toBeTruthy();
	});

	it("shows free plan description when not pro", () => {
		mockIsPro = false;
		mockedUseIsPro.mockReturnValue(false);
		const { getByText } = render(<SettingsScreen />);
		expect(getByText("Up to 12 participants · 30s videos")).toBeTruthy();
	});
});

describe("Settings - Restore Button", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSubscriptionsEnabled = true;
		mockIsPro = false;
		mockedUseIsPro.mockReturnValue(false);
		mockStatus = { isActive: false, expiresAt: null, productId: null, willRenew: false };
	});

	it("renders Restore Purchases when user is not pro", () => {
		const { getByText } = render(<SettingsScreen />);
		expect(getByText("Restore Purchases")).toBeTruthy();
	});

	it("does not render Restore Purchases when isPro is true", () => {
		mockIsPro = true;
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
		mockIsPro = false;
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
			expect(queryByText(/current plan limit/)).toBeTruthy();
		});
	});

	it("hides name input section when event is full", async () => {
		mockFetchEventByCode.mockResolvedValue(makeEvent({ participant_count: 12, hostIsPro: false }));

		const { getByPlaceholderText, getByText, queryByText } = render(<JoinEventScreen />);

		fireEvent.changeText(getByPlaceholderText("ABC123"), "ABCDEF");
		fireEvent.press(getByText("Find Event"));

		await waitFor(() => {
			expect(getByText(/current plan limit/)).toBeTruthy();
		});

		expect(queryByText("What should we call you?")).toBeNull();
	});

	it("does not show Event Full banner when hostIsPro is true", async () => {
		mockIsPro = false;
		mockFetchEventByCode.mockResolvedValue(makeEvent({ participant_count: 15, hostIsPro: true }));

		const { getByPlaceholderText, getByText, queryByText } = render(<JoinEventScreen />);

		fireEvent.changeText(getByPlaceholderText("ABC123"), "ABCDEF");
		fireEvent.press(getByText("Find Event"));

		await waitFor(() => {
			expect(getByText("Test Event")).toBeTruthy();
		});

		expect(queryByText(/current plan limit/)).toBeNull();
	});

	it("does not show Event Full banner when participant_count < 12", async () => {
		mockIsPro = false;
		mockFetchEventByCode.mockResolvedValue(makeEvent({ participant_count: 5, hostIsPro: false }));

		const { getByPlaceholderText, getByText, queryByText } = render(<JoinEventScreen />);

		fireEvent.changeText(getByPlaceholderText("ABC123"), "ABCDEF");
		fireEvent.press(getByText("Find Event"));

		await waitFor(() => {
			expect(getByText("Test Event")).toBeTruthy();
		});

		expect(queryByText(/current plan limit/)).toBeNull();
	});
});

describe("Home - Pro Badge", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSubscriptionsEnabled = true;
	});

	it("renders PRO badge when isPro is true and SUBSCRIPTIONS_ENABLED is true", () => {
		mockIsPro = true;
		mockedUseIsPro.mockReturnValue(true);
		const { getByText } = render(<HomeScreen />);
		expect(getByText("PRO")).toBeTruthy();
	});

	it("does not render PRO badge when isPro is false", () => {
		mockIsPro = false;
		mockedUseIsPro.mockReturnValue(false);
		const { queryByText } = render(<HomeScreen />);
		expect(queryByText("PRO")).toBeNull();
	});

	it("does not render PRO badge when SUBSCRIPTIONS_ENABLED is false", () => {
		mockSubscriptionsEnabled = false;
		mockIsPro = true;
		mockedUseIsPro.mockReturnValue(true);
		const { queryByText } = render(<HomeScreen />);
		expect(queryByText("PRO")).toBeNull();
	});
});
