import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { Platform } from "react-native";
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
		console.log("Push notifications require a physical device");
		return null;
	}

	const { status: existingStatus } = await Notifications.getPermissionsAsync();
	let finalStatus = existingStatus;

	if (existingStatus !== "granted") {
		const { status } = await Notifications.requestPermissionsAsync();
		finalStatus = status;
	}

	if (finalStatus !== "granted") {
		console.log("Push notification permission not granted");
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
	const { error } = await supabase.from("users").update({ push_token: token }).eq("id", userId);

	if (error) {
		console.error("Failed to save push token:", error);
	}
}

interface PushMessage {
	to: string;
	title: string;
	body: string;
	data?: Record<string, unknown>;
}

export async function sendPushNotification(
	tokens: string[],
	title: string,
	body: string,
	data?: Record<string, unknown>
): Promise<boolean> {
	const messages: PushMessage[] = tokens.map((token) => ({
		to: token,
		title,
		body,
		data,
	}));

	try {
		const response = await fetch("https://exp.host/--/api/v2/push/send", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(messages),
		});

		if (!response.ok) {
			console.error("Push notification failed:", await response.text());
			return false;
		}

		return true;
	} catch (error) {
		console.error("Push notification error:", error);
		return false;
	}
}

export async function sendReminderToParticipants(
	eventId: string,
	eventTitle: string,
	excludeUserId?: string
): Promise<{ success: boolean; sentCount: number }> {
	const { data: participants, error } = await supabase
		.from("event_participants")
		.select("user_id, users!inner(push_token)")
		.eq("event_id", eventId);

	if (error) {
		console.error("Failed to fetch participants:", error);
		return { success: false, sentCount: 0 };
	}

	const tokens = participants
		.filter((p) => p.user_id !== excludeUserId)
		.map((p) => (p.users as unknown as { push_token: string | null })?.push_token)
		.filter((token): token is string => !!token);

	if (tokens.length === 0) {
		return { success: true, sentCount: 0 };
	}

	const success = await sendPushNotification(
		tokens,
		eventTitle,
		"Don't forget to upload your photos!",
		{ type: "upload_reminder", eventId, eventIds: [eventId] }
	);

	return { success, sentCount: tokens.length };
}

export async function sendParticipantLimitNotification(
	eventId: string,
	eventTitle: string,
	hostUserId: string
): Promise<boolean> {
	const { data: hostUser, error } = await supabase
		.from("users")
		.select("push_token")
		.eq("id", hostUserId)
		.single();

	if (error || !hostUser?.push_token) {
		return false;
	}

	return sendPushNotification(
		[hostUser.push_token],
		`${eventTitle} reached 12 participants`,
		"Upgrade to Pro for unlimited participants.",
		{ type: "participant_limit", eventId }
	);
}
