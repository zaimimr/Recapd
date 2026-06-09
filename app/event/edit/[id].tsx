import FontAwesome from "@expo/vector-icons/FontAwesome";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { isBefore } from "date-fns";
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
import { computeEventExpiry } from "@/lib/dateUtils";
import { formatLocalizedDate, formatLocalizedTime } from "@/lib/utils";
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

	const newExpiryDate = computeEventExpiry(endDate, currentEvent?.created_at);

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
				<View style={[styles.heroPanel, isDark && styles.panelDark]}>
					<Text style={[styles.kicker, isDark && styles.textMuted]}>Edit</Text>
					<Text style={[styles.heroTitle, isDark && styles.textDark]}>Refine the event window</Text>
					<Text style={[styles.heroText, isDark && styles.textMuted]}>
						Update the title and timing without breaking the clean feed structure guests already
						see.
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
						/>
					</View>

					<View style={[styles.field, isDark && styles.panelDark]}>
						<Text style={[styles.label, isDark && styles.textDark]}>Start Time</Text>
						<TouchableOpacity
							style={[styles.dateButton, isDark && styles.dateButtonDark]}
							onPress={openStartPicker}
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
							Photos will expire on{" "}
							{formatLocalizedDate(newExpiryDate, {
								month: "short",
								day: "numeric",
								year: "numeric",
							})}{" "}
							(14 days after event ends).
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

				<View style={[styles.dangerZone, isDark && styles.panelDark]}>
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
		fontWeight: "700",
		letterSpacing: 1.2,
		textTransform: "uppercase",
		color: "#6b7280",
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
		fontSize: 18,
		color: "#111827",
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
		backgroundColor: "#111827",
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
		fontWeight: "600",
	},
	textDark: {
		color: "#fff",
	},
	textMuted: {
		color: "#888",
	},
	dangerZone: {
		marginTop: 12,
		paddingHorizontal: 16,
		paddingVertical: 16,
		borderWidth: 1,
		borderColor: "#e5e7eb",
	},
	dangerZoneTitle: {
		fontSize: 13,
		fontWeight: "600",
		color: "#6b7280",
		textTransform: "uppercase",
		letterSpacing: 1,
		marginBottom: 12,
	},
	deleteButton: {
		backgroundColor: "#ef4444",
		paddingVertical: 16,
		borderRadius: 999,
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
