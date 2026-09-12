import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import {
	Button,
	Card,
	Eyebrow,
	ListRow,
	NavBar,
	Pill,
	Screen,
	ScreenScroll,
} from "@/components/ui";
import { radius, space, theme, type } from "@/constants/theme";
import { formatLocalizedDate, formatLocalizedTimeRange } from "@/lib/utils";
import { useEventStore } from "@/store/eventStore";

export default function ShareEventScreen() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const { fetchEventById, currentEvent, isLoading } = useEventStore();

	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (id) {
			fetchEventById(id);
		}
	}, [id, fetchEventById]);

	async function handleCopyCode() {
		if (currentEvent?.join_code) {
			await Clipboard.setStringAsync(currentEvent.join_code);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	}

	async function handleShare() {
		if (!currentEvent) return;

		const message = `${currentEvent.title}\n${formatLocalizedDate(currentEvent.starts_at, {
			weekday: "short",
			month: "short",
			day: "numeric",
		})} · ${formatLocalizedTimeRange(currentEvent.starts_at, currentEvent.ends_at, " – ")}\n\nJoin code: ${currentEvent.join_code}\nJoin the event here: https://recapd.app/join/${currentEvent.join_code}`;

		try {
			await Share.share({
				message,
				title: currentEvent.title,
			});
		} catch {
			Alert.alert("Error", "Failed to share");
		}
	}

	function handleDone() {
		router.replace(`/event/${id}`);
	}

	if (isLoading || !currentEvent) {
		return (
			<Screen style={styles.centered}>
				<ActivityIndicator size="large" color={theme.accent} />
			</Screen>
		);
	}

	// Deep link for the QR; the web URL redirects to the app or the store.
	const deepLink = `recapd://join/${currentEvent.join_code}`;
	const recentGuests = [...(currentEvent.participants ?? [])]
		.sort((a, b) => new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime())
		.slice(0, 4);

	return (
		<Screen edges="both">
			<NavBar title="Invite guests" subtitle={currentEvent.title} onBack={handleDone} dismiss />

			<ScreenScroll contentContainerStyle={styles.content}>
				<Card style={styles.qrCard}>
					<Eyebrow style={styles.centerText}>Scan to join</Eyebrow>

					<View style={styles.qrPlate}>
						<QRCode value={deepLink} size={188} backgroundColor="#FFFFFF" color={theme.pageDeep} />
					</View>

					<Text style={styles.codeLabel}>Or enter the code</Text>
					<Pressable
						onPress={handleCopyCode}
						accessibilityRole="button"
						accessibilityLabel={`Join code ${currentEvent.join_code}`}
						accessibilityHint="Copies the code to your clipboard"
						style={({ pressed }) => [styles.codeRow, pressed && { opacity: 0.7 }]}
					>
						{currentEvent.join_code.split("").map((character, index) => (
							<View key={`${character}-${index}`} style={styles.codeCell}>
								<Text style={styles.codeChar}>{character}</Text>
							</View>
						))}
					</Pressable>
					<Text style={[styles.copyHint, copied && styles.copyHintDone]}>
						{copied ? "Copied" : "Tap the code to copy"}
					</Text>
				</Card>

				<Button label="Share the link" icon="share" onPress={handleShare} />

				<Card padded={false}>
					<View style={styles.guestHeader}>
						<Eyebrow>Joined so far</Eyebrow>
						<Pill
							label={`${currentEvent.participant_count ?? recentGuests.length}`}
							tone="live"
							dot
						/>
					</View>
					{recentGuests.length > 0 ? (
						recentGuests.map((participant, index) => (
							<ListRow
								key={participant.id}
								title={participant.nickname || "Guest"}
								subtitle={participant.role === "host" ? "Host" : undefined}
								trailing={
									<Text style={styles.joinedAt}>{formatRelativeJoin(participant.joined_at)}</Text>
								}
								last={index === recentGuests.length - 1}
							/>
						))
					) : (
						<View style={styles.noGuests}>
							<Text style={styles.noGuestsText}>
								Nobody has scanned yet. Hold the code up and they will appear here.
							</Text>
						</View>
					)}
				</Card>

				<Text style={styles.footnote}>
					Guests type a first name and they are in. No account, no email, no password.
				</Text>
			</ScreenScroll>
		</Screen>
	);
}

function formatRelativeJoin(value: string) {
	const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.round(hours / 24)}d ago`;
}

const styles = StyleSheet.create({
	centered: {
		alignItems: "center",
		justifyContent: "center",
	},
	content: {
		paddingHorizontal: space.lg,
		paddingTop: space.xs,
		paddingBottom: space.xxl,
		gap: space.md,
	},
	qrCard: {
		alignItems: "center",
		paddingVertical: space.xl,
	},
	centerText: {
		textAlign: "center",
	},
	qrPlate: {
		marginTop: space.lg,
		padding: space.md,
		borderRadius: radius.xl,
		backgroundColor: "#FFFFFF",
	},
	codeLabel: {
		...type.eyebrow,
		color: theme.textMuted,
		marginTop: space.xl,
	},
	codeRow: {
		flexDirection: "row",
		gap: 6,
		marginTop: space.md,
	},
	codeCell: {
		width: 40,
		height: 50,
		borderRadius: radius.md,
		backgroundColor: theme.cardElevated,
		borderWidth: 1,
		borderColor: theme.border,
		alignItems: "center",
		justifyContent: "center",
	},
	codeChar: {
		fontSize: 22,
		fontWeight: "800",
		letterSpacing: -0.5,
		color: theme.textPrimary,
	},
	copyHint: {
		...type.caption,
		fontWeight: "600",
		color: theme.textMuted,
		marginTop: space.md,
	},
	copyHintDone: {
		color: theme.success,
	},
	guestHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: space.lg,
		paddingTop: space.lg,
		paddingBottom: space.sm,
	},
	joinedAt: {
		...type.caption,
		fontWeight: "500",
		color: theme.textMuted,
	},
	noGuests: {
		paddingHorizontal: space.lg,
		paddingBottom: space.lg,
	},
	noGuestsText: {
		...type.callout,
		color: theme.textMuted,
	},
	footnote: {
		...type.caption,
		fontWeight: "500",
		color: theme.textFaint,
		textAlign: "center",
		marginTop: space.xs,
		lineHeight: 17,
	},
});
