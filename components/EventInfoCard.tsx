import { isPast } from "date-fns";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { Alert, Platform, StyleSheet, Text, View } from "react-native";
import { Card, ListRow } from "@/components/ui";
import Icon from "@/components/ui/Icon";
import { radius, space, theme, type } from "@/constants/theme";
import {
	buildMapsUrl,
	formatCountdown,
	hasEventDetails,
	normalizeSchedule,
	shareEventToCalendar,
} from "@/lib/eventDetails";
import { logger } from "@/lib/logger";
import { formatLocalizedDate, formatLocalizedTime } from "@/lib/utils";
import type { Event } from "@/types/database";

type EventInfo = Pick<
	Event,
	"id" | "title" | "starts_at" | "ends_at" | "location" | "dress_code" | "details" | "schedule"
>;

export default function EventInfoCard({ event }: { event: EventInfo }) {
	const [now, setNow] = useState(() => new Date());
	const countdown = formatCountdown(event.starts_at, now);

	useEffect(() => {
		if (!countdown) return;
		const timer = setInterval(() => setNow(new Date()), 30_000);
		return () => clearInterval(timer);
	}, [countdown]);

	const schedule = normalizeSchedule(event.schedule);
	const location = event.location?.trim();
	const dressCode = event.dress_code?.trim();
	const details = event.details?.trim();
	const isEnded = isPast(new Date(event.ends_at));

	if (!countdown && !hasEventDetails(event)) return null;

	function openMaps() {
		if (!location) return;
		Linking.openURL(buildMapsUrl(location, Platform.OS)).catch(() =>
			Linking.openURL(buildMapsUrl(location, "web")).catch((error) =>
				logger.warn("Failed to open maps", error)
			)
		);
	}

	async function addToCalendar() {
		try {
			await shareEventToCalendar(event);
		} catch (error) {
			logger.error("Add to calendar failed", error, { eventId: event.id });
			Alert.alert("Couldn't add to calendar", "Please try again.");
		}
	}

	const rows = [
		countdown ? (
			<ListRow
				key="countdown"
				last
				icon="clock"
				title={countdown}
				subtitle={`${formatLocalizedDate(event.starts_at, {
					weekday: "short",
					month: "short",
					day: "numeric",
				})} · ${formatLocalizedTime(event.starts_at)}`}
			/>
		) : null,
		location ? (
			<ListRow
				key="location"
				last
				icon="map-pin"
				title="Location"
				subtitle={location}
				onPress={openMaps}
				accessibilityHint="Opens the location in Maps"
				trailing={<Icon name="external-link" size={17} color={theme.textDisabled} />}
			/>
		) : null,
		dressCode ? (
			<ListRow key="dress" last icon="tag" title="Dress code" subtitle={dressCode} />
		) : null,
		details ? (
			<View key="details" style={styles.block}>
				<Text style={styles.blockTitle}>Note from the host</Text>
				<Text style={styles.blockBody}>{details}</Text>
			</View>
		) : null,
		schedule.length > 0 ? (
			<View key="schedule" style={styles.block}>
				<Text style={styles.blockTitle}>Schedule</Text>
				{schedule.map((item) => (
					<View
						key={`${item.time}-${item.title}`}
						style={styles.scheduleRow}
						accessible
						accessibilityLabel={`${formatLocalizedTime(item.time)}, ${item.title}`}
					>
						<Text style={styles.scheduleTime}>{formatLocalizedTime(item.time)}</Text>
						<Text style={styles.scheduleTitle}>{item.title}</Text>
					</View>
				))}
			</View>
		) : null,
		isEnded ? null : (
			<ListRow
				key="calendar"
				last
				icon="calendar"
				title="Add to calendar"
				onPress={addToCalendar}
				accessibilityHint="Saves the event to your calendar"
			/>
		),
	].filter((row) => row !== null);

	return (
		<Card padded={false}>
			{rows.map((row, index) =>
				index === rows.length - 1 ? (
					<View key={row.key}>{row}</View>
				) : (
					<View key={row.key} style={styles.divider}>
						{row}
					</View>
				)
			)}
		</Card>
	);
}

const styles = StyleSheet.create({
	divider: {
		borderBottomWidth: 1,
		borderBottomColor: theme.border,
	},
	block: {
		paddingVertical: 13,
		paddingHorizontal: space.lg,
		gap: space.sm,
	},
	blockTitle: {
		...type.bodyStrong,
		color: theme.textPrimary,
	},
	blockBody: {
		...type.callout,
		color: theme.textMuted,
	},
	scheduleRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: space.md,
	},
	scheduleTime: {
		...type.caption,
		fontWeight: "700",
		color: theme.accentSoft,
		minWidth: 56,
		paddingVertical: 2,
		paddingHorizontal: space.sm,
		borderRadius: radius.sm,
		backgroundColor: theme.accentSurface,
		overflow: "hidden",
		textAlign: "center",
	},
	scheduleTitle: {
		...type.callout,
		color: theme.textPrimary,
		flex: 1,
	},
});
