import Feather from "@expo/vector-icons/Feather";
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
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";
import {
	Avatar,
	Button,
	Card,
	Eyebrow,
	IconButton,
	ListRow,
	Pill,
	type PillTone,
	Screen,
	ScreenScroll,
	SectionHeader,
} from "@/components/ui";
import { radius, space, theme, type } from "@/constants/theme";
import { SUBSCRIPTIONS_ENABLED } from "@/lib/billing/config";
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
	icon: React.ComponentProps<typeof Feather>["name"];
	required: boolean;
}

function permissionTone(status: PermissionStatus): PillTone {
	if (status === "granted") return "success";
	if (status === "limited") return "warning";
	return "danger";
}

export default function SettingsScreen() {
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

	const allPermissionsGranted = permissions.every((p) => p.status === "granted");
	const currentPlan = plans[planId];
	const currentPlanHighlights = getPlanMarketingHighlights(planId, plans);

	return (
		<Screen>
			<ScreenScroll contentContainerStyle={styles.content}>
				<SectionHeader title="You and your access" style={styles.pageHeader} />

				{user ? (
					<View style={styles.group}>
						<Card padded={false}>
							<View style={styles.profileRow}>
								<Avatar name={user.display_name || "?"} size={52} />
								<View style={styles.profileInfo}>
									{isEditingName ? (
										<TextInput
											style={styles.nameInput}
											value={editedName}
											onChangeText={setEditedName}
											placeholder="Your name"
											placeholderTextColor={theme.textMuted}
											selectionColor={theme.accent}
											autoFocus
											maxLength={50}
											returnKeyType="done"
											onSubmitEditing={handleSaveName}
											accessibilityLabel="Display name"
										/>
									) : (
										<Text style={styles.profileName} numberOfLines={1}>
											{user.display_name}
										</Text>
									)}
									<Text style={styles.profileSubtext}>
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
										<IconButton
											icon="x"
											accessibilityLabel="Cancel editing name"
											onPress={handleCancelEdit}
											disabled={isSaving}
										/>
										<IconButton
											icon="check"
											accessibilityLabel="Save name"
											onPress={handleSaveName}
											disabled={isSaving}
										/>
									</View>
								) : (
									<IconButton
										icon="edit-2"
										accessibilityLabel="Edit display name"
										onPress={() => {
											setEditedName(user.display_name);
											setIsEditingName(true);
										}}
									/>
								)}
							</View>
						</Card>
					</View>
				) : null}

				<View style={styles.group}>
					<Eyebrow>Plan</Eyebrow>
					<Card>
						<View style={styles.planRow}>
							<View style={[styles.planIcon, isPro && styles.planIconPro]}>
								<Feather
									name={isPro ? "zap" : "user"}
									size={20}
									color={isPro ? theme.textOnAccent : theme.textMuted}
								/>
							</View>
							<View style={styles.planInfo}>
								<Text style={styles.planTitle}>{currentPlan.displayName}</Text>
								<Text style={styles.planSubtext}>
									{isPro
										? status.expiresAt
											? `${status.willRenew ? "Renews" : "Expires"} ${status.expiresAt.toLocaleDateString()}`
											: "Active subscription"
										: SUBSCRIPTIONS_ENABLED
											? currentPlanHighlights
											: "Subscription controls are unavailable in this build"}
								</Text>
							</View>
							{isPro ? <Pill label="PRO" tone="accent" /> : null}
						</View>

						{isPro ? (
							<Button
								label="Manage subscription"
								icon="settings"
								variant="secondary"
								onPress={async () => {
									const opened = await showCustomerCenter();
									if (!opened) {
										Alert.alert(
											"Subscription unavailable",
											"Could not open subscription management right now. Try again in a moment."
										);
									}
								}}
								disabled={subscriptionLoading || !SUBSCRIPTIONS_ENABLED}
								style={styles.planAction}
							/>
						) : (
							<>
								<Button
									label="Upgrade to Pro"
									icon="zap"
									onPress={showPaywall}
									disabled={subscriptionLoading || !SUBSCRIPTIONS_ENABLED}
									style={styles.planAction}
								/>
								<Button
									label="Restore purchases"
									variant="ghost"
									size="md"
									loading={isRestoring}
									onPress={async () => {
										setIsRestoring(true);
										const result = await restore();
										setIsRestoring(false);
										if (result.success) {
											Alert.alert("Restored", "Your purchases have been restored.");
										} else if (!result.userCancelled && result.error) {
											Alert.alert("Restore failed", result.error);
										}
									}}
									disabled={isRestoring || subscriptionLoading || !SUBSCRIPTIONS_ENABLED}
								/>
							</>
						)}
					</Card>
				</View>

				<View style={styles.group}>
					<Eyebrow>Privacy</Eyebrow>
					<Card padded={false}>
						<ListRow
							icon="lock"
							title="Albums are invite-only"
							subtitle="Only people with the code can open one"
							trailing={<Feather name="check" size={17} color={theme.success} />}
						/>
						<ListRow
							icon="eye-off"
							title="No public profiles"
							subtitle="No feed, no followers, no discovery"
							trailing={<Feather name="check" size={17} color={theme.success} />}
						/>
						<ListRow
							icon="shield"
							title="Nothing sold or trained on"
							subtitle="Your photos are never used for ads or models"
							trailing={<Feather name="check" size={17} color={theme.success} />}
							last
						/>
					</Card>
				</View>

				<View style={styles.group}>
					<View style={styles.groupHeader}>
						<Eyebrow>Access</Eyebrow>
						{!allPermissionsGranted ? <Pill label="Action needed" tone="warning" /> : null}
					</View>
					<Card padded={false}>
						{permissions.map((permission, index) => (
							<ListRow
								key={permission.name}
								icon={permission.icon}
								iconTone={permission.status === "granted" ? "neutral" : "accent"}
								title={permission.name}
								subtitle={permission.description}
								onPress={
									permission.status === "granted"
										? undefined
										: () => handlePermissionPress(permission)
								}
								accessibilityHint="Grants the permission"
								last={index === permissions.length - 1}
								trailing={
									<Pill
										label={getStatusText(permission.status)}
										tone={permissionTone(permission.status)}
									/>
								}
							/>
						))}
					</Card>
					{!allPermissionsGranted ? (
						<Text style={styles.groupNote}>
							Recapd needs photo access to add media, camera to scan a join code, and notifications
							to tell you when the album is about to close.
						</Text>
					) : null}
				</View>

				<View style={styles.group}>
					<Eyebrow>About</Eyebrow>
					<Card padded={false}>
						<ListRow
							icon="message-circle"
							title="Send feedback"
							subtitle="Tell us what to fix"
							onPress={() => Linking.openURL("https://forms.gle/Pt6DyHY4ZY6CZthm8")}
							accessibilityHint="Opens the feedback form in your browser"
						/>
						<ListRow
							icon="shield"
							title="Privacy policy"
							onPress={() => Linking.openURL("https://recapd.app/privacy")}
							accessibilityHint="Opens in your browser"
						/>
						<ListRow
							icon="file-text"
							title="Terms of service"
							onPress={() => Linking.openURL("https://recapd.app/terms")}
							accessibilityHint="Opens in your browser"
						/>
						<ListRow
							icon="info"
							title="Version"
							trailing={
								<Text style={styles.versionValue}>{Constants.expoConfig?.version ?? "1.0.0"}</Text>
							}
							last
						/>
					</Card>
				</View>

				<Button
					label="Reset profile"
					variant="ghost"
					size="md"
					onPress={handleResetProfile}
					style={styles.reset}
				/>
			</ScreenScroll>
		</Screen>
	);
}

