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
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { useColorScheme } from "@/components/useColorScheme";
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
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";
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
			<View style={[styles.container, isDark && styles.containerDark, styles.loadingContainer]}>
				<ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
			</View>
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
		<ScrollView
			style={[styles.container, isDark && styles.containerDark]}
			contentContainerStyle={styles.content}
			keyboardShouldPersistTaps="handled"
		>
			<View style={[styles.heroPanel, isDark && styles.panelDark]}>
				<Text style={styles.kicker}>Create</Text>
				<Text style={[styles.heroTitle, isDark && styles.textDark]}>
					Set the window for the shared recap
				</Text>
				<Text style={[styles.heroText, isDark && styles.textMuted]}>
					Guests will only be asked for photos and videos captured during this event timeframe.
				</Text>
			</View>
			<View style={styles.form}>
				<View style={[styles.field, isDark && styles.panelDark]}>
					<Text style={[styles.label, isDark && styles.textDark]}>Event Name</Text>
					<TextInput
						style={[styles.input, isDark && styles.inputDark]}
						placeholder="e.g., Zaim's Wedding"
						placeholderTextColor={isDark ? "#666" : "#999"}
						value={title}
						onChangeText={(text) => {
							setTitle(text);
							setError("");
						}}
						maxLength={50}
						accessibilityLabel="Event Name"
						accessibilityHint="Enter a name for your event"
					/>
				</View>

				<View style={[styles.field, isDark && styles.panelDark]}>
					<Text style={[styles.label, isDark && styles.textDark]}>Start Time</Text>
					<TouchableOpacity
						style={[styles.dateButton, isDark && styles.dateButtonDark]}
						onPress={openStartPicker}
						accessibilityRole="button"
						accessibilityLabel={`Start Time: ${formatLocalizedDate(startDate, {
							weekday: "short",
							month: "short",
							day: "numeric",
							year: "numeric",
						})} at ${formatLocalizedTime(startDate)}`}
						accessibilityHint="Opens date and time picker"
					>
						<Text style={[styles.dateText, isDark && styles.textDark]}>
							{formatLocalizedDate(startDate, {
								weekday: "short",
								month: "short",
								day: "numeric",
								year: "numeric",
							})}
						</Text>
						<Text style={[styles.timeText, isDark && styles.textMuted]}>
							{formatLocalizedTime(startDate)}
						</Text>
					</TouchableOpacity>
				</View>

				<View style={[styles.field, isDark && styles.panelDark]}>
					<Text style={[styles.label, isDark && styles.textDark]}>End Time</Text>
					<TouchableOpacity
						style={[styles.dateButton, isDark && styles.dateButtonDark]}
						onPress={openEndPicker}
						accessibilityRole="button"
						accessibilityLabel={`End Time: ${formatLocalizedDate(endDate, {
							weekday: "short",
							month: "short",
							day: "numeric",
							year: "numeric",
						})} at ${formatLocalizedTime(endDate)}`}
						accessibilityHint="Opens date and time picker"
					>
						<Text style={[styles.dateText, isDark && styles.textDark]}>
							{formatLocalizedDate(endDate, {
								weekday: "short",
								month: "short",
								day: "numeric",
								year: "numeric",
							})}
						</Text>
						<Text style={[styles.timeText, isDark && styles.textMuted]}>
							{formatLocalizedTime(endDate)}
						</Text>
					</TouchableOpacity>
				</View>

				{error ? <Text style={styles.errorText}>{error}</Text> : null}

				<View style={[styles.infoBox, isDark && styles.panelDark]}>
					<Text style={[styles.infoText, isDark && styles.textMuted]}>
						After the event ends, guests will be prompted to share photos taken during this time
						window.
					</Text>
				</View>
				{SUBSCRIPTIONS_ENABLED &&
					(isPro ? (
						<View style={[styles.proBadge, isDark && styles.proBadgeDark]}>
							<Text style={styles.proBadgeTitle}>Pro Plan Active</Text>
							<Text style={[styles.proBadgeSubtitle, isDark && styles.textMuted]}>
								{getPlanMarketingHighlights("pro", plans)}
							</Text>
						</View>
					) : (
						<View style={[styles.freeTierInfo, isDark && styles.freeTierInfoDark]}>
							<Text style={[styles.freeTierInfoText, isDark && styles.textMuted]}>
								Free plan · {getPlanMarketingHighlights("free", plans)}
							</Text>
						</View>
					))}
			</View>

			<TouchableOpacity
				style={[styles.button, (!title.trim() || isLoading) && styles.buttonDisabled]}
				onPress={handleCreate}
				disabled={!title.trim() || isLoading}
				accessibilityRole="button"
				accessibilityLabel="Create Event"
				accessibilityHint="Creates the event and generates a share code"
				accessibilityState={{ disabled: !title.trim() || isLoading }}
			>
				{isLoading ? (
					<ActivityIndicator color="#fff" />
				) : (
					<Text style={styles.buttonText}>Create Event</Text>
				)}
			</TouchableOpacity>

			{Platform.OS === "ios" && activePicker && (
				<Modal visible={true} transparent animationType="slide" onRequestClose={cancelSelection}>
					<Pressable style={styles.modalOverlay} onPress={cancelSelection}>
						<Pressable style={[styles.pickerSheet, isDark && styles.pickerSheetDark]}>
							<View style={[styles.pickerHeader, isDark && styles.pickerHeaderDark]}>
								<TouchableOpacity onPress={cancelSelection} style={styles.pickerHeaderButton}>
									<Text style={styles.pickerCancelText}>Cancel</Text>
								</TouchableOpacity>
								<Text style={[styles.pickerTitle, isDark && styles.textDark]}>
									{activePicker === "start" ? "Start Time" : "End Time"}
								</Text>
								<TouchableOpacity
									onPress={() => confirmSelection()}
									style={styles.pickerHeaderButton}
								>
									<Text style={styles.pickerDoneText}>Done</Text>
								</TouchableOpacity>
							</View>
							<DateTimePicker
								value={tempDate}
								mode="datetime"
								display="spinner"
								onChange={handlePickerChange}
								minimumDate={activePicker === "end" ? startDate : undefined}
								textColor={isDark ? "#fff" : "#000"}
								style={styles.picker}
							/>
						</Pressable>
					</Pressable>
				</Modal>
			)}

			{Platform.OS === "android" && activePicker && (
				<DateTimePicker
					value={tempDate}
					mode={androidPickerMode}
					display="default"
					onChange={handlePickerChange}
					minimumDate={
						activePicker === "end" && androidPickerMode === "date" ? startDate : undefined
					}
				/>
			)}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#f3f4f6",
	},
	containerDark: {
		backgroundColor: "#05070b",
	},
	loadingContainer: {
		justifyContent: "center",
		alignItems: "center",
	},
	content: {
		padding: 16,
		gap: 14,
	},
	heroPanel: {
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		paddingHorizontal: 16,
		paddingVertical: 16,
		gap: 6,
	},
	panelDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	kicker: {
		fontSize: 11,
		fontWeight: "800",
		letterSpacing: 1.2,
		textTransform: "uppercase",
		color: "#FF2D8E",
	},
	heroTitle: {
		fontSize: 24,
		fontWeight: "700",
		color: "#111827",
		letterSpacing: -0.7,
	},
	heroText: {
		fontSize: 14,
		lineHeight: 21,
		color: "#6b7280",
	},
	form: {
		gap: 14,
		marginBottom: 20,
	},
	field: {
		gap: 10,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		paddingHorizontal: 16,
		paddingVertical: 16,
	},
	label: {
		fontSize: 12,
		fontWeight: "700",
		color: "#111827",
		textTransform: "uppercase",
		letterSpacing: 1,
	},
	input: {
		backgroundColor: "#f9fafb",
		borderRadius: 14,
		paddingVertical: 16,
		paddingHorizontal: 20,
		fontSize: 17,
		color: "#111827",
		fontWeight: "400",
		borderWidth: 1,
		borderColor: "#e5e7eb",
	},
	inputDark: {
		backgroundColor: "#151821",
		borderColor: "#242833",
		color: "#fff",
	},
	dateButton: {
		backgroundColor: "#f9fafb",
		borderRadius: 14,
		paddingVertical: 16,
		paddingHorizontal: 20,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		borderWidth: 1,
		borderColor: "#e5e7eb",
	},
	dateButtonDark: {
		backgroundColor: "#151821",
		borderColor: "#242833",
	},
	dateText: {
		fontSize: 16,
		fontWeight: "600",
		color: "#111827",
	},
	timeText: {
		fontSize: 16,
		color: "#6b7280",
	},
	errorText: {
		color: "#ef4444",
		fontSize: 14,
	},
	infoBox: {
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		padding: 16,
	},
	infoText: {
		fontSize: 14,
		color: "#6b7280",
		lineHeight: 20,
	},
	button: {
		backgroundColor: "#FF2D8E",
		paddingVertical: 18,
		borderRadius: 999,
		alignItems: "center",
	},
	buttonDisabled: {
		opacity: 0.5,
	},
	buttonText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "700",
	},
	textDark: {
		color: "#fff",
	},
	textMuted: {
		color: "#888",
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.4)",
		justifyContent: "flex-end",
	},
	pickerSheet: {
		backgroundColor: "#f8fafc",
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		paddingBottom: 34,
	},
	pickerSheetDark: {
		backgroundColor: "#1c1c1e",
	},
	pickerHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 16,
		paddingVertical: 14,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: "rgba(0, 0, 0, 0.1)",
	},
	pickerHeaderDark: {
		borderBottomColor: "rgba(255, 255, 255, 0.1)",
	},
	pickerHeaderButton: {
		paddingHorizontal: 8,
		paddingVertical: 4,
		minWidth: 60,
	},
	pickerTitle: {
		fontSize: 17,
		fontWeight: "600",
		color: "#000",
	},
	pickerCancelText: {
		fontSize: 17,
		color: "#FF2D8E",
	},
	pickerDoneText: {
		fontSize: 17,
		fontWeight: "700",
		color: "#FF2D8E",
		textAlign: "right",
	},
	picker: {
		height: 216,
	},
	proBadge: {
		backgroundColor: "#fff",
		padding: 16,
		borderWidth: 1,
		borderColor: "#e5e7eb",
	},
	proBadgeDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	proBadgeTitle: {
		fontSize: 14,
		fontWeight: "800",
		color: "#FF2D8E",
		marginBottom: 4,
		textTransform: "uppercase",
		letterSpacing: 0.8,
	},
	proBadgeSubtitle: {
		fontSize: 14,
		color: "#6b7280",
	},
	freeTierInfo: {
		backgroundColor: "#fff",
		padding: 14,
		borderWidth: 1,
		borderColor: "#e5e7eb",
	},
	freeTierInfoDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	freeTierInfoText: {
		fontSize: 14,
		color: "#6b7280",
		textAlign: "center",
	},
});
