import Feather from "@expo/vector-icons/Feather";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { isBefore } from "date-fns";
import { useLocalSearchParams, useRouter } from "expo-router";
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
	Eyebrow,
	Field,
	ListRow,
	NavBar,
	Screen,
	ScreenScroll,
	SectionHeader,
} from "@/components/ui";
import { radius, space, theme, type } from "@/constants/theme";
import { computeEventExpiry } from "@/lib/dateUtils";
import { formatLocalizedDate, formatLocalizedTime } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { useEventStore } from "@/store/eventStore";

export default function EditEventScreen() {
	const router = useRouter();
	const { id } = useLocalSearchParams<{ id: string }>();
	const user = useAuthStore((state) => state.user);
	const { currentEvent, fetchEventById, updateEvent, deleteEvent, isLoading } = useEventStore();

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
			<Screen style={styles.loadingContainer}>
				<ActivityIndicator size="large" color={theme.accent} />
			</Screen>
		);
	}

	const newExpiryDate = computeEventExpiry(endDate, currentEvent?.created_at);

	return (
		<Screen edges="both">
			<NavBar title="Edit album" onBack={() => router.back()} />

			<ScreenScroll contentContainerStyle={styles.content}>
				<SectionHeader eyebrow="Edit" title="Adjust the name and window" />
				<Text style={styles.lede}>
					Guests keep everything they have already added. Only the window for new media changes.
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

				<Card style={styles.infoCard}>
					<View style={styles.infoRow}>
						<Feather name="clock" size={17} color={theme.textMuted} />
						<Text style={styles.infoText}>
							The album closes on{" "}
							{formatLocalizedDate(newExpiryDate, {
								month: "long",
								day: "numeric",
								year: "numeric",
							})}
							, two weeks after it ends.
						</Text>
					</View>
				</Card>

				<Button
					label="Save changes"
					loading={isSaving}
					disabled={!title.trim() || isLoading || isDeleting}
					onPress={handleSave}
					style={styles.save}
				/>

				<View style={styles.danger}>
					<Eyebrow style={styles.dangerLabel}>Danger zone</Eyebrow>
					<Button
						label="Delete this album"
						icon="trash-2"
						variant="danger"
						loading={isDeleting}
						disabled={isSaving}
						onPress={handleDelete}
					/>
					<Text style={styles.dangerNote}>
						Deleting removes every photo for every guest, immediately and permanently.
					</Text>
				</View>
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
	infoCard: {
		paddingVertical: space.md,
	},
	infoRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.md,
	},
	infoText: {
		...type.caption,
		fontWeight: "500",
		color: theme.textMuted,
		flex: 1,
		lineHeight: 17,
	},
	save: {
		marginTop: space.sm,
	},
	danger: {
		gap: space.md,
		marginTop: space.xxl,
		paddingTop: space.xl,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: theme.border,
	},
	dangerLabel: {
		color: theme.danger,
	},
	dangerNote: {
		...type.caption,
		fontWeight: "500",
		color: theme.textFaint,
		lineHeight: 17,
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
