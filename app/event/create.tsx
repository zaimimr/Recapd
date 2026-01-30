import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { addHours, format, isBefore, setHours, setMinutes } from "date-fns";
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
import { SUBSCRIPTIONS_ENABLED } from "@/lib/subscription";
import { useAuthStore } from "@/store/authStore";
import { useEventStore } from "@/store/eventStore";
import { useIsPro, useSubscriptionStore } from "@/store/subscriptionStore";

export default function CreateEventScreen() {
	const router = useRouter();
	const user = useAuthStore((state) => state.user);
	const isInitialized = useAuthStore((state) => state.isInitialized);
	const { createEvent, isLoading } = useEventStore();
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";
	const isPro = useIsPro();
	const { showPaywall } = useSubscriptionStore();

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
			<View style={styles.form}>
				<View style={styles.field}>
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
					/>
				</View>

				<View style={styles.field}>
					<Text style={[styles.label, isDark && styles.textDark]}>Start Time</Text>
					<TouchableOpacity
						style={[styles.dateButton, isDark && styles.dateButtonDark]}
						onPress={openStartPicker}
					>
						<Text style={[styles.dateText, isDark && styles.textDark]}>
							{format(startDate, "EEE, MMM d, yyyy")}
						</Text>
						<Text style={[styles.timeText, isDark && styles.textMuted]}>
							{format(startDate, "h:mm a")}
						</Text>
					</TouchableOpacity>
				</View>

				<View style={styles.field}>
					<Text style={[styles.label, isDark && styles.textDark]}>End Time</Text>
					<TouchableOpacity
						style={[styles.dateButton, isDark && styles.dateButtonDark]}
						onPress={openEndPicker}
					>
						<Text style={[styles.dateText, isDark && styles.textDark]}>
							{format(endDate, "EEE, MMM d, yyyy")}
						</Text>
						<Text style={[styles.timeText, isDark && styles.textMuted]}>
							{format(endDate, "h:mm a")}
						</Text>
					</TouchableOpacity>
				</View>

				{error ? <Text style={styles.errorText}>{error}</Text> : null}

				<View style={styles.infoBox}>
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
								Unlimited participants • Video uploads
							</Text>
						</View>
					) : (
						<View style={[styles.freeTierBanner, isDark && styles.freeTierBannerDark]}>
							<Text style={[styles.freeTierTitle, isDark && styles.textDark]}>
								Free Plan: Up to 12 participants
							</Text>
							<Text style={[styles.freeTierSubtitle, isDark && styles.textMuted]}>
								Want more? Upgrade to Pro for:
							</Text>
							<View style={styles.benefitsList}>
								<Text style={[styles.benefitItem, isDark && styles.textMuted]}>
									Unlimited participants
								</Text>
								<Text style={[styles.benefitItem, isDark && styles.textMuted]}>Video uploads</Text>
							</View>
							<TouchableOpacity style={styles.upgradeButton} onPress={showPaywall}>
								<Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
							</TouchableOpacity>
						</View>
					))}
			</View>

			<TouchableOpacity
				style={[styles.button, (!title.trim() || isLoading) && styles.buttonDisabled]}
				onPress={handleCreate}
				disabled={!title.trim() || isLoading}
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
		backgroundColor: "#fff",
	},
	containerDark: {
		backgroundColor: "#000",
	},
	loadingContainer: {
		justifyContent: "center",
		alignItems: "center",
	},
	content: {
		padding: 24,
	},
	form: {
		gap: 24,
		marginBottom: 32,
	},
	field: {
		gap: 8,
	},
	label: {
		fontSize: 16,
		fontWeight: "600",
		color: "#000",
	},
	input: {
		backgroundColor: "#f5f5f5",
		borderRadius: 14,
		paddingVertical: 16,
		paddingHorizontal: 20,
		fontSize: 17,
		color: "#000",
		fontWeight: "400",
	},
	inputDark: {
		backgroundColor: "#1a1a1a",
		color: "#fff",
	},
	dateButton: {
		backgroundColor: "#f5f5f5",
		borderRadius: 14,
		paddingVertical: 16,
		paddingHorizontal: 20,
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
	},
	dateButtonDark: {
		backgroundColor: "#1a1a1a",
	},
	dateText: {
		fontSize: 16,
		fontWeight: "500",
		color: "#000",
	},
	timeText: {
		fontSize: 16,
		color: "#666",
	},
	errorText: {
		color: "#ef4444",
		fontSize: 14,
	},
	infoBox: {
		backgroundColor: "#f0f9ff",
		borderRadius: 12,
		padding: 16,
	},
	infoText: {
		fontSize: 14,
		color: "#0369a1",
		lineHeight: 20,
	},
	button: {
		backgroundColor: "#000",
		paddingVertical: 18,
		borderRadius: 14,
		alignItems: "center",
	},
	buttonDisabled: {
		opacity: 0.5,
	},
	buttonText: {
		color: "#fff",
		fontSize: 18,
		fontWeight: "600",
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
		backgroundColor: "#f8f8f8",
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
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
		color: "#007AFF",
	},
	pickerDoneText: {
		fontSize: 17,
		fontWeight: "600",
		color: "#007AFF",
		textAlign: "right",
	},
	picker: {
		height: 216,
	},
	proBadge: {
		backgroundColor: "#fef3c7",
		borderRadius: 12,
		padding: 16,
		borderWidth: 1,
		borderColor: "#f59e0b",
	},
	proBadgeDark: {
		backgroundColor: "#422006",
		borderColor: "#b45309",
	},
	proBadgeTitle: {
		fontSize: 16,
		fontWeight: "600",
		color: "#b45309",
		marginBottom: 4,
	},
	proBadgeSubtitle: {
		fontSize: 14,
		color: "#92400e",
	},
	freeTierBanner: {
		backgroundColor: "#fef9c3",
		borderRadius: 12,
		padding: 16,
		borderWidth: 1,
		borderColor: "#eab308",
	},
	freeTierBannerDark: {
		backgroundColor: "#422006",
		borderColor: "#a16207",
	},
	freeTierTitle: {
		fontSize: 15,
		fontWeight: "600",
		color: "#000",
		marginBottom: 8,
	},
	freeTierSubtitle: {
		fontSize: 14,
		color: "#666",
		marginBottom: 12,
	},
	benefitsList: {
		gap: 6,
		marginBottom: 16,
	},
	benefitItem: {
		fontSize: 14,
		color: "#666",
		paddingLeft: 8,
	},
	upgradeButton: {
		backgroundColor: "#000",
		paddingVertical: 12,
		borderRadius: 10,
		alignItems: "center",
	},
	upgradeButtonText: {
		color: "#fff",
		fontSize: 15,
		fontWeight: "600",
	},
});
