import { useCallback, useEffect, useRef, useState } from "react";
import {
	Alert,
	Animated,
	Dimensions,
	FlatList,
	Modal,
	PanResponder,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, Button, Eyebrow, IconButton, Pill } from "@/components/ui";
import { radius, space, theme, type } from "@/constants/theme";
import { type HostReminderType, sendHostReminder } from "@/lib/hostReminders";
import type { ParticipantWithStats } from "@/store/eventStore";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.55;
const DRAG_THRESHOLD = 50;

interface GuestSheetProps {
	visible: boolean;
	onClose: () => void;
	participants: ParticipantWithStats[];
	isHost: boolean;
	currentUserId: string;
	eventId: string;
	onRemoveParticipant: (userId: string, displayName: string) => void;
	onLeaveEvent: () => void;
}

export default function GuestSheet({
	visible,
	onClose,
	participants,
	isHost,
	currentUserId,
	eventId,
	onRemoveParticipant,
	onLeaveEvent,
}: GuestSheetProps) {
	const insets = useSafeAreaInsets();
	const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
	const backdropOpacity = useRef(new Animated.Value(0)).current;
	const [sendingType, setSendingType] = useState<HostReminderType | null>(null);

	const handleSendReminder = useCallback(
		async (type: HostReminderType) => {
			if (sendingType) return;
			setSendingType(type);
			const result = await sendHostReminder(eventId, type);
			setSendingType(null);

			if (result.ok) {
				if (result.sent === 0) {
					Alert.alert(
						"Nobody to remind yet",
						"None of your guests have turned notifications on, so there was nobody to reach."
					);
					return;
				}
				const noun = result.sent === 1 ? "guest" : "guests";
				Alert.alert("Reminder sent", `Reminder sent to ${result.sent} ${noun}.`);
				return;
			}

			if (result.reason === "cooldown") {
				const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
				Alert.alert(
					"Slow down",
					`You can send another reminder in about ${minutes} minute${minutes === 1 ? "" : "s"}.`
				);
				return;
			}

			if (result.reason === "event_inactive") {
				Alert.alert("Event ended", "This event is no longer active.");
				return;
			}

			if (result.reason === "unauthorized") {
				Alert.alert("Not allowed", "Only the event host can send reminders.");
				return;
			}

			Alert.alert("Couldn't send reminder", result.message ?? "Please try again.");
		},
		[eventId, sendingType]
	);

	const sortedParticipants = [...participants].sort((a, b) => {
		if (a.role === "host" && b.role !== "host") return -1;
		if (a.role !== "host" && b.role === "host") return 1;
		return b.photoCount - a.photoCount;
	});

	const openSheet = useCallback(() => {
		Animated.parallel([
			Animated.spring(translateY, {
				toValue: 0,
				useNativeDriver: true,
				damping: 20,
				stiffness: 200,
			}),
			Animated.timing(backdropOpacity, {
				toValue: 1,
				duration: 200,
				useNativeDriver: true,
			}),
		]).start();
	}, [translateY, backdropOpacity]);

	const closeSheet = useCallback(() => {
		Animated.parallel([
			Animated.spring(translateY, {
				toValue: SHEET_HEIGHT,
				useNativeDriver: true,
				damping: 20,
				stiffness: 200,
			}),
			Animated.timing(backdropOpacity, {
				toValue: 0,
				duration: 150,
				useNativeDriver: true,
			}),
		]).start(() => {
			onClose();
		});
	}, [translateY, backdropOpacity, onClose]);

	const panResponder = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onMoveShouldSetPanResponder: (_, gestureState) => {
				return gestureState.dy > 5;
			},
			onPanResponderMove: (_, gestureState) => {
				if (gestureState.dy > 0) {
					translateY.setValue(gestureState.dy);
				}
			},
			onPanResponderRelease: (_, gestureState) => {
				if (gestureState.dy > DRAG_THRESHOLD || gestureState.vy > 0.5) {
					closeSheet();
				} else {
					Animated.spring(translateY, {
						toValue: 0,
						useNativeDriver: true,
						damping: 20,
						stiffness: 200,
					}).start();
				}
			},
		})
	).current;

	useEffect(() => {
		if (visible) {
			translateY.setValue(SHEET_HEIGHT);
			backdropOpacity.setValue(0);
			openSheet();
		}
	}, [visible, openSheet, translateY, backdropOpacity]);

	if (!visible) return null;

	return (
		<Modal
			visible={visible}
			transparent
			animationType="none"
			statusBarTranslucent
			onRequestClose={closeSheet}
		>
			<View style={styles.container}>
				<Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
					<TouchableOpacity
						style={StyleSheet.absoluteFill}
						activeOpacity={1}
						onPress={closeSheet}
					/>
				</Animated.View>

				<Animated.View
					style={[
						styles.sheet,
						{
							transform: [{ translateY }],
							paddingBottom: insets.bottom + space.lg,
						},
					]}
				>
					<View {...panResponder.panHandlers}>
						<View style={styles.handleContainer}>
							<View style={styles.handle} />
						</View>

						<View style={styles.header}>
							<View style={styles.headerText}>
								<Eyebrow>Guest list</Eyebrow>
								<Text style={styles.title}>
									{participants.length} {participants.length === 1 ? "guest" : "guests"}
								</Text>
							</View>
							<IconButton icon="x" accessibilityLabel="Close guest list" onPress={closeSheet} />
						</View>
					</View>

					<FlatList
						data={sortedParticipants}
						keyExtractor={(item) => item.userId}
						contentContainerStyle={styles.list}
						showsVerticalScrollIndicator={false}
						bounces={false}
						renderItem={({ item }) => {
							const isCurrentUser = item.userId === currentUserId;
							const canRemove = isHost && item.role !== "host" && !isCurrentUser;
							const statusLabel =
								item.photoCount > 0
									? `${item.photoCount} ${item.photoCount === 1 ? "item" : "items"}`
									: item.noPhotosToUpload
										? "Nothing to share"
										: "Waiting";

							return (
								<View style={styles.row}>
									<Avatar name={item.displayName} size={40} />
									<View style={styles.rowText}>
										<View style={styles.nameRow}>
											<Text style={styles.name} numberOfLines={1}>
												{item.displayName}
											</Text>
											{isCurrentUser ? <Text style={styles.you}>you</Text> : null}
										</View>
										<Text style={styles.status}>{statusLabel}</Text>
									</View>
									{item.role === "host" ? <Pill label="Host" tone="accent" /> : null}
									{item.photoCount > 0 ? (
										<Pill label={String(item.photoCount)} icon="image" />
									) : null}
									{canRemove ? (
										<IconButton
											icon="user-minus"
											tone="danger"
											size={34}
											accessibilityLabel={`Remove ${item.displayName}`}
											onPress={() => onRemoveParticipant(item.userId, item.displayName)}
										/>
									) : null}
								</View>
							);
						}}
						ListFooterComponent={
							<View style={styles.footer}>
								{isHost ? (
									<View style={styles.hostActions}>
										<Button
											label="Remind to upload"
											icon="upload-cloud"
											variant="secondary"
											size="md"
											loading={sendingType === "upload"}
											disabled={sendingType !== null}
											onPress={() => handleSendReminder("upload")}
											style={styles.hostAction}
										/>
										<Button
											label="Remind to snap"
											icon="camera"
											variant="secondary"
											size="md"
											loading={sendingType === "take_photos"}
											disabled={sendingType !== null}
											onPress={() => handleSendReminder("take_photos")}
											style={styles.hostAction}
										/>
									</View>
								) : null}
								<Button label="Leave this album" variant="ghost" size="md" onPress={onLeaveEvent} />
							</View>
						}
					/>
				</Animated.View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: "flex-end",
	},
	backdrop: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: theme.overlay,
	},
	sheet: {
		maxHeight: "82%",
		backgroundColor: theme.card,
		borderTopLeftRadius: radius.xxl,
		borderTopRightRadius: radius.xxl,
		borderTopWidth: 1,
		borderColor: theme.border,
	},
	handleContainer: {
		alignItems: "center",
		paddingTop: space.md,
		paddingBottom: space.sm,
	},
	handle: {
		width: 40,
		height: 4,
		borderRadius: 2,
		backgroundColor: theme.borderStrong,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: space.xl,
		paddingBottom: space.lg,
	},
	headerText: {
		gap: space.xs,
	},
	title: {
		...type.title,
		color: theme.textPrimary,
	},
	list: {
		paddingHorizontal: space.lg,
		paddingBottom: space.lg,
	},
	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.md,
		paddingVertical: space.md,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: theme.border,
	},
	rowText: {
		flex: 1,
		gap: 2,
		minWidth: 0,
	},
	nameRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},
	name: {
		...type.bodyStrong,
		color: theme.textPrimary,
		flexShrink: 1,
	},
	you: {
		...type.caption,
		color: theme.textFaint,
	},
	status: {
		...type.caption,
		fontWeight: "500",
		color: theme.textMuted,
	},
	footer: {
		gap: space.md,
		paddingTop: space.xl,
	},
	hostActions: {
		flexDirection: "row",
		gap: space.sm,
	},
	hostAction: {
		flex: 1,
	},
});
