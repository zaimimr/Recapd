import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { Platform } from "react-native";

type SentryExtra = {
	sentryDsn?: string;
	slackErrorWebhookUrl?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as SentryExtra;
const dsn = extra.sentryDsn ?? process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";
const slackWebhookUrl =
	extra.slackErrorWebhookUrl ?? process.env.EXPO_PUBLIC_SLACK_ERROR_WEBHOOK_URL ?? "";

const isDev = typeof __DEV__ !== "undefined" ? __DEV__ : process.env.NODE_ENV === "development";
const environment = isDev ? "development" : "production";
const release = Constants.expoConfig?.version ?? undefined;

let initialized = false;

export const navigationIntegration = Sentry.expoRouterIntegration({
	enableTimeToInitialDisplay: true,
});

export function initSentry(): void {
	if (initialized) return;
	if (!dsn) {
		if (isDev) console.warn("[sentry] DSN missing, skipping init");
		return;
	}

	Sentry.init({
		dsn,
		environment,
		release,
		debug: false,
		enableAutoSessionTracking: true,
		tracesSampleRate: isDev ? 1.0 : 0.2,
		integrations: [navigationIntegration],
		beforeSend(event, hint) {
			if (!isDev) {
				void postErrorToSlack(event, hint).catch(() => undefined);
			}
			return event;
		},
	});

	initialized = true;
}

export function setSentryUser(userId: string | null, email?: string | null): void {
	if (!initialized) return;
	if (!userId) {
		Sentry.setUser(null);
		return;
	}
	Sentry.setUser({ id: userId, email: email ?? undefined });
}

export function captureSentryException(error: unknown, context?: Record<string, unknown>): void {
	if (!initialized) return;
	Sentry.captureException(normalizeError(error), context ? { extra: context } : undefined);
}

function normalizeError(value: unknown): Error {
	if (value instanceof Error) return value;
	if (typeof value === "string") return new Error(value);
	if (value && typeof value === "object") {
		const record = value as { message?: unknown; name?: unknown };
		const message =
			typeof record.message === "string" ? record.message : JSON.stringify(value);
		const error = new Error(message);
		if (typeof record.name === "string") error.name = record.name;
		return error;
	}
	return new Error(String(value));
}

export function captureSentryMessage(
	message: string,
	level: Sentry.SeverityLevel,
	context?: Record<string, unknown>
): void {
	if (!initialized) return;
	Sentry.captureMessage(message, {
		level,
		extra: context,
	});
}

async function postErrorToSlack(
	event: Sentry.Event,
	hint: { originalException?: unknown } | undefined
): Promise<void> {
	if (!slackWebhookUrl) return;

	const exception = event.exception?.values?.[0];
	const fallbackFromHint =
		hint?.originalException != null ? String(hint.originalException) : undefined;
	const title =
		exception?.type && exception?.value
			? `${exception.type}: ${exception.value}`
			: (event.message ?? fallbackFromHint ?? "Unknown error");

	const frames = exception?.stacktrace?.frames ?? [];
	const topFrames = frames
		.slice(-5)
		.reverse()
		.map((frame) => {
			const fn = frame.function ?? "?";
			const file = frame.filename ?? "?";
			const line = frame.lineno ?? "?";
			return `${fn} (${file}:${line})`;
		})
		.join("\n");

	const route =
		typeof event.tags?.["route"] === "string" ? (event.tags["route"] as string) : undefined;
	const user = event.user?.id ? `user:${event.user.id}` : "anon";
	const level = event.level ?? "error";

	const headerLines = [
		`*[Recapd ${level}]* ${Platform.OS} v${release ?? "?"}`,
		`route: \`${route ?? "n/a"}\` | ${user} | env: ${environment}`,
		`event: ${event.event_id ?? "?"}`,
	];

	const text = [
		headerLines.join("\n"),
		"",
		`*${truncate(title, 300)}*`,
		topFrames ? `\n\`\`\`${truncate(topFrames, 1500)}\`\`\`` : "",
	]
		.filter(Boolean)
		.join("\n");

	try {
		await fetch(slackWebhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ text }),
		});
	} catch {
		return;
	}
}

function truncate(value: string, max: number): string {
	if (value.length <= max) return value;
	return `${value.slice(0, max - 1)}…`;
}

export { Sentry };
