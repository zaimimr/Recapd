import Feather from "@expo/vector-icons/Feather";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { addHours, isBefore, setHours, setMinutes } from "date-fns";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Modal,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import {
	Button,
	Card,
	Field,
	ListRow,
	NavBar,
	Screen,
	ScreenScroll,
	SectionHeader,
} from "@/components/ui";
import { radius, space, theme, type } from "@/constants/theme";
import { SUBSCRIPTIONS_ENABLED } from "@/lib/billing/config";
import { formatLocalizedDate, formatLocalizedTime } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useEventStore } from "@/store/eventStore";
import { useIsPro, useSubscriptionPlans } from "@/store/subscriptionStore";
import { getPlanMarketingHighlights } from "@/types/subscription";

export default function CreateEventScreen() {
	const router = useRouter();
	const user = useAuthStore((state) => state.user);
	const isInitialized = useAuthStore((state) => state.isInitialized);
	const { createEvent, isLoading } = useEventStore();
	const isPro = useIsPro();
	const plans = useSubscriptionPlans();

	// Calculate default dates for initial state
	const now = new Date();
	const defaultStart = setMinutes(setHours(now, now.getHours() + 1), 0);
	const defaultEnd = addHours(defaultStart, 4);

	// All hooks must be called before any conditional returns
	const [title, setTitle] = useState("");
	const [startDate, setStartDate] = useState(defaultStart);
	const [endDate, setEndDate] = useState(defaultEnd);
	const [activePicker, setActivePicker] = useState<"start" | "end" | null>(null);
	const [tempDate, setTempDate] = useState<Date>(defaultStart);
	const [androidPickerMode, setAndroidPickerMode] = useState<"date" | "time">("date");
	const [error, setError] = useState("");

	useEffect(() => {
		if (isInitialized && !user) {
			router.replace("/onboarding?returnTo=/event/create");
		}
	}, [isInitialized, user, router.replace]);

	if (!isInitialized || !user) {
		return (
			<Screen style={styles.loadingContainer}>
				<ActivityIndicator size="large" color={theme.accent} />
			</Screen>
		);
	}

	function openStartPicker() {
		setTempDate(startDate);
		setAndroidPickerMode("date");
		setActivePicker("start");
	}

	function openEndPicker() {
		setTempDate(endDate);
		setAndroidPickerMode("date");
		setActivePicker("end");
	}

	function handlePickerChange(event: DateTimePickerEvent, selectedDate?: Date) {
		if (Platform.OS === "android") {
			if (event.type === "dismissed") {
				setActivePicker(null);
				return;
			}
			if (event.type === "set" && selectedDate) {
				if (androidPickerMode === "date") {
					setTempDate(selectedDate);
					setAndroidPickerMode("time");
				} else {
					confirmSelection(selectedDate);
				}
			}
		} else {
			if (selectedDate) {
				setTempDate(selectedDate);
			}
		}
	}

	function confirmSelection(dateToConfirm?: Date) {
		const finalDate = dateToConfirm || tempDate;
		if (activePicker === "start") {
			setStartDate(finalDate);
			if (isBefore(endDate, finalDate)) {
				setEndDate(addHours(finalDate, 4));
			}
		} else if (activePicker === "end") {
			setEndDate(finalDate);
		}
		setActivePicker(null);
	}

	function cancelSelection() {
		setActivePicker(null);
	}

	async function handleCreate() {
		const trimmedTitle = title.trim();

		if (trimmedTitle.length < 2) {
			setError("Event name must be at least 2 characters");
			return;
		}

		if (isBefore(endDate, startDate)) {
			setError("End time must be after start time");
			return;
		}

		setError("");

		const event = await createEvent(
			{
				title: trimmedTitle,
				starts_at: startDate.toISOString(),
				ends_at: endDate.toISOString(),
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			},
			user!.id
		);

		if (event) {
			router.replace(`/event/share/${event.id}`);
		} else {
			Alert.alert("Error", "Failed to create event. Please try again.");
		}
	}

	return (
		<Screen edges="both">
			<NavBar title="New album" onBack={() => router.back()} dismiss />

			<ScreenScroll contentContainerStyle={styles.content}>
				<SectionHeader title="Set the window for the night" />
				<Text style={styles.lede}>
					Guests are only asked for photos and videos captured between these two times.
				</Text>

				<Field
					label="Album name"
					placeholder="Sarah & James"
					value={title}
					onChangeText={(text) => {
						setTitle(text);
						setError("");
					}}
					maxLength={50}
					accessibilityHint="Name the album your guests will see"
				/>

				<Card padded={false}>
					<ListRow
						icon="play-circle"
						title="Starts"
						subtitle={`${formatLocalizedDate(startDate, {
							weekday: "short",
							month: "short",
							day: "numeric",
						})} · ${formatLocalizedTime(startDate)}`}
						onPress={openStartPicker}
						accessibilityHint="Opens the date and time picker"
					/>
					<ListRow
						icon="stop-circle"
						title="Ends"
						subtitle={`${formatLocalizedDate(endDate, {
							weekday: "short",
							month: "short",
							day: "numeric",
						})} · ${formatLocalizedTime(endDate)}`}
						onPress={openEndPicker}
						accessibilityHint="Opens the date and time picker"
						last
					/>
				</Card>

				{error ? (
					<Text style={styles.errorText} accessibilityLiveRegion="polite">
						{error}
					</Text>
				) : null}

				{SUBSCRIPTIONS_ENABLED ? (
					<Card style={styles.planCard}>
						<View style={styles.planRow}>
							<Feather
								name={isPro ? "zap" : "info"}
								size={17}
								color={isPro ? theme.accentSoft : theme.textMuted}
							/>
							<Text style={styles.planText}>
								{isPro
									? getPlanMarketingHighlights("pro", plans)
									: `Free plan · ${getPlanMarketingHighlights("free", plans)}`}
							</Text>
						</View>
					</Card>
				) : null}

				<Button
					label="Create album"
					icon="plus"
					loading={isLoading}
					disabled={!title.trim()}
					onPress={handleCreate}
					accessibilityHint="Creates the album and generates a join code"
					style={styles.submit}
				/>
			</ScreenScroll>

			{Platform.OS === "ios" && activePicker ? (
				<Modal visible transparent animationType="slide" onRequestClose={cancelSelection}>
					<Pressable style={styles.modalOverlay} onPress={cancelSelection}>
						<Pressable style={styles.pickerSheet}>
							<View style={styles.pickerHeader}>
								<Button
									label="Cancel"
									variant="ghost"
									size="sm"
									full={false}
									onPress={cancelSelection}
								/>
								<Text style={styles.pickerTitle}>
									{activePicker === "start" ? "Starts" : "Ends"}
								</Text>
								<Button
									label="Done"
									variant="ghost"
									size="sm"
									full={false}
									onPress={() => confirmSelection()}
								/>
							</View>
							<DateTimePicker
								value={tempDate}
								mode="datetime"
								display="spinner"
								onChange={handlePickerChange}
								minimumDate={activePicker === "end" ? startDate : undefined}
								textColor={theme.textPrimary}
								themeVariant="dark"
								style={styles.picker}
							/>
						</Pressable>
					</Pressable>
				</Modal>
			) : null}

			{Platform.OS === "android" && activePicker ? (
				<DateTimePicker
					value={tempDate}
					mode={androidPickerMode}
					display="default"
					onChange={handlePickerChange}
					minimumDate={
						activePicker === "end" && androidPickerMode === "date" ? startDate : undefined
					}
				/>
			) : null}
		</Screen>
	);
}

