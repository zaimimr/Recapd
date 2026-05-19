import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Modal,
	Pressable,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "@/constants/theme";
import { useEntitlement } from "@/lib/entitlement";
import { deepJoinUrl, webJoinUrl } from "@/lib/invite";
import { useEventStore } from "@/store/eventStore";
import type { EventRow } from "@/types/database";

export default function EventDetail() {
	const { id } = useLocalSearchParams<{ id: string }>();
	const getEvent = useEventStore((s) => s.getEvent);
	const deleteEvent = useEventStore((s) => s.deleteEvent);
	const [event, setEvent] = useState<EventRow | null>(null);
	const [role, setRole] = useState<"host" | "guest">("guest");
	const [loading, setLoading] = useState(true);
	const [shareOpen, setShareOpen] = useState(false);
	const entitlement = useEntitlement();

	useEffect(() => {
		if (!id) return;
		(async () => {
			try {
				const { event: e, role: r } = await getEvent(id);
				setEvent(e);
				setRole(r);
			} catch (err) {
				Alert.alert("Could not load event", err instanceof Error ? err.message : "Try again");
			} finally {
				setLoading(false);
			}
		})();
	}, [id, getEvent]);

	async function handleDelete() {
		if (!event) return;
		Alert.alert("Delete event?", "All photos in this event will be removed.", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Delete",
				style: "destructive",
				onPress: async () => {
					await deleteEvent(event.id);
					router.replace("/(tabs)/events");
				},
			},
		]);
	}

	async function copyCode() {
		if (!event) return;
		await Clipboard.setStringAsync(event.join_code);
		Alert.alert("Copied", `Code ${event.join_code} copied to clipboard.`);
	}

	async function shareLink() {
		if (!event) return;
		await Share.share({
			message: `Join "${event.title}" on Recapd: ${webJoinUrl(event.join_code)}`,
			url: deepJoinUrl(event.join_code),
		});
	}

	if (loading) {
		return (
			<View style={[styles.safe, { alignItems: "center", justifyContent: "center" }]}>
				<ActivityIndicator color={theme.accent} />
			</View>
		);
	}
	if (!event) {
		return (
			<SafeAreaView style={styles.safe}>
				<Text style={styles.body}>Event not found.</Text>
			</SafeAreaView>
		);
	}

	const isHost = role === "host";
	const startsLabel = formatRange(event.starts_at, event.ends_at);

	return (
		<SafeAreaView style={styles.safe}>
			<View style={styles.header}>
				<Pressable onPress={() => router.back()} style={styles.headerBtn}>
					<Ionicons name="chevron-back" size={24} color={theme.text} />
				</Pressable>
				<View style={styles.headerActions}>
					<Pressable style={styles.headerBtn} onPress={() => setShareOpen(true)}>
						<Ionicons name="qr-code-outline" size={22} color={theme.text} />
					</Pressable>
					<Pressable style={styles.headerBtn} onPress={shareLink}>
						<Ionicons name="share-outline" size={22} color={theme.text} />
					</Pressable>
					{isHost ? (
						<Pressable
							style={styles.headerBtn}
							onPress={() => router.push({ pathname: "/event/[id]/edit", params: { id: event.id } })}
						>
							<Ionicons name="settings-outline" size={22} color={theme.text} />
						</Pressable>
					) : null}
				</View>
			</View>

			<ScrollView>
				<View style={styles.titleBlock}>
					<Text style={styles.title}>{event.title}</Text>
					<Text style={styles.subtitle}>{startsLabel}</Text>
				</View>

				<View style={styles.codeCard}>
					<Text style={styles.codeLabel}>Join code</Text>
					<Pressable onPress={copyCode}>
						<Text style={styles.code}>{event.join_code}</Text>
					</Pressable>
					<Text style={styles.codeHelp}>Tap to copy. Tap the QR icon to show the QR.</Text>
				</View>

				<Pressable
					style={styles.uploadCta}
					onPress={() => router.push({ pathname: "/contribute/[eventId]", params: { eventId: event.id } })}
				>
					<Ionicons name="cloud-upload-outline" size={20} color="#fff" />
					<Text style={styles.uploadCtaText}>Add photos and videos</Text>
				</Pressable>

				<View style={styles.galleryPlaceholder}>
					<Ionicons name="images-outline" size={36} color={theme.textSubtle} />
					<Text style={styles.placeholderTitle}>Gallery</Text>
					<Text style={styles.placeholderBody}>
						The 3-column grid and full-res viewer will land here.
					</Text>
				</View>

				{isHost ? (
					<View style={styles.hostActions}>
						<View style={styles.placeholderSlot}>
							<Ionicons name="notifications-outline" size={20} color={theme.textMuted} />
							<Text style={styles.placeholderSlotText}>Nudge guests</Text>
						</View>
						{entitlement === "free" ? (
							<View style={styles.placeholderSlot}>
								<Ionicons name="sparkles-outline" size={20} color={theme.accentSoft} />
								<Text style={styles.placeholderSlotText}>Unlock Pro features</Text>
							</View>
						) : null}
						<Pressable style={styles.deleteBtn} onPress={handleDelete}>
							<Text style={styles.deleteBtnText}>Delete event</Text>
						</Pressable>
					</View>
				) : null}
			</ScrollView>

			<Modal visible={shareOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShareOpen(false)}>
				<SafeAreaView style={styles.safe}>
					<View style={styles.modalHeader}>
						<Text style={styles.modalTitle}>Share</Text>
						<Pressable onPress={() => setShareOpen(false)}>
							<Text style={styles.modalClose}>Done</Text>
						</Pressable>
					</View>
					<View style={styles.qrWrap}>
						<View style={styles.qrCard}>
							<QRCode value={webJoinUrl(event.join_code)} size={220} backgroundColor="#fff" />
						</View>
						<Text style={styles.qrCode}>{event.join_code}</Text>
						<Text style={styles.qrUrl}>{webJoinUrl(event.join_code)}</Text>
					</View>
					<View style={{ padding: 20, gap: 12 }}>
						<Pressable style={styles.shareBtn} onPress={shareLink}>
							<Ionicons name="share-outline" size={20} color="#fff" />
							<Text style={styles.shareBtnText}>Share link</Text>
						</Pressable>
						<Pressable style={styles.shareBtnSecondary} onPress={copyCode}>
							<Ionicons name="copy-outline" size={20} color={theme.text} />
							<Text style={styles.shareBtnSecondaryText}>Copy code</Text>
						</Pressable>
					</View>
				</SafeAreaView>
			</Modal>
		</SafeAreaView>
	);
}

