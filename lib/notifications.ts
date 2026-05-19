import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";

Notifications.setNotificationHandler({
	handleNotification: async () => ({
		shouldShowBanner: true,
		shouldShowList: true,
		shouldPlaySound: false,
		shouldSetBadge: false,
	}),
});

export type PermissionState = "granted" | "denied" | "undetermined";

export async function getPermissionState(): Promise<PermissionState> {
	const { status } = await Notifications.getPermissionsAsync();
	if (status === "granted") return "granted";
	if (status === "denied") return "denied";
	return "undetermined";
}

export async function requestSystemPermission(): Promise<PermissionState> {
	const { status } = await Notifications.requestPermissionsAsync({
		ios: {
			allowAlert: true,
			allowBadge: false,
			allowSound: true,
		},
	});
	if (status === "granted") return "granted";
	if (status === "denied") return "denied";
	return "undetermined";
}

async function ensureAndroidChannel() {
	if (Platform.OS !== "android") return;
	await Notifications.setNotificationChannelAsync("default", {
		name: "Recapd reminders",
		importance: Notifications.AndroidImportance.DEFAULT,
		vibrationPattern: [0, 200, 100, 200],
		lightColor: "#7c3aed",
	});
}

export async function registerForPushNotifications(): Promise<string | null> {
	if (!Device.isDevice) return null;
	await ensureAndroidChannel();
	const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
	if (!projectId) return null;
	try {
		const token = await Notifications.getExpoPushTokenAsync({ projectId });
		return token.data;
	} catch {
		return null;
	}
}

export async function persistPushToken(token: string): Promise<void> {
	const { data: userResult } = await supabase.auth.getUser();
	const userId = userResult.user?.id;
	if (!userId) return;
	await supabase.from("push_tokens").upsert(
		{
			user_id: userId,
			expo_token: token,
			platform: Platform.OS,
		},
		{ onConflict: "user_id,expo_token" }
	);
}

export async function clearPushTokensForCurrentUser(): Promise<void> {
	const { data: userResult } = await supabase.auth.getUser();
	const userId = userResult.user?.id;
	if (!userId) return;
	await supabase.from("push_tokens").delete().eq("user_id", userId);
}

export type DeepLinkPayload = {
	type: "open_contribute";
	eventId: string;
	prefill?: "window" | string;
};

export function parseDeepLink(url: string | null | undefined): DeepLinkPayload | null {
	if (!url) return null;
	try {
		const { scheme, hostname, path, queryParams } = Linking.parse(url);
		const pathSegments = (path ?? "").split("/").filter(Boolean);
		const isCustomScheme = scheme === "recapd";
		const segments = isCustomScheme && hostname ? [hostname, ...pathSegments] : pathSegments;
		if (segments[0] !== "event") return null;
		const eventId = segments[1];
		const action = segments[2];
		if (!eventId || action !== "contribute") return null;
		const rawPrefill = queryParams?.prefill;
		const prefill = typeof rawPrefill === "string" ? rawPrefill : undefined;
		return { type: "open_contribute", eventId, prefill };
	} catch {
		return null;
	}
}

export function buildContributeDeepLink(
	eventId: string,
	prefill: "window" | string = "window"
): string {
	return `recapd://event/${eventId}/contribute?prefill=${encodeURIComponent(prefill)}`;
}

export function addNotificationResponseListener(
	handler: (payload: DeepLinkPayload) => void
): () => void {
	const sub = Notifications.addNotificationResponseReceivedListener((response) => {
		const data = response.notification.request.content.data as { deep_link?: string } | undefined;
		const payload = parseDeepLink(data?.deep_link);
		if (payload) handler(payload);
	});
	return () => sub.remove();
}