const styles = StyleSheet.create({
	content: {
		paddingHorizontal: space.lg,
		paddingTop: space.lg,
		paddingBottom: space.huge,
		gap: space.xxl,
	},
	pageHeader: {
		paddingTop: space.sm,
	},
	group: {
		gap: space.md,
	},
	groupHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	groupNote: {
		...type.caption,
		fontWeight: "500",
		color: theme.textMuted,
		lineHeight: 17,
	},

	profileRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.md,
		padding: space.lg,
	},
	profileInfo: {
		flex: 1,
		gap: 3,
		minWidth: 0,
	},
	profileName: {
		...type.heading,
		color: theme.textPrimary,
	},
	profileSubtext: {
		...type.caption,
		fontWeight: "500",
		color: theme.textMuted,
	},
	nameInput: {
		...type.heading,
		color: theme.textPrimary,
		borderBottomWidth: 1.5,
		borderBottomColor: theme.accent,
		paddingVertical: 2,
	},
	editActions: {
		flexDirection: "row",
		gap: space.sm,
	},

	planRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.md,
	},
	planIcon: {
		width: 46,
		height: 46,
		borderRadius: radius.md,
		backgroundColor: theme.cardElevated,
		alignItems: "center",
		justifyContent: "center",
	},
	planIconPro: {
		backgroundColor: theme.accent,
	},
	planInfo: {
		flex: 1,
		gap: 3,
	},
	planTitle: {
		...type.subheading,
		color: theme.textPrimary,
	},
	planSubtext: {
		...type.caption,
		fontWeight: "500",
		color: theme.textMuted,
	},
	planAction: {
		marginTop: space.lg,
	},

	versionValue: {
		...type.callout,
		fontWeight: "600",
		color: theme.textMuted,
	},
	reset: {
		marginTop: space.sm,
	},
});
