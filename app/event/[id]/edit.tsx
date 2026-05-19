import DateTimePicker from "@react-native-community/datetimepicker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "@/constants/theme";
import { useEventStore } from "@/store/eventStore";

export default function EditEvent() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const getEvent = useEventStore((s) => s.getEvent);
	const updateEvent = useEventStore((s) => s.updateEvent);
	const [title, setTitle] = useState("");
	const [startsAt, setStartsAt] = useState<Date | null>(null);
	const [endsAt, setEndsAt] = useState<Date | null>(null);
	const [allowOutside, setAllowOutside] = useState(false);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		if (!id) return;
		(async () => {
			try {
				const { event } = await getEvent(id);
				setTitle(event.title);
				setStartsAt(new Date(event.starts_at));
				setEndsAt(new Date(event.ends_at));
				setAllowOutside(event.allow_outside_window);
			} catch (e) {
				Alert.alert("Could not load", e instanceof Error ? e.message : "Try again");
			} finally {
				setLoading(false);
			}
		})();
	}, [id, getEvent]);

	async function handleSave() {
		if (!id || !startsAt || !endsAt) return;
		if (!title.trim()) {
			Alert.alert("Add a title", "Give the event a short name.");
			return;
		}
		if (endsAt <= startsAt) {
			Alert.alert("Fix the time window", "End must be after start.");
			return;
		}
		try {
			setSaving(true);
			await updateEvent(id, { title, startsAt, endsAt, allowOutsideWindow: allowOutside });
			router.back();
		} catch (e) {
			Alert.alert("Could not save", e instanceof Error ? e.message : "Try again");
		} finally {
			setSaving(false);
		}
	}

	if (loading || !startsAt || !endsAt) {
		return (
			<View style={[styles.safe, { alignItems: "center", justifyContent: "center" }]}>
				<ActivityIndicator color={theme.accent} />
			</View>
		);
	}

	return (
		<SafeAreaView style={styles.safe}>
			<KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
				<View style={styles.header}>
					<Pressable onPress={() => router.back()}>
						<Text style={styles.cancel}>Cancel</Text>
					</Pressable>
					<Text style={styles.title}>Edit event</Text>
					<Pressable onPress={handleSave} disabled={saving}>
						<Text style={styles.save}>{saving ? "..." : "Save"}</Text>
					</Pressable>
				</View>

				<ScrollView contentContainerStyle={styles.body}>
					<View style={styles.field}>
						<Text style={styles.label}>Title</Text>
						<TextInput style={styles.input} value={title} onChangeText={setTitle} placeholderTextColor={theme.textSubtle} />
					</View>

					<View style={styles.field}>
						<Text style={styles.label}>Start</Text>
						<DateTimePicker
							value={startsAt}
							mode="datetime"
							display={Platform.OS === "ios" ? "inline" : "default"}
							onChange={(_, d) => d && setStartsAt(d)}
							themeVariant="dark"
						/>
					</View>

					<View style={styles.field}>
						<Text style={styles.label}>End</Text>
						<DateTimePicker
							value={endsAt}
							mode="datetime"
							display={Platform.OS === "ios" ? "inline" : "default"}
							onChange={(_, d) => d && setEndsAt(d)}
							themeVariant="dark"
						/>
					</View>

					<View style={styles.row}>
						<View style={{ flex: 1 }}>
							<Text style={styles.label}>Allow photos outside window</Text>
						</View>
						<Switch value={allowOutside} onValueChange={setAllowOutside} trackColor={{ true: theme.accent, false: theme.surfaceAlt }} />
					</View>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1, backgroundColor: theme.bg },
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: 16,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: theme.border,
	},
	title: { color: theme.text, fontSize: 17, fontWeight: "600" },
	cancel: { color: theme.textMuted, fontSize: 16 },
	save: { color: theme.accentSoft, fontSize: 16, fontWeight: "600" },
	body: { padding: 20, gap: 20 },
	field: { gap: 8 },
	label: { color: theme.text, fontSize: 15, fontWeight: "500" },
	input: {
		backgroundColor: theme.surface,
		color: theme.text,
		padding: 14,
		borderRadius: theme.radius,
		fontSize: 16,
	},
	row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
