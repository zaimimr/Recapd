import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useCallback, useEffect, useRef } from "react";
import {
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
import { getAvatarColor } from "@/lib/colors";
import type { ParticipantWithStats } from "@/store/eventStore";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.55;
const DRAG_THRESHOLD = 50;

interface GuestSheetProps {
	visible: boolean;
	onClose: () => void;
	participants: ParticipantWithStats[];
	isDark: boolean;
	isHost: boolean;
	currentUserId: string;
	onRemoveParticipant: (userId: string, displayName: string) => void;
	onLeaveEvent: () => void;
}

export default function GuestSheet({
	visible,
	onClose,
	participants,
	isDark,
	isHost,
	currentUserId,
	onRemoveParticipant,
	onLeaveEvent,
}: GuestSheetProps) {
	const insets = useSafeAreaInsets();
	const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
	const backdropOpacity = useRef(new Animated.Value(0)).current;

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
						isDark && styles.sheetDark,
						{
							transform: [{ translateY }],
							paddingBottom: insets.bottom + 16,
						},
					]}
				>
					<View {...panResponder.panHandlers}>
						<View style={styles.handleContainer}>
							<View style={[styles.handle, isDark && styles.handleDark]} />
						</View>

						<View style={[styles.header, isDark && styles.headerDark]}>
							<Text style={[styles.title, isDark && styles.textDark]}>
								{participants.length} Guest{participants.length !== 1 ? "s" : ""}
							</Text>
							<TouchableOpacity onPress={closeSheet} style={styles.closeButton}>
								<FontAwesome name="times" size={20} color={isDark ? "#8e8e93" : "#666"} />
							</TouchableOpacity>
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

							return (
								<View style={[styles.participantRow, isDark && styles.participantRowDark]}>
									<View
										style={[styles.avatar, { backgroundColor: getAvatarColor(item.displayName) }]}
									>
										<Text style={styles.avatarText}>
											{item.displayName.charAt(0).toUpperCase()}
										</Text>
									</View>
									<View style={styles.participantInfo}>
										<View style={styles.nameRow}>
											<Text style={[styles.participantName, isDark && styles.textDark]}>
												{item.displayName}
											</Text>
											{isCurrentUser && <Text style={styles.youLabel}>(You)</Text>}
											{item.role === "host" && (
												<View style={styles.hostBadge}>
													<Text style={styles.hostBadgeText}>Host</Text>
												</View>
											)}
										</View>
										<Text style={styles.status}>
											{item.photoCount > 0
												? "shared"
												: item.noPhotosToUpload
													? "nothing to share"
													: "waiting"}
										</Text>
									</View>
									{canRemove && (
										<TouchableOpacity
											onPress={() => onRemoveParticipant(item.userId, item.displayName)}
											style={styles.removeButton}
											hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
										>
											<FontAwesome name="minus-circle" size={20} color="#ef4444" />
										</TouchableOpacity>
									)}
									<View style={styles.photoCount}>
										<Text style={[styles.photoCountValue, isDark && styles.photoCountValueDark]}>
											{item.photoCount}
										</Text>
										<FontAwesome name="camera" size={12} color="#8e8e93" />
									</View>
								</View>
							);
						}}
						ListFooterComponent={
							<TouchableOpacity style={styles.leaveButton} onPress={onLeaveEvent}>
								<Text style={styles.leaveButtonText}>Leave Event</Text>
							</TouchableOpacity>
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
		backgroundColor: "rgba(0, 0, 0, 0.4)",
	},
	sheet: {
		backgroundColor: "#fff",
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		maxHeight: SHEET_HEIGHT,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -3 },
		shadowOpacity: 0.1,
		shadowRadius: 10,
		elevation: 20,
	},
	sheetDark: {
		backgroundColor: "#0f1115",
	},
	handleContainer: {
		alignItems: "center",
		paddingTop: 10,
		paddingBottom: 6,
	},
	handle: {
		width: 36,
		height: 5,
		backgroundColor: "#d1d1d6",
		borderRadius: 2.5,
	},
	handleDark: {
		backgroundColor: "#48484a",
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 20,
		paddingTop: 4,
		paddingBottom: 14,
		borderBottomWidth: 1,
		borderBottomColor: "#e5e7eb",
	},
	headerDark: {
		borderBottomColor: "#242833",
	},
	title: {
		fontSize: 19,
		fontWeight: "700",
		color: "#111827",
		letterSpacing: -0.5,
	},
	closeButton: {
		padding: 6,
		marginRight: -6,
	},
	list: {
		paddingHorizontal: 20,
		paddingTop: 6,
	},
	participantRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: "#e5e7eb",
	},
	participantRowDark: {
		borderBottomColor: "#242833",
	},
	avatar: {
		width: 40,
		height: 40,
		borderRadius: 20,
		justifyContent: "center",
		alignItems: "center",
	},
	avatarText: {
		color: "#fff",
		fontSize: 17,
		fontWeight: "600",
	},
	participantInfo: {
		flex: 1,
		marginLeft: 12,
	},
	nameRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	participantName: {
		fontSize: 16,
		fontWeight: "600",
		color: "#111827",
		letterSpacing: -0.4,
	},
	hostBadge: {
		backgroundColor: "#111827",
		paddingHorizontal: 9,
		paddingVertical: 4,
		borderRadius: 999,
	},
	hostBadgeText: {
		color: "#fff",
		fontSize: 11,
		fontWeight: "600",
	},
	status: {
		fontSize: 13,
		color: "#6b7280",
		marginTop: 2,
		textTransform: "uppercase",
		letterSpacing: 0.8,
	},
	photoCount: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
	},
	photoCountValue: {
		fontSize: 17,
		fontWeight: "400",
		color: "#8e8e93",
	},
	photoCountValueDark: {
		color: "#8e8e93",
	},
	textDark: {
		color: "#fff",
	},
	youLabel: {
		fontSize: 14,
		color: "#6b7280",
	},
	removeButton: {
		paddingHorizontal: 8,
	},
	leaveButton: {
		alignItems: "center",
		paddingVertical: 14,
		marginTop: 8,
		marginBottom: 8,
		borderWidth: 1,
		borderColor: "#ef4444",
		borderRadius: 999,
	},
	leaveButtonText: {
		color: "#ef4444",
		fontSize: 16,
		fontWeight: "500",
	},
});
