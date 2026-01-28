import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const NOTIFICATION_PROMPT_KEY = 'recapd_notification_prompt_seen';

export async function hasSeenNotificationPrompt(): Promise<boolean> {
  const seen = await AsyncStorage.getItem(NOTIFICATION_PROMPT_KEY);
  return seen === 'true';
}

export async function markNotificationPromptSeen(): Promise<void> {
  await AsyncStorage.setItem(NOTIFICATION_PROMPT_KEY, 'true');
}

export async function shouldShowNotificationPrompt(): Promise<boolean> {
  const seen = await hasSeenNotificationPrompt();
  if (seen) return false;

  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return false;

  return true;
}
