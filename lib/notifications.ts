import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

let handlerConfigured = false;

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

  handlerConfigured = true;
}

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#7c3aed',
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const token = await Notifications.getExpoPushTokenAsync({ projectId });

  return token.data;
}

export async function savePushToken(userId: string, token: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ push_token: token })
    .eq('id', userId);

  if (error) {
    console.error('Failed to save push token:', error);
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
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      console.error('Push notification failed:', await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('Push notification error:', error);
    return false;
  }
}

export async function sendReminderToParticipants(
  eventId: string,
  eventTitle: string,
  excludeUserId?: string
): Promise<{ success: boolean; sentCount: number }> {
  const { data: participants, error } = await supabase
    .from('event_participants')
    .select('user_id, users!inner(push_token)')
    .eq('event_id', eventId);

  if (error) {
    console.error('Failed to fetch participants:', error);
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
    "Don't forget to upload your photos!"
  );

  return { success, sentCount: tokens.length };
}