function formatRange(start: string, end: string) {
	const s = new Date(start);
	const e = new Date(end);
	const sameDay = s.toDateString() === e.toDateString();
	const dateOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
	const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
	if (sameDay) {
		return `${s.toLocaleDateString(undefined, dateOpts)}  ·  ${s.toLocaleTimeString(undefined, timeOpts)} - ${e.toLocaleTimeString(undefined, timeOpts)}`;
	}
	return `${s.toLocaleDateString(undefined, dateOpts)} - ${e.toLocaleDateString(undefined, dateOpts)}`;
}

const styles = StyleSheet.create({
	safe: { flex: 1, backgroundColor: theme.bg },
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	headerActions: { flexDirection: "row", gap: 4 },
	headerBtn: { padding: 8 },
	titleBlock: { padding: 20 },
	title: { color: theme.text, fontSize: 32, fontWeight: "700" },
	subtitle: { color: theme.textMuted, marginTop: 8, fontSize: 14 },
	body: { color: theme.text, padding: 20 },
	codeCard: {
		marginHorizontal: 20,
		backgroundColor: theme.surface,
		borderRadius: theme.radiusLg,
		padding: 20,
		alignItems: "center",
	},
	codeLabel: { color: theme.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
	code: { color: theme.text, fontSize: 36, fontWeight: "700", letterSpacing: 4, marginTop: 8 },
	codeHelp: { color: theme.textSubtle, fontSize: 12, marginTop: 8, textAlign: "center" },
	uploadCta: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		backgroundColor: theme.accent,
		marginHorizontal: 20,
		marginTop: 16,
		padding: 16,
		borderRadius: theme.radius,
	},
	uploadCtaText: { color: "#fff", fontSize: 16, fontWeight: "600" },
	galleryPlaceholder: {
		margin: 20,
		padding: 32,
		borderRadius: theme.radius,
		alignItems: "center",
		borderWidth: 1,
		borderColor: theme.border,
		borderStyle: "dashed",
	},
	placeholderTitle: { color: theme.text, fontSize: 16, fontWeight: "600", marginTop: 8 },
	placeholderBody: { color: theme.textMuted, fontSize: 13, marginTop: 4, textAlign: "center" },
	hostActions: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
	placeholderSlot: {
		flexDirection: "row",
		gap: 12,
		alignItems: "center",
		backgroundColor: theme.surface,
		padding: 14,
		borderRadius: theme.radius,
	},
	placeholderSlotText: { color: theme.text, fontSize: 15 },
	deleteBtn: { padding: 14, alignItems: "center", marginTop: 12 },
	deleteBtnText: { color: theme.danger, fontSize: 15, fontWeight: "600" },
	modalHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingVertical: 12,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: theme.border,
	},
	modalTitle: { color: theme.text, fontSize: 18, fontWeight: "600" },
	modalClose: { color: theme.accentSoft, fontSize: 16, fontWeight: "600" },
	qrWrap: { alignItems: "center", padding: 24, gap: 16 },
	qrCard: { backgroundColor: "#fff", padding: 20, borderRadius: theme.radiusLg },
	qrCode: { color: theme.text, fontSize: 28, fontWeight: "700", letterSpacing: 4 },
	qrUrl: { color: theme.textMuted, fontSize: 12 },
	shareBtn: {
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		gap: 8,
		backgroundColor: theme.accent,
		padding: 16,
		borderRadius: theme.radius,
	},
	shareBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
	shareBtnSecondary: {
		flexDirection: "row",
		justifyContent: "center",
		alignItems: "center",
		gap: 8,
		padding: 16,
		borderRadius: theme.radius,
		borderWidth: 1,
		borderColor: theme.border,
	},
	shareBtnSecondaryText: { color: theme.text, fontSize: 16, fontWeight: "500" },
});
