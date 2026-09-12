import Feather from "@expo/vector-icons/Feather";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Pill } from "@/components/ui";
import { radius, shadow, space, theme, type } from "@/constants/theme";
import { daysUntilExpiry, expiryLabel, expiryTone, getEventStatus } from "@/lib/eventStatus";
import { usePhotoThumbnailUrl } from "@/lib/storage";
import { formatLocalizedDate } from "@/lib/utils";
import type { EventWithParticipants } from "@/store/eventStore";

const COVER = 104;

function CoverArt({ path, title }: { path?: string | null; title: string }) {
	const url = usePhotoThumbnailUrl(path);

	if (!url) {
		return (
			<View style={[styles.cover, styles.coverEmpty]}>
				<Text style={styles.coverInitial}>{(title.trim()[0] ?? "?").toUpperCase()}</Text>
			</View>
		);
	}

	return (
		<Image
			source={{ uri: url }}
			style={styles.cover}
			contentFit="cover"
			transition={160}
			cachePolicy="memory-disk"
			accessibilityIgnoresInvertColors
		/>
	);
}

export default function AlbumCard({
	event,
	onPress,
}: {
	event: EventWithParticipants;
	onPress: () => void;
}) {
	const status = getEventStatus(event);
	const isHost = event.userRole === "host";
	const days = daysUntilExpiry(event.expires_at);
	const expiry = expiryLabel(days);
	const mediaCount = (event.photoCount ?? 0) + (event.videoCount ?? 0);

	const countLabel =
		mediaCount > 0
			? `${mediaCount.toLocaleString()} ${mediaCount === 1 ? "item" : "items"}`
			: "No photos yet";

	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={`${event.title}, ${status.label}, ${countLabel}`}
			accessibilityHint="Opens the album"
			style={({ pressed }) => [styles.card, pressed && styles.pressed]}
		>
			<CoverArt path={event.coverPath} title={event.title} />

			<View style={styles.body}>
				<View style={styles.titleRow}>
					<Text style={styles.title} numberOfLines={1}>
						{event.title}
					</Text>
					{isHost ? <Feather name="key" size={13} color={theme.accentSoft} /> : null}
				</View>

				<Text style={styles.meta} numberOfLines={1}>
					{formatLocalizedDate(event.starts_at, { month: "short", day: "numeric" })} ·{" "}
					{event.participant_count ?? 0} {event.participant_count === 1 ? "guest" : "guests"}
				</Text>

				<View style={styles.pills}>
					<Pill label={status.label} tone={status.tone} dot={status.dot} />
					<Pill label={countLabel} />
					{expiry && status.key !== "expired" && days !== null && days <= 5 ? (
						<Pill label={expiry} tone={expiryTone(days)} />
					) : null}
				</View>
			</View>

			<Feather
				name="chevron-right"
				size={18}
				color={theme.textDisabled}
				style={styles.chevron}
			/>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		flexDirection: "row",
		alignItems: "stretch",
		backgroundColor: theme.card,
		borderRadius: radius.xl,
		borderWidth: 1,
		borderColor: theme.border,
		overflow: "hidden",
		...shadow.card,
	},
	pressed: {
		opacity: 0.75,
	},
	cover: {
		width: COVER,
		height: COVER,
		backgroundColor: theme.cardElevated,
	},
	coverEmpty: {
		alignItems: "center",
		justifyContent: "center",
	},
	coverInitial: {
		...type.title,
		color: theme.textDisabled,
	},
	body: {
		flex: 1,
		paddingVertical: space.md,
		paddingHorizontal: space.lg,
		justifyContent: "center",
		gap: 5,
		minWidth: 0,
	},
	titleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.sm,
	},
	title: {
		...type.subheading,
		color: theme.textPrimary,
		flexShrink: 1,
	},
	meta: {
		...type.caption,
		fontWeight: "500",
		color: theme.textMuted,
	},
	pills: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 6,
		marginTop: 3,
	},
	chevron: {
		alignSelf: "center",
		marginRight: space.md,
	},
});
