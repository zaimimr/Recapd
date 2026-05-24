import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";
import { logger } from "./logger";
import { supabase } from "./supabase";

let handlerConfigured = false;
let _responseListenerSubscription: Notifications.Subscription | null = null;

function handleNotificationResponse(response: Notifications.NotificationResponse) {
	const data = response.notification.request.content.data;

	if (data?.type === "upload_reminder" && data?.eventIds) {
		const eventIds = data.eventIds as string[];
		if (eventIds.length > 0) {
			router.push(`/contribute/${eventIds[0]}`);
		}
	} else if (data?.type === "host_reminder" && data?.eventId) {
		const target = data.reminder_type === "take_photos" ? "contribute" : "event";
		router.push(`/${target}/${data.eventId}`);
	} else if (data?.eventId) {
		router.push(`/contribute/${data.eventId}`);
	}
}

export function setupNotificationHandler() {
	if (handlerConfigured) return;

	Notifications.setNotificationHandler({
		handleNotification: async () => ({
			shouldShowAlert: true,
			shouldPlaySound: true,
			shouldSetBadge: false,
			shouldShowBanner: true,
			shouldShowList: true,
		}),
	});

	_responseListenerSubscription = Notifications.addNotificationResponseReceivedListener(
		handleNotificationResponse
	);

	handlerConfigured = true;
}

export async function registerForPushNotifications(): Promise<string | null> {
	if (!Device.isDevice) {
		logger.warn("Push notifications require a physical device");
		return null;
	}

	const { status: existingStatus } = await Notifications.getPermissionsAsync();
	let finalStatus = existingStatus;

	if (existingStatus !== "granted") {
		const { status } = await Notifications.requestPermissionsAsync();
		finalStatus = status;
	}

	if (finalStatus !== "granted") {
		logger.warn("Push notification permission not granted");
		return null;
	}

	if (Platform.OS === "android") {
		await Notifications.setNotificationChannelAsync("default", {
			name: "default",
			importance: Notifications.AndroidImportance.MAX,
			vibrationPattern: [0, 250, 250, 250],
			lightColor: "#7c3aed",
		});
	}

	const projectId = Constants.expoConfig?.extra?.eas?.projectId;
	const token = await Notifications.getExpoPushTokenAsync({ projectId });

	return token.data;
}

export async function savePushToken(userId: string, token: string): Promise<void> {
	const { error } = await supabase.from("user_private_data").upsert(
		{
			user_id: userId,
			push_token: token,
		},
		{ onConflict: "user_id" }
	);

	if (error) {
		logger.error("Failed to save push token", error, { userId });
	}
}
