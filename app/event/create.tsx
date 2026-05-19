import DateTimePicker from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { useState } from "react";
import {
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
import { useAuthStore } from "@/store/authStore";
import { useEventStore } from "@/store/eventStore";

export default function CreateEvent() {
	const userId = useAuthStore((s) => s.userId);
	const createEvent = useEventStore((s) => s.createEvent);
	const [title, setTitle] = useState("");
	const [startsAt, setStartsAt] = useState(roundToNextHour(new Date()));
	const [endsAt, setEndsAt] = useState(addHours(roundToNextHour(new Date()), 4));
	const [allowOutside, setAllowOutside] = useState(false);
	const [saving, setSaving] = useState(false);

	async function handleCreate() {
		if (!userId) return;
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
			const event = await createEvent(userId, {
				title,
				startsAt,
				endsAt,
				allowOutsideWindow: allowOutside,
			});
			router.replace({ pathname: "/event/[id]", params: { id: event.id } });
		} catch (e) {
			Alert.alert("Could not create event", e instanceof Error ? e.message : "Try again");
		} finally {
			setSaving(false);
		}
	}

	return (
		<SafeAreaView style={styles.safe}>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : undefined}
				style={{ flex: 1 }}
			>
				<View style={styles.header}>
					<Pressable onPress={() => router.back()}>
						<Text style={styles.cancel}>Cancel</Text>
					</Pressable>
					<Text style={styles.title}>New event</Text>
					<Pressable onPress={handleCreate} disabled={saving}>
						<Text style={styles.save}>{saving ? "..." : "Create"}</Text>
					</Pressable>
				</View>

				<ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
					<Field label="Title">
						<TextInput
							style={styles.input}
							placeholder="Mia's birthday"
							placeholderTextColor={theme.textSubtle}
							value={title}
							onChangeText={setTitle}
						/>
					</Field>

					<Field label="Start">
						<DateTimePicker
							value={startsAt}
							mode="datetime"
							display={Platform.OS === "ios" ? "inline" : "default"}
							onChange={(_, d) => d && setStartsAt(d)}
							themeVariant="dark"
						/>
					</Field>

					<Field label="End">
						<DateTimePicker
							value={endsAt}
							mode="datetime"
							display={Platform.OS === "ios" ? "inline" : "default"}
							onChange={(_, d) => d && setEndsAt(d)}
							themeVariant="dark"
						/>
					</Field>

					<View style={styles.row}>
						<View style={{ flex: 1 }}>
							<Text style={styles.label}>Allow photos outside window</Text>
							<Text style={styles.help}>Off keeps things tight to the event time.</Text>
						</View>
						<Switch value={allowOutside} onValueChange={setAllowOutside} trackColor={{ true: theme.accent, false: theme.surfaceAlt }} />
					</View>
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<View style={styles.field}>
			<Text style={styles.label}>{label}</Text>
			{children}
		</View>
	);
}

function roundToNextHour(d: Date) {
	const out = new Date(d);
	out.setMinutes(0, 0, 0);
	out.setHours(out.getHours() + 1);
	return out;
}

function addHours(d: Date, h: number) {
	return new Date(d.getTime() + h * 3600_000);
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
	help: { color: theme.textMuted, fontSize: 13, marginTop: 4 },
	input: {
		backgroundColor: theme.surface,
		color: theme.text,
		padding: 14,
		borderRadius: theme.radius,
		fontSize: 16,
	},
	row: { flexDirection: "row", alignItems: "center", gap: 12 },
});
