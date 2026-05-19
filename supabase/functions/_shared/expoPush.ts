export type ExpoPushMessage = {
	to: string;
	title?: string;
	body?: string;
	data?: Record<string, unknown>;
	sound?: "default" | null;
	channelId?: string;
	priority?: "default" | "normal" | "high";
};

export type ExpoPushTicket = {
	status: "ok" | "error";
	id?: string;
	message?: string;
	details?: { error?: string };
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100;

export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
	if (messages.length === 0) return [];
	const tickets: ExpoPushTicket[] = [];
	for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
		const chunk = messages.slice(i, i + CHUNK_SIZE);
		const res = await fetch(EXPO_PUSH_URL, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Accept-Encoding": "gzip, deflate",
				"Content-Type": "application/json",
			},
			body: JSON.stringify(chunk),
		});
		if (!res.ok) {
			for (let j = 0; j < chunk.length; j++) {
				tickets.push({ status: "error", message: `HTTP ${res.status}` });
			}
			continue;
		}
		const json = (await res.json()) as { data?: ExpoPushTicket[] };
		if (json.data) tickets.push(...json.data);
	}
	return tickets;
}

export function buildContributeDeepLink(eventId: string, prefill = "window"): string {
	return `recapd://event/${eventId}/contribute?prefill=${encodeURIComponent(prefill)}`;
}