const styles = StyleSheet.create({
	loadingContainer: {
		alignItems: "center",
		justifyContent: "center",
	},
	content: {
		paddingHorizontal: space.lg,
		paddingTop: space.sm,
		paddingBottom: space.xxl,
		gap: space.lg,
	},
	lede: {
		...type.body,
		color: theme.textMuted,
		marginTop: -space.sm,
	},
	errorText: {
		...type.caption,
		fontWeight: "600",
		color: theme.danger,
	},
	planCard: {
		paddingVertical: space.md,
	},
	planRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.md,
	},
	planText: {
		...type.caption,
		fontWeight: "500",
		color: theme.textMuted,
		flex: 1,
		lineHeight: 17,
	},
	submit: {
		marginTop: space.sm,
	},

	modalOverlay: {
		flex: 1,
		backgroundColor: theme.overlay,
		justifyContent: "flex-end",
	},
	pickerSheet: {
		backgroundColor: theme.card,
		borderTopLeftRadius: radius.xxl,
		borderTopRightRadius: radius.xxl,
		paddingBottom: space.xxxl,
		borderTopWidth: 1,
		borderColor: theme.border,
	},
	pickerHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: space.md,
		paddingVertical: space.sm,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: theme.border,
	},
	pickerTitle: {
		...type.subheading,
		color: theme.textPrimary,
	},
	picker: {
		height: 216,
	},
});
