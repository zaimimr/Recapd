import AsyncStorage from "@react-native-async-storage/async-storage";
import { differenceInMilliseconds, isPast, subDays, subHours } from "date-fns";
import * as Notifications from "expo-notifications";

const SCHEDULED_REMINDERS_KEY = "recapd_scheduled_reminders";

interface ScheduledReminder {
	eventId: string;
	eventTitle: string;
	notificationId: string;
	type: "event_ended" | "daily_nudge" | "expiry_7d" | "expiry_3d" | "expiry_24h" | "last_chance";
	scheduledFor: string;
}

async function getScheduledReminders(): Promise<ScheduledReminder[]> {
	const stored = await AsyncStorage.getItem(SCHEDULED_REMINDERS_KEY);
	return stored ? JSON.parse(stored) : [];
}

async function saveScheduledReminders(reminders: ScheduledReminder[]): Promise<void> {
	await AsyncStorage.setItem(SCHEDULED_REMINDERS_KEY, JSON.stringify(reminders));
}

export async function scheduleEventReminders(
	eventId: string,
	eventTitle: string,
	endsAt: Date,
	expiresAt: Date
): Promise<void> {
	const existingReminders = await getScheduledReminders();
	const eventReminders = existingReminders.filter((r) => r.eventId === eventId);

	for (const reminder of eventReminders) {
		await Notifications.cancelScheduledNotificationAsync(reminder.notificationId);
	}

	const newReminders = existingReminders.filter((r) => r.eventId !== eventId);
	const now = new Date();

	const remindersToSchedule: Array<{
		type: ScheduledReminder["type"];
		date: Date;
		title: string;
		body: string;
	}> = [];

	if (!isPast(endsAt)) {
		remindersToSchedule.push({
			type: "event_ended",
			date: endsAt,
			title: `${eventTitle} just ended!`,
			body: "Share your photos before they expire.",
		});
	}

	const sevenDaysBefore = subDays(expiresAt, 7);
	if (!isPast(sevenDaysBefore)) {
		remindersToSchedule.push({
			type: "expiry_7d",
			date: sevenDaysBefore,
			title: "1 week left",
			body: `Photos from ${eventTitle} expire in 7 days. Download your favorites!`,
		});
	}

	const threeDaysBefore = subDays(expiresAt, 3);
	if (!isPast(threeDaysBefore)) {
		remindersToSchedule.push({
			type: "expiry_3d",
			date: threeDaysBefore,
			title: "3 days left",
			body: `Photos from ${eventTitle} expire in 3 days.`,
		});
	}

	const oneDayBefore = subDays(expiresAt, 1);
	if (!isPast(oneDayBefore)) {
		remindersToSchedule.push({
			type: "expiry_24h",
			date: oneDayBefore,
			title: "Last day!",
			body: `Photos from ${eventTitle} expire tomorrow. Download now!`,
		});
	}

	const lastChance = subHours(expiresAt, 48);
	if (!isPast(lastChance)) {
		remindersToSchedule.push({
			type: "last_chance",
			date: lastChance,
			title: "Last chance to save!",
			body: `Photos from ${eventTitle} expire in 2 days. Tap to download.`,
		});
	}

	for (const reminder of remindersToSchedule) {
		const delay = differenceInMilliseconds(reminder.date, now);
		if (delay > 0) {
			const notificationId = await Notifications.scheduleNotificationAsync({
				content: {
					title: reminder.title,
					body: reminder.body,
					data: { eventId, type: reminder.type },
					sound: true,
				},
				trigger: {
					type: Notifications.SchedulableTriggerInputTypes.DATE,
					date: reminder.date,
				},
			});

			newReminders.push({
				eventId,
				eventTitle,
				notificationId,
				type: reminder.type,
				scheduledFor: reminder.date.toISOString(),
			});
		}
	}

	await saveScheduledReminders(newReminders);
}

export async function cancelEventReminders(eventId: string): Promise<void> {
	const reminders = await getScheduledReminders();
	const eventReminders = reminders.filter((r) => r.eventId === eventId);

	for (const reminder of eventReminders) {
		await Notifications.cancelScheduledNotificationAsync(reminder.notificationId);
	}

	const remainingReminders = reminders.filter((r) => r.eventId !== eventId);
	await saveScheduledReminders(remainingReminders);
}

export async function scheduleUploadReminder(
	eventId: string,
	eventTitle: string,
	delayHours: number = 24
): Promise<string | null> {
	const scheduledDate = new Date(Date.now() + delayHours * 60 * 60 * 1000);

	const notificationId = await Notifications.scheduleNotificationAsync({
		content: {
			title: "Don't forget to share!",
			body: `You have photos from ${eventTitle} waiting to be shared.`,
			data: { eventId, type: "daily_nudge" },
			sound: true,
		},
		trigger: {
			type: Notifications.SchedulableTriggerInputTypes.DATE,
			date: scheduledDate,
		},
	});

	const reminders = await getScheduledReminders();
	reminders.push({
		eventId,
		eventTitle,
		notificationId,
		type: "daily_nudge",
		scheduledFor: scheduledDate.toISOString(),
	});
	await saveScheduledReminders(reminders);

	return notificationId;
}

export async function cancelUploadReminder(eventId: string): Promise<void> {
	const reminders = await getScheduledReminders();
	const nudgeReminders = reminders.filter((r) => r.eventId === eventId && r.type === "daily_nudge");

	for (const reminder of nudgeReminders) {
		await Notifications.cancelScheduledNotificationAsync(reminder.notificationId);
	}

	const remainingReminders = reminders.filter(
		(r) => !(r.eventId === eventId && r.type === "daily_nudge")
	);
	await saveScheduledReminders(remainingReminders);
}

export async function getScheduledRemindersForEvent(eventId: string): Promise<ScheduledReminder[]> {
	const reminders = await getScheduledReminders();
	return reminders.filter((r) => r.eventId === eventId);
}

export async function cleanupExpiredReminders(): Promise<void> {
	const reminders = await getScheduledReminders();

	const activeReminders = reminders.filter((r) => {
		const scheduledDate = new Date(r.scheduledFor);
		return !isPast(scheduledDate);
	});

	if (activeReminders.length !== reminders.length) {
		await saveScheduledReminders(activeReminders);
	}
}
