import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Camera } from "expo-camera";
import Constants from "expo-constants";
import * as MediaLibrary from "expo-media-library";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Keyboard,
	Linking,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from "react-native";
import { useColorScheme } from "@/components/useColorScheme";
import { getAvatarColor } from "@/lib/colors";
import { SUBSCRIPTIONS_ENABLED } from "@/lib/subscription";
import { formatLocalizedDate } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import {
	useIsPro,
	useSubscriptionPlanId,
	useSubscriptionPlans,
	useSubscriptionStore,
} from "@/store/subscriptionStore";
import { getPlanMarketingHighlights } from "@/types/subscription";

type PermissionStatus = "granted" | "denied" | "undetermined" | "limited";

interface PermissionInfo {
	name: string;
	description: string;
	status: PermissionStatus;
	icon: "image" | "bell" | "camera";
	required: boolean;
}

export default function SettingsScreen() {
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";
	const user = useAuthStore((state) => state.user);
	const updateDisplayName = useAuthStore((state) => state.updateDisplayName);
	const logout = useAuthStore((state) => state.logout);

	function handleResetProfile() {
		Alert.alert(
			"Reset profile?",
			"This signs you out on this device and clears your local data. Events you created stay live for guests.",
			[
				{ text: "Cancel", style: "cancel" },
				{ text: "Reset", style: "destructive", onPress: () => logout() },
			]
		);
	}
	const isPro = useIsPro();
	const planId = useSubscriptionPlanId();
	const plans = useSubscriptionPlans();
	const {
		status,
		showPaywall,
		showCustomerCenter,
		restore,
		isLoading: subscriptionLoading,
	} = useSubscriptionStore();
	const [isRestoring, setIsRestoring] = useState(false);

	const [isEditingName, setIsEditingName] = useState(false);
	const [editedName, setEditedName] = useState(user?.display_name || "");
	const [isSaving, setIsSaving] = useState(false);

	const [permissions, setPermissions] = useState<PermissionInfo[]>([
		{
			name: "Photo Library",
			description: "Access all photos to find and share event memories",
			status: "undetermined",
			icon: "image",
			required: true,
		},
		{
			name: "Camera",
			description: "Take photos directly within the app",
			status: "undetermined",
			icon: "camera",
			required: false,
		},
		{
			name: "Notifications",
			description: "Get reminded to upload photos after events end",
			status: "undetermined",
			icon: "bell",
			required: true,
		},
	]);

	const checkPermissions = useCallback(async () => {
		const [mediaStatus, cameraStatus, notificationStatus] = await Promise.all([
			MediaLibrary.getPermissionsAsync(),
			Camera.getCameraPermissionsAsync(),
			Notifications.getPermissionsAsync(),
		]);

		const mediaPermission =
			mediaStatus.accessPrivileges === "all"
				? "granted"
				: mediaStatus.accessPrivileges === "limited"
					? "limited"
					: mediaStatus.granted
						? "granted"
						: mediaStatus.canAskAgain
							? "undetermined"
							: "denied";

		const cameraPermission = cameraStatus.granted
			? "granted"
			: cameraStatus.canAskAgain
				? "undetermined"
				: "denied";

		const notificationPermission = notificationStatus.granted
			? "granted"
			: notificationStatus.canAskAgain
				? "undetermined"
				: "denied";

		setPermissions([
			{
				name: "Photo Library",
				description: "Access all photos to find and share event memories",
				status: mediaPermission,
				icon: "image",
				required: true,
			},
			{
				name: "Camera",
				description: "Take photos directly within the app",
				status: cameraPermission,
				icon: "camera",
				required: false,
			},
			{
				name: "Notifications",
				description: "Get reminded to upload photos after events end",
				status: notificationPermission,
				icon: "bell",
				required: true,
			},
		]);
	}, []);

	useFocusEffect(
		useCallback(() => {
			checkPermissions();
		}, [checkPermissions])
	);

	async function requestPhotoPermission() {
		const { status, accessPrivileges, canAskAgain } = await MediaLibrary.getPermissionsAsync();

		if (accessPrivileges === "all" || status === "granted") {
			return;
		}

		if (canAskAgain) {
			const result = await MediaLibrary.requestPermissionsAsync();
			if (result.accessPrivileges === "limited") {
				Alert.alert(
					"Limited Access",
					"For the best experience, please allow access to all photos. Go to Settings > Recapd > Photos and select 'All Photos'.",
					[
						{ text: "Maybe Later", style: "cancel" },
						{ text: "Open Settings", onPress: openSettings },
					]
				);
			}
			checkPermissions();
		} else {
			openSettings();
		}
	}

	async function requestNotificationPermission() {
		const { granted, canAskAgain } = await Notifications.getPermissionsAsync();

		if (granted) {
			return;
		}

		if (canAskAgain) {
			await Notifications.requestPermissionsAsync();
			checkPermissions();
		} else {
			openSettings();
		}
	}

	async function requestCameraPermission() {
		const { granted, canAskAgain } = await Camera.getCameraPermissionsAsync();

		if (granted) {
			return;
		}

		if (canAskAgain) {
			await Camera.requestCameraPermissionsAsync();
			checkPermissions();
		} else {
			openSettings();
		}
	}

	function openSettings() {
		if (Platform.OS === "ios") {
			Linking.openURL("app-settings:");
		} else {
			Linking.openSettings();
		}
	}

	async function handleSaveName() {
		const trimmedName = editedName.trim();
		if (!trimmedName) {
			Alert.alert("Error", "Name cannot be empty");
			return;
		}

		setIsSaving(true);
		await updateDisplayName(trimmedName);
		setIsSaving(false);
		setIsEditingName(false);
		Keyboard.dismiss();
	}

	function handleCancelEdit() {
		setEditedName(user?.display_name || "");
		setIsEditingName(false);
		Keyboard.dismiss();
	}

	function handlePermissionPress(permission: PermissionInfo) {
		if (permission.status === "granted") {
			return;
		}

		if (permission.name === "Photo Library") {
			requestPhotoPermission();
		} else if (permission.name === "Camera") {
			requestCameraPermission();
		} else if (permission.name === "Notifications") {
			requestNotificationPermission();
		}
	}

	function getStatusColor(status: PermissionStatus): string {
		switch (status) {
			case "granted":
				return "#22c55e";
			case "limited":
				return "#f59e0b";
			case "denied":
				return "#ef4444";
			default:
				return "#6b7280";
		}
	}

	function getStatusText(status: PermissionStatus): string {
		switch (status) {
			case "granted":
				return "Enabled";
			case "limited":
				return "Limited";
			case "denied":
				return "Denied";
			default:
				return "Not Set";
		}
	}

	function getStatusIcon(
		status: PermissionStatus
	): "check-circle" | "exclamation-circle" | "times-circle" {
		switch (status) {
			case "granted":
				return "check-circle";
			case "limited":
				return "exclamation-circle";
			case "denied":
				return "times-circle";
			default:
				return "exclamation-circle";
		}
	}

	const allPermissionsGranted = permissions.every((p) => p.status === "granted");
	const currentPlan = plans[planId];
	const currentPlanHighlights = getPlanMarketingHighlights(planId, plans);

	return (
		<ScrollView
			style={[styles.container, isDark && styles.containerDark]}
			contentContainerStyle={styles.content}
		>
			<View style={[styles.hero, isDark && styles.sectionDark]}>
				<Text style={[styles.kicker, isDark && styles.textMuted]}>Settings</Text>
				<Text style={[styles.heroTitle, isDark && styles.textDark]}>
					Control your profile, access, and plan
				</Text>
			</View>

			{user && (
				<View style={[styles.section, isDark && styles.sectionDark]}>
					<Text style={[styles.kicker, isDark && styles.textMuted]}>Profile</Text>
					<Text style={[styles.sectionTitle, isDark && styles.textDark]}>Your identity</Text>
					<View style={styles.profileRow}>
						<View
							style={[styles.avatar, { backgroundColor: getAvatarColor(user.display_name || "?") }]}
						>
							<Text style={styles.avatarText}>
								{(isEditingName ? editedName : user.display_name)?.charAt(0).toUpperCase() || "?"}
							</Text>
						</View>
						<View style={styles.profileInfo}>
							{isEditingName ? (
								<TextInput
									style={[styles.nameInput, isDark && styles.nameInputDark]}
									value={editedName}
									onChangeText={setEditedName}
									placeholder="Enter your name"
									placeholderTextColor={isDark ? "#666" : "#999"}
									autoFocus
									maxLength={50}
									returnKeyType="done"
									onSubmitEditing={handleSaveName}
								/>
							) : (
								<Text style={[styles.profileName, isDark && styles.textDark]}>
									{user.display_name}
								</Text>
							)}
							<Text style={[styles.profileSubtext, isDark && styles.textMuted]}>
								Joined{" "}
								{formatLocalizedDate(user.created_at, {
									month: "short",
									day: "numeric",
									year: "numeric",
								})}
							</Text>
						</View>
						{isEditingName ? (
							<View style={styles.editActions}>
								<TouchableOpacity
									style={styles.cancelButton}
									onPress={handleCancelEdit}
									disabled={isSaving}
									accessibilityRole="button"
									accessibilityLabel="Cancel editing name"
								>
									<FontAwesome name="times" size={18} color={isDark ? "#888" : "#666"} />
								</TouchableOpacity>
								<TouchableOpacity
									style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
									onPress={handleSaveName}
									disabled={isSaving}
									accessibilityRole="button"
									accessibilityLabel="Save name"
									accessibilityState={{ disabled: isSaving }}
								>
									<FontAwesome name="check" size={18} color="#fff" />
								</TouchableOpacity>
							</View>
						) : (
							<TouchableOpacity
								style={[styles.editButton, isDark && styles.editButtonDark]}
								onPress={() => {
									setEditedName(user.display_name);
									setIsEditingName(true);
								}}
								accessibilityRole="button"
								accessibilityLabel="Edit display name"
								hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
							>
								<FontAwesome name="pencil" size={14} color={isDark ? "#fff" : "#000"} />
							</TouchableOpacity>
						)}
					</View>
				</View>
			)}

			<View style={[styles.section, isDark && styles.sectionDark]}>
				<Text style={[styles.kicker, isDark && styles.textMuted]}>Subscription</Text>
				<Text style={[styles.sectionTitle, isDark && styles.textDark]}>Plan</Text>
				<View style={styles.subscriptionRow}>
					<View style={[styles.subscriptionIcon, isPro && styles.subscriptionIconPro]}>
						<FontAwesome
							name={isPro ? "star" : "star-o"}
							size={20}
							color={isPro ? "#f59e0b" : isDark ? "#666" : "#999"}
						/>
					</View>
					<View style={styles.subscriptionInfo}>
						<Text style={[styles.subscriptionTitle, isDark && styles.textDark]}>
							{currentPlan.displayName}
						</Text>
						<Text style={[styles.subscriptionSubtext, isDark && styles.textMuted]}>
							{isPro
								? status.expiresAt
									? `${status.willRenew ? "Renews" : "Expires"} ${status.expiresAt.toLocaleDateString()}`
									: "Active subscription"
								: SUBSCRIPTIONS_ENABLED
									? currentPlanHighlights
									: "Subscription controls are unavailable in this build"}
						</Text>
					</View>
					{isPro && (
						<View style={styles.proBadge}>
							<Text style={styles.proBadgeText}>PRO</Text>
						</View>
					)}
				</View>

				{isPro ? (
					<TouchableOpacity
						style={[styles.manageButton, isDark && styles.manageButtonDark]}
						onPress={async () => {
							const opened = await showCustomerCenter();
							if (!opened) {
								Alert.alert(
									"Subscription Unavailable",
									"Could not open subscription management right now."
								);
							}
						}}
						disabled={subscriptionLoading || !SUBSCRIPTIONS_ENABLED}
					>
						<FontAwesome name="cog" size={16} color={isDark ? "#fff" : "#000"} />
						<Text style={[styles.manageButtonText, isDark && styles.textDark]}>
							Manage Subscription
						</Text>
					</TouchableOpacity>
				) : (
					<>
						<TouchableOpacity
							style={[
								styles.upgradeButton,
								isDark && styles.upgradeButtonDark,
								!SUBSCRIPTIONS_ENABLED && styles.buttonDisabled,
							]}
							onPress={showPaywall}
							disabled={subscriptionLoading || !SUBSCRIPTIONS_ENABLED}
							accessibilityRole="button"
							accessibilityLabel="Upgrade to Pro"
						>
							<FontAwesome name="star" size={16} color={isDark ? "#0a0d12" : "#fff"} />
							<Text style={[styles.upgradeButtonText, isDark && styles.upgradeButtonTextDark]}>
								Upgrade to Pro
							</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={styles.restoreButton}
							onPress={async () => {
								setIsRestoring(true);
								const result = await restore();
								setIsRestoring(false);
								if (result.success) {
									Alert.alert("Restored", "Your purchases have been restored.");
								} else if (!result.userCancelled && result.error) {
									Alert.alert("Restore Failed", result.error);
								}
							}}
							disabled={isRestoring || subscriptionLoading || !SUBSCRIPTIONS_ENABLED}
							accessibilityRole="button"
							accessibilityLabel="Restore Purchases"
						>
							{isRestoring ? (
								<ActivityIndicator size="small" color={isDark ? "#888" : "#666"} />
							) : (
								<Text style={[styles.restoreButtonText, isDark && styles.textMuted]}>
									Restore Purchases
								</Text>
							)}
						</TouchableOpacity>
					</>
				)}
			</View>

			<View style={[styles.section, isDark && styles.sectionDark]}>
				<Text style={[styles.kicker, isDark && styles.textMuted]}>Feedback</Text>
				<Text style={[styles.sectionTitle, isDark && styles.textDark]}>Tell us what to fix</Text>
				<TouchableOpacity
					style={[styles.feedbackButton, isDark && styles.feedbackButtonDark]}
					onPress={() => Linking.openURL("https://forms.gle/Pt6DyHY4ZY6CZthm8")}
					accessibilityRole="button"
					accessibilityLabel="Send Feedback"
					accessibilityHint="Opens feedback form"
				>
					<FontAwesome name="comment" size={18} color={isDark ? "#fff" : "#000"} />
					<Text style={[styles.feedbackButtonText, isDark && styles.textDark]}>Send Feedback</Text>
				</TouchableOpacity>
				<Text style={[styles.feedbackHint, isDark && styles.textMuted]}>
					We'd love to hear your thoughts and suggestions
				</Text>
			</View>

			<View style={[styles.section, isDark && styles.sectionDark]}>
				<View style={styles.sectionHeader}>
					<View style={styles.sectionHeadingBlock}>
						<Text style={[styles.kicker, isDark && styles.textMuted]}>Permissions</Text>
						<Text style={[styles.sectionTitle, isDark && styles.textDark]}>Access</Text>
					</View>
					{!allPermissionsGranted && (
						<View style={styles.warningBadge}>
							<FontAwesome name="exclamation" size={10} color="#fff" />
						</View>
					)}
				</View>
				<Text style={[styles.sectionDescription, isDark && styles.textMuted]}>
					Recapd needs these permissions to work properly
				</Text>

				{permissions.map((permission, index) => (
					<TouchableOpacity
						key={permission.name}
						style={[
							styles.permissionRow,
							isDark && styles.permissionRowDark,
							index === 0 && styles.permissionRowFirst,
							index === permissions.length - 1 && styles.permissionRowLast,
						]}
						onPress={() => handlePermissionPress(permission)}
						activeOpacity={permission.status === "granted" ? 1 : 0.7}
						accessibilityRole="button"
						accessibilityLabel={`${permission.name}, ${getStatusText(permission.status)}`}
						accessibilityHint={
							permission.status === "granted" ? undefined : "Tap to grant permission"
						}
					>
						<View style={[styles.permissionIcon, isDark && styles.permissionIconDark]}>
							<FontAwesome name={permission.icon} size={20} color={isDark ? "#fff" : "#000"} />
						</View>
						<View style={styles.permissionContent}>
							<Text style={[styles.permissionName, isDark && styles.textDark]}>
								{permission.name}
							</Text>
							<Text style={[styles.permissionDescription, isDark && styles.textMuted]}>
								{permission.description}
							</Text>
						</View>
						<View style={styles.permissionStatus}>
							<FontAwesome
								name={getStatusIcon(permission.status)}
								size={20}
								color={getStatusColor(permission.status)}
							/>
							<Text
								style={[styles.permissionStatusText, { color: getStatusColor(permission.status) }]}
							>
								{getStatusText(permission.status)}
							</Text>
						</View>
					</TouchableOpacity>
				))}

				{!allPermissionsGranted && (
					<View style={[styles.warningBox, isDark && styles.warningBoxDark]}>
						<FontAwesome name="info-circle" size={16} color="#f59e0b" />
						<Text style={[styles.warningText, isDark && styles.textMuted]}>
							Some features may not work without all permissions enabled
						</Text>
					</View>
				)}
			</View>

			<View style={[styles.section, isDark && styles.sectionDark]}>
				<Text style={[styles.kicker, isDark && styles.textMuted]}>About</Text>
				<Text style={[styles.sectionTitle, isDark && styles.textDark]}>App info</Text>
				<View style={styles.aboutRow}>
					<Text style={[styles.aboutLabel, isDark && styles.textMuted]}>Version</Text>
					<Text style={[styles.aboutValue, isDark && styles.textDark]}>
						{Constants.expoConfig?.version ?? "1.0.0"}
					</Text>
				</View>
				<TouchableOpacity
					style={styles.aboutRow}
					onPress={() => Linking.openURL("https://recapd.app/privacy")}
					accessibilityRole="link"
					accessibilityLabel="Privacy Policy"
					accessibilityHint="Opens in browser"
				>
					<Text style={[styles.aboutLabel, isDark && styles.textMuted]}>Privacy Policy</Text>
					<FontAwesome name="chevron-right" size={14} color={isDark ? "#666" : "#999"} />
				</TouchableOpacity>
				<TouchableOpacity
					style={styles.aboutRow}
					onPress={() => Linking.openURL("https://recapd.app/terms")}
					accessibilityRole="link"
					accessibilityLabel="Terms of Service"
					accessibilityHint="Opens in browser"
				>
					<Text style={[styles.aboutLabel, isDark && styles.textMuted]}>Terms of Service</Text>
					<FontAwesome name="chevron-right" size={14} color={isDark ? "#666" : "#999"} />
				</TouchableOpacity>
			</View>

			<TouchableOpacity
				style={styles.resetButton}
				onPress={handleResetProfile}
				accessibilityRole="button"
				accessibilityLabel="Reset profile"
			>
				<Text style={styles.resetButtonText}>Reset profile</Text>
			</TouchableOpacity>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#f3f4f6",
	},
	containerDark: {
		backgroundColor: "#05070b",
	},
	resetButton: {
		alignItems: "center",
		marginTop: 8,
		marginHorizontal: 16,
		paddingVertical: 14,
	},
	resetButtonText: {
		color: "#ef4444",
		fontSize: 14,
		fontWeight: "500",
	},
	content: {
		padding: 16,
		gap: 16,
	},
	hero: {
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		paddingHorizontal: 16,
		paddingVertical: 16,
		gap: 6,
	},
	kicker: {
		fontSize: 11,
		fontWeight: "700",
		letterSpacing: 1.2,
		textTransform: "uppercase",
		color: "#6b7280",
	},
	heroTitle: {
		fontSize: 26,
		fontWeight: "700",
		color: "#111827",
		letterSpacing: -0.8,
	},
	heroText: {
		fontSize: 14,
		lineHeight: 21,
		color: "#6b7280",
	},
	section: {
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#e5e7eb",
		padding: 16,
	},
	sectionDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 8,
	},
	sectionHeadingBlock: {
		gap: 4,
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: "700",
		color: "#111827",
		letterSpacing: -0.5,
	},
	sectionDescription: {
		fontSize: 14,
		color: "#6b7280",
		marginBottom: 16,
	},
	warningBadge: {
		backgroundColor: "#f59e0b",
		width: 18,
		height: 18,
		borderRadius: 9,
		justifyContent: "center",
		alignItems: "center",
		marginBottom: 4,
	},
	profileRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		marginTop: 8,
	},
	avatar: {
		width: 56,
		height: 56,
		borderRadius: 28,
		justifyContent: "center",
		alignItems: "center",
	},
	avatarText: {
		fontSize: 24,
		fontWeight: "600",
		color: "#fff",
	},
	profileInfo: {
		flex: 1,
	},
	profileName: {
		fontSize: 18,
		fontWeight: "700",
		color: "#111827",
	},
	profileSubtext: {
		fontSize: 14,
		color: "#6b7280",
		marginTop: 2,
	},
	nameInput: {
		fontSize: 18,
		fontWeight: "700",
		color: "#111827",
		paddingVertical: 10,
		paddingHorizontal: 12,
		borderWidth: 1,
		borderColor: "#d1d5db",
		borderRadius: 12,
		backgroundColor: "#f9fafb",
	},
	nameInputDark: {
		color: "#fff",
		backgroundColor: "#151821",
		borderColor: "#242833",
	},
	editActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	editButton: {
		width: 36,
		height: 36,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#fff",
		borderRadius: 18,
		borderWidth: 1,
		borderColor: "#d1d5db",
	},
	editButtonDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	cancelButton: {
		padding: 10,
	},
	saveButton: {
		width: 36,
		height: 36,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#111827",
		borderRadius: 18,
	},
	saveButtonDisabled: {
		opacity: 0.5,
	},
	permissionRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 14,
		borderTopWidth: 1,
		borderTopColor: "#e5e7eb",
	},
	permissionRowDark: {
		borderTopColor: "#242833",
	},
	permissionRowFirst: {
		borderTopWidth: 0,
	},
	permissionRowLast: {},
	permissionIcon: {
		width: 40,
		height: 40,
		borderRadius: 999,
		backgroundColor: "#f9fafb",
		justifyContent: "center",
		alignItems: "center",
		marginRight: 12,
		borderWidth: 1,
		borderColor: "#e5e7eb",
	},
	permissionIconDark: {
		backgroundColor: "#151821",
		borderColor: "#242833",
	},
	permissionContent: {
		flex: 1,
	},
	permissionName: {
		fontSize: 16,
		fontWeight: "600",
		color: "#111827",
	},
	permissionDescription: {
		fontSize: 13,
		color: "#6b7280",
		marginTop: 2,
	},
	permissionStatus: {
		alignItems: "flex-end",
		marginLeft: 8,
	},
	permissionStatusText: {
		fontSize: 12,
		fontWeight: "500",
		marginTop: 2,
	},
	warningBox: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#f59e0b",
		padding: 12,
		marginTop: 12,
	},
	warningBoxDark: {
		backgroundColor: "rgba(245, 158, 11, 0.15)",
	},
	warningText: {
		flex: 1,
		fontSize: 13,
		color: "#92400e",
	},
	aboutRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingVertical: 12,
		borderTopWidth: 1,
		borderTopColor: "#e5e7eb",
	},
	aboutLabel: {
		fontSize: 16,
		color: "#666",
	},
	aboutValue: {
		fontSize: 16,
		color: "#000",
	},
	textDark: {
		color: "#fff",
	},
	textMuted: {
		color: "#888",
	},
	feedbackButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 10,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#d1d5db",
		paddingVertical: 14,
		borderRadius: 999,
		marginTop: 8,
	},
	feedbackButtonDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	feedbackButtonText: {
		fontSize: 16,
		fontWeight: "600",
		color: "#111827",
	},
	feedbackHint: {
		fontSize: 13,
		color: "#666",
		textAlign: "center",
		marginTop: 12,
	},
	subscriptionRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
		marginTop: 8,
		marginBottom: 16,
	},
	subscriptionIcon: {
		width: 48,
		height: 48,
		borderRadius: 999,
		backgroundColor: "#f9fafb",
		justifyContent: "center",
		alignItems: "center",
		borderWidth: 1,
		borderColor: "#e5e7eb",
	},
	subscriptionIconPro: {
		backgroundColor: "#fef3c7",
	},
	subscriptionInfo: {
		flex: 1,
	},
	subscriptionTitle: {
		fontSize: 17,
		fontWeight: "700",
		color: "#111827",
	},
	subscriptionSubtext: {
		fontSize: 14,
		color: "#6b7280",
		marginTop: 2,
	},
	proBadge: {
		backgroundColor: "#111827",
		paddingHorizontal: 10,
		paddingVertical: 5,
		borderRadius: 999,
	},
	proBadgeText: {
		fontSize: 12,
		fontWeight: "700",
		color: "#fff",
	},
	upgradeButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		backgroundColor: "#111827",
		paddingVertical: 14,
		borderRadius: 999,
	},
	upgradeButtonDark: {
		backgroundColor: "#ffffff",
	},
	upgradeButtonText: {
		fontSize: 16,
		fontWeight: "600",
		color: "#fff",
	},
	upgradeButtonTextDark: {
		color: "#0a0d12",
	},
	buttonDisabled: {
		opacity: 0.45,
	},
	manageButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#d1d5db",
		paddingVertical: 14,
		borderRadius: 999,
	},
	manageButtonDark: {
		backgroundColor: "#0f1115",
		borderColor: "#242833",
	},
	manageButtonText: {
		fontSize: 16,
		fontWeight: "600",
		color: "#111827",
	},
	restoreButton: {
		paddingVertical: 12,
		alignItems: "center",
	},
	restoreButtonText: {
		fontSize: 14,
		color: "#666",
	},
});
