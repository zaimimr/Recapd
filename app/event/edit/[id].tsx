import FontAwesome from "@expo/vector-icons/FontAwesome";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { addDays, format, isBefore } from "date-fns";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
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
import { useAuthStore } from "@/store/authStore";
import { useEventStore } from "@/store/eventStore";

export default function EditEventScreen() {
	const router = useRouter();
	const { id } = useLocalSearchParams<{ id: string }>();
	const user = useAuthStore((state) => state.user);
	const { currentEvent, fetchEventById, updateEvent, deleteEvent, isLoading } = useEventStore();
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";

	const [title, setTitle] = useState("");
	const [startDate, setStartDate] = useState(new Date());
	const [endDate, setEndDate] = useState(new Date());
	const [activePicker, setActivePicker] = useState<"start" | "end" | null>(null);
	const [tempDate, setTempDate] = useState<Date>(new Date());
	const [androidPickerMode, setAndroidPickerMode] = useState<"date" | "time">("date");
	const [error, setError] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isLoadingEvent, setIsLoadingEvent] = useState(true);

	useEffect(() => {
		async function loadEvent() {
			if (id) {
				const event = await fetchEventById(id);
				if (event) {
					setTitle(event.title);
					setStartDate(new Date(event.starts_at));
					setEndDate(new Date(event.ends_at));
				}
				setIsLoadingEvent(false);
			}
		}
		loadEvent();
	}, [id, fetchEventById]);

	const isHost = currentEvent?.participants?.some(
		(p) => p.user_id === user?.id && p.role === "host"
	);

	useEffect(() => {
		if (!isLoadingEvent && (!currentEvent || !isHost)) {
			Alert.alert("Error", "You do not have permission to edit this event");
			router.back();
		}
	}, [isLoadingEvent, currentEvent, isHost, router]);
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
				setEndDate(new Date(finalDate.getTime() + 4 * 60 * 60 * 1000));
			}
		} else if (activePicker === "end") {
			setEndDate(finalDate);
		}
		setActivePicker(null);
	}

	function cancelSelection() {
		setActivePicker(null);
	}

	async function handleSave() {
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
		setIsSaving(true);

		const success = await updateEvent(id!, {
			title: trimmedTitle,
			starts_at: startDate.toISOString(),
			ends_at: endDate.toISOString(),
		});

		setIsSaving(false);

		if (success) {
			router.back();
		} else {
			Alert.alert("Error", "Failed to update event. Please try again.");
		}
	}

	function handleDelete() {
		Alert.alert(
			"Delete Event",
			"This will permanently delete this event and all its photos. This cannot be undone.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Delete",
					style: "destructive",
					onPress: async () => {
						if (!user || !id) return;
						setIsDeleting(true);
						const success = await deleteEvent(id, user.id);
						setIsDeleting(false);
						if (success) {
							router.replace("/(tabs)/events");
						} else {
							Alert.alert("Error", "Failed to delete event. Please try again.");
						}
					},
				},
			]
		);
	}

	if (isLoadingEvent) {
		return (
			<View style={[styles.container, isDark && styles.containerDark, styles.loadingContainer]}>
				<ActivityIndicator size="large" color={isDark ? "#fff" : "#000"} />
			</View>
		);
	}

	const newExpiryDate = addDays(endDate, 14);

	return (
		<>
			<Stack.Screen
				options={{
					title: "Edit Event",
				}}
			/>
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
							Photos will expire on {format(newExpiryDate, "MMM d, yyyy")} (14 days after event
							ends).
						</Text>
					</View>
				</View>

				<TouchableOpacity
					style={[
						styles.button,
						(!title.trim() || isSaving || isLoading || isDeleting) && styles.buttonDisabled,
					]}
					onPress={handleSave}
					disabled={!title.trim() || isSaving || isLoading || isDeleting}
				>
					{isSaving ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text style={styles.buttonText}>Save Changes</Text>
					)}
				</TouchableOpacity>

				<View style={styles.dangerZone}>
					<Text style={[styles.dangerZoneTitle, isDark && styles.textMuted]}>Danger Zone</Text>
					<TouchableOpacity
						style={[styles.deleteButton, (isDeleting || isSaving) && styles.buttonDisabled]}
						onPress={handleDelete}
						disabled={isDeleting || isSaving}
					>
						{isDeleting ? (
							<ActivityIndicator color="#fff" />
						) : (
							<>
								<FontAwesome name="trash" size={16} color="#fff" style={styles.deleteIcon} />
								<Text style={styles.deleteButtonText}>Delete Event</Text>
							</>
						)}
					</TouchableOpacity>
				</View>

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
		</>
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
		fontSize: 18,
		color: "#000",
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
	dangerZone: {
		marginTop: 32,
		paddingTop: 24,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: "#e5e5e5",
	},
	dangerZoneTitle: {
		fontSize: 13,
		fontWeight: "600",
		color: "#666",
		textTransform: "uppercase",
		letterSpacing: 0.5,
		marginBottom: 12,
	},
	deleteButton: {
		backgroundColor: "#ef4444",
		paddingVertical: 16,
		borderRadius: 14,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
	},
	deleteIcon: {
		marginRight: 8,
	},
	deleteButtonText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "600",
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
});
