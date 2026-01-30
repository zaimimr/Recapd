import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Camera } from "expo-camera";
import Constants from "expo-constants";
import * as MediaLibrary from "expo-media-library";
import * as Notifications from "expo-notifications";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
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
import { SUBSCRIPTIONS_ENABLED } from "@/lib/subscription";
import { useAuthStore } from "@/store/authStore";
import { useIsPro, useSubscriptionStore } from "@/store/subscriptionStore";

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
	const isPro = useIsPro();
	const {
		status,
		showPaywall,
		showCustomerCenter,
		isLoading: subscriptionLoading,
	} = useSubscriptionStore();

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

	return (
		<ScrollView
			style={[styles.container, isDark && styles.containerDark]}
			contentContainerStyle={styles.content}
		>
			{user && (
				<View style={[styles.section, isDark && styles.sectionDark]}>
					<Text style={[styles.sectionTitle, isDark && styles.textDark]}>Profile</Text>
					<View style={styles.profileRow}>
						<View style={[styles.avatar, isDark && styles.avatarDark]}>
							<Text style={[styles.avatarText, isDark && styles.textDark]}>
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
								Joined {new Date(user.created_at).toLocaleDateString()}
							</Text>
						</View>
						{isEditingName ? (
							<View style={styles.editActions}>
								<TouchableOpacity
									style={styles.cancelButton}
									onPress={handleCancelEdit}
									disabled={isSaving}
								>
									<FontAwesome name="times" size={18} color={isDark ? "#888" : "#666"} />
								</TouchableOpacity>
								<TouchableOpacity
									style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
									onPress={handleSaveName}
									disabled={isSaving}
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
							>
								<FontAwesome name="pencil" size={14} color={isDark ? "#fff" : "#000"} />
							</TouchableOpacity>
						)}
					</View>
				</View>
			)}

			{SUBSCRIPTIONS_ENABLED && (
				<View style={[styles.section, isDark && styles.sectionDark]}>
					<Text style={[styles.sectionTitle, isDark && styles.textDark]}>Subscription</Text>
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
								{isPro ? "Recapd Pro" : "Free Plan"}
							</Text>
							<Text style={[styles.subscriptionSubtext, isDark && styles.textMuted]}>
								{isPro
									? status.expiresAt
										? `Renews ${status.expiresAt.toLocaleDateString()}`
										: "Active subscription"
									: "Upgrade for unlimited features"}
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
							onPress={showCustomerCenter}
							disabled={subscriptionLoading}
						>
							<FontAwesome name="cog" size={16} color={isDark ? "#fff" : "#000"} />
							<Text style={[styles.manageButtonText, isDark && styles.textDark]}>
								Manage Subscription
							</Text>
						</TouchableOpacity>
					) : (
						<TouchableOpacity
							style={styles.upgradeButton}
							onPress={showPaywall}
							disabled={subscriptionLoading}
						>
							<FontAwesome name="star" size={16} color="#fff" />
							<Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
						</TouchableOpacity>
					)}

					{!isPro && (
						<View style={styles.featuresPreview}>
							<Text style={[styles.featuresTitle, isDark && styles.textMuted]}>
								Pro features include:
							</Text>
							<View style={styles.featureItem}>
								<FontAwesome name="check" size={12} color="#22c55e" />
								<Text style={[styles.featureText, isDark && styles.textMuted]}>
									Unlimited participants
								</Text>
							</View>
							<View style={styles.featureItem}>
								<FontAwesome name="check" size={12} color="#22c55e" />
								<Text style={[styles.featureText, isDark && styles.textMuted]}>Video uploads</Text>
							</View>
						</View>
					)}
				</View>
			)}

			<View style={[styles.section, isDark && styles.sectionDark]}>
				<Text style={[styles.sectionTitle, isDark && styles.textDark]}>Feedback</Text>
				<TouchableOpacity
					style={[styles.feedbackButton, isDark && styles.feedbackButtonDark]}
					onPress={() => Linking.openURL("https://forms.gle/Pt6DyHY4ZY6CZthm8")}
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
					<Text style={[styles.sectionTitle, isDark && styles.textDark]}>Permissions</Text>
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
				<Text style={[styles.sectionTitle, isDark && styles.textDark]}>About</Text>
				<View style={styles.aboutRow}>
					<Text style={[styles.aboutLabel, isDark && styles.textMuted]}>Version</Text>
					<Text style={[styles.aboutValue, isDark && styles.textDark]}>
						{Constants.expoConfig?.version ?? "1.0.0"}
					</Text>
				</View>
				<TouchableOpacity
					style={styles.aboutRow}
					onPress={() => Linking.openURL("https://recapd.app/privacy")}
				>
					<Text style={[styles.aboutLabel, isDark && styles.textMuted]}>Privacy Policy</Text>
					<FontAwesome name="chevron-right" size={14} color={isDark ? "#666" : "#999"} />
				</TouchableOpacity>
				<TouchableOpacity
					style={styles.aboutRow}
					onPress={() => Linking.openURL("https://recapd.app/terms")}
				>
					<Text style={[styles.aboutLabel, isDark && styles.textMuted]}>Terms of Service</Text>
					<FontAwesome name="chevron-right" size={14} color={isDark ? "#666" : "#999"} />
				</TouchableOpacity>
			</View>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#f5f5f5",
	},
	containerDark: {
		backgroundColor: "#000",
	},
	content: {
		padding: 16,
		gap: 16,
	},
	section: {
		backgroundColor: "#fff",
		borderRadius: 16,
		padding: 16,
	},
	sectionDark: {
		backgroundColor: "#1a1a1a",
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "600",
		color: "#000",
		marginBottom: 4,
	},
	sectionDescription: {
		fontSize: 14,
		color: "#666",
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
		backgroundColor: "#f0f0f0",
		justifyContent: "center",
		alignItems: "center",
	},
	avatarDark: {
		backgroundColor: "#333",
	},
	avatarText: {
		fontSize: 24,
		fontWeight: "600",
		color: "#000",
	},
	profileInfo: {
		flex: 1,
	},
	profileName: {
		fontSize: 18,
		fontWeight: "600",
		color: "#000",
	},
	profileSubtext: {
		fontSize: 14,
		color: "#666",
		marginTop: 2,
	},
	nameInput: {
		fontSize: 18,
		fontWeight: "600",
		color: "#000",
		paddingVertical: 4,
		paddingHorizontal: 8,
		borderWidth: 1,
		borderColor: "#3b82f6",
		borderRadius: 8,
		backgroundColor: "#fff",
	},
	nameInputDark: {
		color: "#fff",
		backgroundColor: "#333",
		borderColor: "#3b82f6",
	},
	editActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	editButton: {
		padding: 10,
		backgroundColor: "#f0f0f0",
		borderRadius: 20,
	},
	editButtonDark: {
		backgroundColor: "#333",
	},
	cancelButton: {
		padding: 10,
	},
	saveButton: {
		padding: 10,
		backgroundColor: "#22c55e",
		borderRadius: 20,
	},
	saveButtonDisabled: {
		opacity: 0.5,
	},
	permissionRow: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 14,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: "rgba(0, 0, 0, 0.1)",
	},
	permissionRowDark: {
		borderTopColor: "rgba(255, 255, 255, 0.1)",
	},
	permissionRowFirst: {
		borderTopWidth: 0,
	},
	permissionRowLast: {},
	permissionIcon: {
		width: 40,
		height: 40,
		borderRadius: 10,
		backgroundColor: "#f5f5f5",
		justifyContent: "center",
		alignItems: "center",
		marginRight: 12,
	},
	permissionIconDark: {
		backgroundColor: "#333",
	},
	permissionContent: {
		flex: 1,
	},
	permissionName: {
		fontSize: 16,
		fontWeight: "500",
		color: "#000",
	},
	permissionDescription: {
		fontSize: 13,
		color: "#666",
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
		backgroundColor: "#fef3c7",
		borderRadius: 10,
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
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: "rgba(0, 0, 0, 0.1)",
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
		backgroundColor: "#f5f5f5",
		paddingVertical: 14,
		borderRadius: 12,
		marginTop: 8,
	},
	feedbackButtonDark: {
		backgroundColor: "#333",
	},
	feedbackButtonText: {
		fontSize: 16,
		fontWeight: "600",
		color: "#000",
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
		borderRadius: 12,
		backgroundColor: "#f5f5f5",
		justifyContent: "center",
		alignItems: "center",
	},
	subscriptionIconPro: {
		backgroundColor: "#fef3c7",
	},
	subscriptionInfo: {
		flex: 1,
	},
	subscriptionTitle: {
		fontSize: 17,
		fontWeight: "600",
		color: "#000",
	},
	subscriptionSubtext: {
		fontSize: 14,
		color: "#666",
		marginTop: 2,
	},
	proBadge: {
		backgroundColor: "#f59e0b",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 6,
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
		backgroundColor: "#3b82f6",
		paddingVertical: 14,
		borderRadius: 12,
	},
	upgradeButtonText: {
		fontSize: 16,
		fontWeight: "600",
		color: "#fff",
	},
	manageButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		backgroundColor: "#f5f5f5",
		paddingVertical: 14,
		borderRadius: 12,
	},
	manageButtonDark: {
		backgroundColor: "#333",
	},
	manageButtonText: {
		fontSize: 16,
		fontWeight: "600",
		color: "#000",
	},
	featuresPreview: {
		marginTop: 16,
		gap: 8,
	},
	featuresTitle: {
		fontSize: 13,
		fontWeight: "500",
		color: "#666",
		marginBottom: 4,
	},
	featureItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	featureText: {
		fontSize: 14,
		color: "#666",
	},
});
