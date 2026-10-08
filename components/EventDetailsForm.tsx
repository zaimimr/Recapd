import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button, Card, Field, IconButton, ListRow } from "@/components/ui";
import Icon from "@/components/ui/Icon";
import { hitSlop, radius, space, theme, type } from "@/constants/theme";
import { EVENT_DETAIL_LIMITS, type EventDetailsDraft } from "@/lib/eventDetails";
import { formatLocalizedDate, formatLocalizedTime } from "@/lib/utils";

interface EventDetailsFormProps {
	value: EventDetailsDraft;
	onChange: (value: EventDetailsDraft) => void;
	defaultTime: Date;
}

export default function EventDetailsForm({ value, onChange, defaultTime }: EventDetailsFormProps) {
	const [expanded, setExpanded] = useState(
		() => !!value.location || !!value.dressCode || !!value.details || value.schedule.length > 0
	);
	const [editingIndex, setEditingIndex] = useState<number | null>(null);
	const [tempDate, setTempDate] = useState(defaultTime);
	const [androidPickerMode, setAndroidPickerMode] = useState<"date" | "time">("date");

	function update(patch: Partial<EventDetailsDraft>) {
		onChange({ ...value, ...patch });
	}

	function updateRow(index: number, patch: Partial<EventDetailsDraft["schedule"][number]>) {
		update({
			schedule: value.schedule.map((item, i) => (i === index ? { ...item, ...patch } : item)),
		});
	}

	function addRow() {
		const last = value.schedule[value.schedule.length - 1];
		const time = last ? new Date(new Date(last.time).getTime() + 60 * 60 * 1000) : defaultTime;
		update({ schedule: [...value.schedule, { time: time.toISOString(), title: "" }] });
	}

	function removeRow(index: number) {
		update({ schedule: value.schedule.filter((_, i) => i !== index) });
	}

	function openPicker(index: number) {
		setTempDate(new Date(value.schedule[index].time));
		setAndroidPickerMode("date");
		setEditingIndex(index);
	}

	function confirmPicker(date: Date = tempDate) {
		if (editingIndex !== null) updateRow(editingIndex, { time: date.toISOString() });
		setEditingIndex(null);
	}

	function handlePickerChange(event: DateTimePickerEvent, selectedDate?: Date) {
		if (Platform.OS !== "android") {
			if (selectedDate) setTempDate(selectedDate);
			return;
		}
		if (event.type === "dismissed") {
			setEditingIndex(null);
			return;
		}
		if (event.type === "set" && selectedDate) {
			if (androidPickerMode === "date") {
				setTempDate(selectedDate);
				setAndroidPickerMode("time");
			} else {
				confirmPicker(selectedDate);
			}
		}
	}

	return (
		<View style={styles.wrap}>
			<Card padded={false}>
				<ListRow
					icon="list"
					iconTone="neutral"
					title="More details"
					subtitle="Location, dress code, schedule"
					onPress={() => setExpanded((current) => !current)}
					accessibilityHint={expanded ? "Hides the extra details" : "Shows the extra details"}
					trailing={
						<Icon
							name={expanded ? "chevron-up" : "chevron-down"}
							size={17}
							color={theme.textDisabled}
						/>
					}
					last
				/>
			</Card>

			{expanded ? (
				<View style={styles.fields}>
					<Field
						label="Location"
						icon="map-pin"
						placeholder="Address or venue"
						value={value.location}
						onChangeText={(location) => update({ location })}
						maxLength={EVENT_DETAIL_LIMITS.location}
					/>
					<Field
						label="Dress code"
						icon="tag"
						placeholder="Black tie"
						value={value.dressCode}
						onChangeText={(dressCode) => update({ dressCode })}
						maxLength={EVENT_DETAIL_LIMITS.dressCode}
					/>
					<Field
						label="Note to guests"
						placeholder="Parking, gifts, anything they should know"
						value={value.details}
						onChangeText={(details) => update({ details })}
						maxLength={EVENT_DETAIL_LIMITS.details}
						multiline
						style={styles.multiline}
					/>

					<View style={styles.schedule}>
						<Text style={styles.label}>Schedule</Text>
						{value.schedule.map((item, index) => (
							<View key={`${index}-${item.time}`} style={styles.row}>
								<Pressable
									onPress={() => openPicker(index)}
									hitSlop={hitSlop}
									accessibilityRole="button"
									accessibilityLabel={`Time, ${formatLocalizedTime(new Date(item.time))}`}
									accessibilityHint="Opens the date and time picker"
									style={({ pressed }) => [styles.timeChip, pressed && styles.pressed]}
								>
									<Text style={styles.timeText}>{formatLocalizedTime(new Date(item.time))}</Text>
									<Text style={styles.dateText}>
										{formatLocalizedDate(new Date(item.time), { month: "short", day: "numeric" })}
									</Text>
								</Pressable>
								<TextInput
									style={styles.titleInput}
									placeholder="Dinner"
									placeholderTextColor={theme.textMuted}
									selectionColor={theme.accent}
									cursorColor={theme.accent}
									value={item.title}
									onChangeText={(title) => updateRow(index, { title })}
									maxLength={EVENT_DETAIL_LIMITS.scheduleTitle}
									accessibilityLabel={`Schedule item ${index + 1}`}
								/>
								<IconButton
									icon="x"
									tone="plain"
									accessibilityLabel={`Remove schedule item ${index + 1}`}
									onPress={() => removeRow(index)}
								/>
							</View>
						))}
						<Button
							label="Add to schedule"
							icon="plus"
							variant="secondary"
							size="md"
							disabled={value.schedule.length >= EVENT_DETAIL_LIMITS.scheduleItems}
							onPress={addRow}
						/>
					</View>
				</View>
			) : null}

			{Platform.OS === "ios" && editingIndex !== null ? (
				<Modal
					visible
					transparent
					animationType="slide"
					onRequestClose={() => setEditingIndex(null)}
				>
					<Pressable style={styles.modalOverlay} onPress={() => setEditingIndex(null)}>
						<Pressable style={styles.pickerSheet}>
							<View style={styles.pickerHeader}>
								<Button
									label="Cancel"
									variant="ghost"
									size="sm"
									full={false}
									onPress={() => setEditingIndex(null)}
								/>
								<Text style={styles.pickerTitle}>Time</Text>
								<Button
									label="Done"
									variant="ghost"
									size="sm"
									full={false}
									onPress={() => confirmPicker()}
								/>
							</View>
							<DateTimePicker
								value={tempDate}
								mode="datetime"
								display="spinner"
								onChange={handlePickerChange}
								textColor={theme.textPrimary}
								themeVariant="dark"
								style={styles.picker}
							/>
						</Pressable>
					</Pressable>
				</Modal>
			) : null}

			{Platform.OS === "android" && editingIndex !== null ? (
				<DateTimePicker
					value={tempDate}
					mode={androidPickerMode}
					display="default"
					onChange={handlePickerChange}
				/>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		gap: space.lg,
	},
	fields: {
		gap: space.lg,
	},
	multiline: {
		minHeight: 96,
		textAlignVertical: "top",
	},
	schedule: {
		gap: space.sm,
	},
	label: {
		...type.bodyStrong,
		color: theme.textPrimary,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.sm,
		minHeight: 52,
		paddingLeft: space.sm,
		paddingRight: space.xs,
		borderRadius: radius.lg,
		backgroundColor: theme.cardElevated,
		borderWidth: 1,
		borderColor: theme.border,
	},
	timeChip: {
		minWidth: 72,
		minHeight: 44,
		paddingHorizontal: space.sm,
		borderRadius: radius.md,
		backgroundColor: theme.accentSurface,
		alignItems: "center",
		justifyContent: "center",
	},
	timeText: {
		...type.caption,
		fontWeight: "700",
		color: theme.accentSoft,
	},
	dateText: {
		...type.caption,
		fontWeight: "500",
		color: theme.textMuted,
	},
	titleInput: {
		flex: 1,
		...type.body,
		fontWeight: "600",
		color: theme.textPrimary,
		paddingVertical: space.md,
	},
	pressed: {
		opacity: 0.75,
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
