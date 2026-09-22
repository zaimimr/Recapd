import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

type SentryExtra = {
	sentryDsn?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as SentryExtra;
const dsn = extra.sentryDsn ?? process.env.EXPO_PUBLIC_SENTRY_DSN ?? "";

const isDev = typeof __DEV__ !== "undefined" ? __DEV__ : process.env.NODE_ENV === "development";
const environment = isDev ? "development" : "production";

let initialized = false;

export const navigationIntegration = Sentry.expoRouterIntegration({
	enableTimeToInitialDisplay: true,
});

const NOISE_MESSAGE_PATTERNS: RegExp[] = [
	/the device or user is not allowed to make the purchase/i,
	/there was an unknown backend error/i,
	/^error performing request\.?$/i,
	/^purchase was cancelled/i,
];

const EMPTY_MESSAGE_VALUES = new Set(["", "[Filtered]", "No error message"]);

export function shouldDropSentryEvent(event: Sentry.Event): boolean {
	const candidates = [
		event.exception?.values?.[0]?.value,
		event.message,
		(event.extra?.message as string | undefined) ?? undefined,
	];
	const message = candidates.find((value): value is string => typeof value === "string") ?? "";

	if (EMPTY_MESSAGE_VALUES.has(message.trim())) {
		return true;
	}

	return NOISE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
}

export function initSentry(): void {
	if (initialized) return;
	if (!dsn) {
		if (isDev) console.warn("[sentry] DSN missing, skipping init");
		return;
	}

	// release and dist are deliberately not set: the SDK reads them from the
	// native build, which is what the source map upload tags artifacts with.
	// Overriding either one here means stack traces never symbolicate.
	Sentry.init({
		dsn,
		environment,
		debug: false,
		enableAutoSessionTracking: true,
		tracesSampleRate: isDev ? 1.0 : 0.2,
		maxBreadcrumbs: 100,
		integrations: [navigationIntegration],
		beforeSend(event) {
			if (shouldDropSentryEvent(event)) {
				return null;
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
		const message = typeof record.message === "string" ? record.message : JSON.stringify(value);
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

export function addUploadBreadcrumb(
	message: string,
	data?: Record<string, unknown>,
	level: Sentry.SeverityLevel = "info"
): void {
	if (!initialized) return;
	Sentry.addBreadcrumb({
		category: "upload",
		level,
		message,
		data,
		timestamp: Date.now() / 1000,
	});
}

export function withUploadScope<T>(
	tags: { uploadId?: string; eventId?: string; userId?: string; mediaType?: string },
	work: () => Promise<T> | T
): Promise<T> {
	if (!initialized) {
		return Promise.resolve().then(() => work());
	}
	return Sentry.withScope((scope) => {
		if (tags.uploadId) scope.setTag("uploadId", tags.uploadId);
		if (tags.eventId) scope.setTag("eventId", tags.eventId);
		if (tags.userId) scope.setTag("targetUserId", tags.userId);
		if (tags.mediaType) scope.setTag("mediaType", tags.mediaType);
		return Promise.resolve().then(() => work());
	}) as Promise<T>;
}

export { Sentry };
