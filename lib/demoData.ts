import { addDays, subDays, subHours } from "date-fns";
import type { EventWithParticipants } from "@/store/eventStore";
import type { MediaItemWithUser } from "@/types/database";

const now = new Date();

const DEMO_USER_ID = "demo-user-sarah";

const DEMO_USERS = {
	sarah: { id: DEMO_USER_ID, name: "Sarah" },
	james: { id: "demo-user-james", name: "James" },
	maya: { id: "demo-user-maya", name: "Maya" },
	alex: { id: "demo-user-alex", name: "Alex" },
	emma: { id: "demo-user-emma", name: "Emma" },
	liam: { id: "demo-user-liam", name: "Liam" },
	priya: { id: "demo-user-priya", name: "Priya" },
	noah: { id: "demo-user-noah", name: "Noah" },
};

function demoEvent(
	id: string,
	title: string,
	startsAt: Date,
	endsAt: Date,
	participantCount: number,
	role: "host" | "guest" = "host"
): EventWithParticipants {
	return {
		id,
		title,
		starts_at: startsAt.toISOString(),
		ends_at: endsAt.toISOString(),
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		join_code: id.slice(0, 6).toUpperCase(),
		created_by_user_id: role === "host" ? DEMO_USER_ID : DEMO_USERS.emma.id,
		status: "live" as const,
		expires_at: addDays(endsAt, 14).toISOString(),
		created_at: subDays(startsAt, 1).toISOString(),
		updated_at: now.toISOString(),
		participant_count: participantCount,
		userRole: role,
		hostIsPro: false,
	};
}

function demoMedia(
	id: string,
	eventId: string,
	userId: string,
	displayName: string,
	capturedAt: Date,
	url: string,
	width: number,
	height: number
): MediaItemWithUser {
	return {
		id,
		event_id: eventId,
		uploaded_by_user_id: userId,
		captured_at: capturedAt.toISOString(),
		uploaded_at: capturedAt.toISOString(),
		media_type: "photo",
		width,
		height,
		duration_milliseconds: null,
		file_size_bytes: 2048000,
		storage_path: url,
		thumbnail_path: null,
		visibility: "shared",
		deleted_at: null,
		latitude: null,
		longitude: null,
		uploader: { display_name: displayName },
	};
}

const weddingStart = subHours(now, 3);
const weddingEnd = addDays(now, 0.1);

const tripStart = subDays(now, 7);
const tripEnd = subDays(now, 5);

const festStart = subDays(now, 12);
const festEnd = subDays(now, 10);

export const DEMO_EVENTS: EventWithParticipants[] = [
	demoEvent("wed001", "Sarah & James Wedding", weddingStart, weddingEnd, 8),
	demoEvent("trip01", "Bali Trip 2025", tripStart, tripEnd, 5, "guest"),
	demoEvent("fest01", "Summer Music Fest", festStart, festEnd, 12),
];

const W = "wed001";
const T = "trip01";
const F = "fest01";

export const DEMO_MEDIA: Record<string, MediaItemWithUser[]> = {
	[W]: [
		demoMedia(
			"w1",
			W,
			DEMO_USERS.maya.id,
			"Maya",
			subHours(now, 2.5),
			"https://images.unsplash.com/photo-1519741497674-611481863552?w=800&q=80",
			800,
			1200
		),
		demoMedia(
			"w2",
			W,
			DEMO_USERS.alex.id,
			"Alex",
			subHours(now, 2.4),
			"https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=800&q=80",
			800,
			533
		),
		demoMedia(
			"w3",
			W,
			DEMO_USERS.james.id,
			"James",
			subHours(now, 2.3),
			"https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=800&q=80",
			800,
			533
		),
		demoMedia(
			"w4",
			W,
			DEMO_USERS.priya.id,
			"Priya",
			subHours(now, 2),
			"https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=800&q=80",
			800,
			533
		),
		demoMedia(
			"w5",
			W,
			DEMO_USERS.sarah.id,
			"Sarah",
			subHours(now, 1.8),
			"https://images.unsplash.com/photo-1532712938310-34cb3982ef74?w=800&q=80",
			800,
			1200
		),
		demoMedia(
			"w6",
			W,
			DEMO_USERS.liam.id,
			"Liam",
			subHours(now, 1.5),
			"https://images.unsplash.com/photo-1591604466107-ec97de577aff?w=800&q=80",
			800,
			1200
		),
		demoMedia(
			"w7",
			W,
			DEMO_USERS.noah.id,
			"Noah",
			subHours(now, 1.2),
			"https://images.unsplash.com/photo-1583939003579-730e3918a45a?w=800&q=80",
			800,
			533
		),
	],
	[T]: [
		demoMedia(
			"t1",
			T,
			DEMO_USERS.emma.id,
			"Emma",
			subDays(now, 6.8),
			"https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&q=80",
			800,
			533
		),
		demoMedia(
			"t2",
			T,
			DEMO_USERS.alex.id,
			"Alex",
			subDays(now, 6.5),
			"https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80",
			800,
			533
		),
		demoMedia(
			"t3",
			T,
			DEMO_USERS.sarah.id,
			"Sarah",
			subDays(now, 6.2),
			"https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80",
			800,
			533
		),
		demoMedia(
			"t4",
			T,
			DEMO_USERS.maya.id,
			"Maya",
			subDays(now, 5.8),
			"https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80",
			800,
			533
		),
		demoMedia(
			"t5",
			T,
			DEMO_USERS.liam.id,
			"Liam",
			subDays(now, 5.5),
			"https://images.unsplash.com/photo-1528164344705-47542687000d?w=800&q=80",
			800,
			1200
		),
	],
	[F]: [
		demoMedia(
			"f1",
			F,
			DEMO_USERS.noah.id,
			"Noah",
			subDays(now, 11.8),
			"https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&q=80",
			800,
			533
		),
		demoMedia(
			"f2",
			F,
			DEMO_USERS.priya.id,
			"Priya",
			subDays(now, 11.5),
			"https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&q=80",
			800,
			533
		),
		demoMedia(
			"f3",
			F,
			DEMO_USERS.alex.id,
			"Alex",
			subDays(now, 11.2),
			"https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800&q=80",
			800,
			533
		),
		demoMedia(
			"f4",
			F,
			DEMO_USERS.emma.id,
			"Emma",
			subDays(now, 10.8),
			"https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=800&q=80",
			800,
			533
		),
		demoMedia(
			"f5",
			F,
			DEMO_USERS.sarah.id,
			"Sarah",
			subDays(now, 10.5),
			"https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80",
			800,
			600
		),
		demoMedia(
			"f6",
			F,
			DEMO_USERS.james.id,
			"James",
			subDays(now, 10.2),
			"https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800&q=80",
			800,
			1200
		),
	],
};

export { DEMO_USER_ID };
