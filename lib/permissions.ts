import { Camera } from "expo-camera";
import * as MediaLibrary from "expo-media-library";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";

export type PermissionOutcome = "granted" | "limited" | "denied" | "needs_settings";

export function openSystemSettings(): void {
	if (Platform.OS === "ios") {
		Linking.openURL("app-settings:");
	} else {
		Linking.openSettings();
	}
}

export async function requestPhotoAccess(): Promise<PermissionOutcome> {
	const { status, accessPrivileges, canAskAgain } = await MediaLibrary.getPermissionsAsync();

	if (accessPrivileges === "all" || status === "granted") {
		return "granted";
	}

	if (!canAskAgain) {
		return "needs_settings";
	}

	const result = await MediaLibrary.requestPermissionsAsync();

	if (result.accessPrivileges === "limited") {
		return "limited";
	}

	return result.granted ? "granted" : "denied";
}

export async function requestNotificationAccess(): Promise<PermissionOutcome> {
	const { granted, canAskAgain } = await Notifications.getPermissionsAsync();

	if (granted) {
		return "granted";
	}

	if (!canAskAgain) {
		return "needs_settings";
	}

	const result = await Notifications.requestPermissionsAsync();
	return result.granted ? "granted" : "denied";
}

export async function requestCameraAccess(): Promise<PermissionOutcome> {
	const { granted, canAskAgain } = await Camera.getCameraPermissionsAsync();

	if (granted) {
		return "granted";
	}

	if (!canAskAgain) {
		return "needs_settings";
	}

	const result = await Camera.requestCameraPermissionsAsync();
	return result.granted ? "granted" : "denied";
}
