import Constants from "expo-constants";
import { Platform } from "react-native";

import type { Database, Json } from "@/types/database";

const isDev =
	process.env.NODE_ENV !== "test" &&
	(typeof __DEV__ !== "undefined" ? __DEV__ : process.env.NODE_ENV === "development");

const TELEMETRY_STORAGE_KEY = "recapd.telemetry.queue.v2";
const TELEMETRY_QUEUE_LIMIT = 150;
const TELEMETRY_BATCH_LIMIT = 25;
const TELEMETRY_FLUSH_COOLDOWN_MS = 15_000;
const TELEMETRY_SESSION_ID = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

type LogContext = Record<string, unknown> | undefined;
type TelemetryEventKind = Database["public"]["Enums"]["telemetry_event_kind"];
type TelemetrySeverity = Database["public"]["Enums"]["telemetry_severity"];
type TelemetryInsert = Database["public"]["Tables"]["telemetry_events"]["Insert"];
type TelemetryMetadata = Record<string, Json>;
type AsyncStorageLike = {
	getItem: (key: string) => Promise<string | null>;
	setItem: (key: string, value: string) => Promise<void>;
	removeItem: (key: string) => Promise<void>;
};
type ExpoApplicationLike = {
	nativeApplicationVersion?: string | null;
	nativeBuildVersion?: string | null;
};

interface TelemetryContext {
	route?: string | null;
	userId?: string | null;
}

interface TelemetryQueueEvent {
	id: string;
	occurred_at: string;
	event_kind: TelemetryEventKind;
	severity: TelemetrySeverity;
	name: string;
	message?: string | null;
	stack_trace?: string | null;
	source?: string | null;
	route?: string | null;
	screen?: string | null;
	metadata?: TelemetryMetadata;
}

let telemetryQueue: TelemetryQueueEvent[] = [];
let telemetryContext: TelemetryContext = {};
let telemetryHydrated = false;
let telemetryHydrating: Promise<void> | null = null;
let telemetryFlushing: Promise<boolean> | null = null;
let telemetryInstalled = false;
let lastTelemetryFlushAt = 0;

const noopAsyncStorage: AsyncStorageLike = {
	async getItem() {
		return null;
	},
	async setItem() {
		// No-op fallback for non-native test environments.
	},
	async removeItem() {
		// No-op fallback for non-native test environments.
	},
};

function resolveAsyncStorage(): AsyncStorageLike {
	try {
		const module = require("@react-native-async-storage/async-storage") as {
			default?: AsyncStorageLike;
		} & AsyncStorageLike;
		return module.default ?? module;
	} catch {
		return noopAsyncStorage;
	}
}

function resolveExpoApplication(): ExpoApplicationLike {
	if (process.env.NODE_ENV === "test") {
		return {};
	}

	try {
		return require("expo-application") as ExpoApplicationLike;
	} catch {
		return {};
	}
}

const asyncStorage = resolveAsyncStorage();
const application = resolveExpoApplication();

function createId(): string {
	return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeRoute(route: string): string {
	return route
		.split("/")
		.map((segment) => {
			if (!segment) return segment;
			if (/^\d+$/.test(segment)) return ":id";
			if (/^[a-f0-9-]{8,}$/i.test(segment)) return ":id";
			if (/^[A-Z0-9]{6}$/i.test(segment)) return ":code";
			if (/^[a-z0-9]{16,}$/i.test(segment)) return ":id";
			return segment;
		})
		.join("/")
		.replace(/\/+/g, "/");
}

function getPlatform(): Database["public"]["Tables"]["telemetry_events"]["Insert"]["platform"] {
	if (Platform.OS === "ios" || Platform.OS === "android") {
		return Platform.OS;
	}

	return "web";
}

function getAppVersion(): string | null {
	return application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null;
}

function getBuildNumber(): string | null {
	return application.nativeBuildVersion ?? null;
}

function safeConsoleWarn(message: string, error?: unknown) {
	if (!isDev) return;
	console.warn({
		message,
		error: error ? formatError(error) : undefined,
	});
}

function sanitizeValue(value: unknown, key?: string, depth: number = 0): Json | undefined {
	if (value == null) return null;

	if (depth > 4) {
		return "[max-depth]";
	}

	if (key && /token|secret|authorization|password|session|jwt|push/i.test(key)) {
		return "[redacted]";
	}

	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return typeof value === "string" && value.length > 256 ? `${value.slice(0, 253)}...` : value;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (value instanceof Error) {
		return formatError(value);
	}

	if (Array.isArray(value)) {
		return value
			.slice(0, 25)
			.map((entry) => sanitizeValue(entry, key, depth + 1) ?? null) satisfies Json[];
	}

	if (typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>).slice(0, 25);
		const sanitizedEntries = entries
			.map(
				([entryKey, entryValue]) =>
					[entryKey, sanitizeValue(entryValue, entryKey, depth + 1)] as const
			)
			.filter(([, entryValue]) => entryValue !== undefined);
		return Object.fromEntries(sanitizedEntries) as Record<string, Json>;
	}

	return String(value);
}

function sanitizeContext(context?: LogContext): TelemetryMetadata | undefined {
	if (!context) return undefined;

	const sanitized = sanitizeValue(context);
	if (!sanitized || Array.isArray(sanitized) || typeof sanitized !== "object") {
		return undefined;
	}

	return sanitized as TelemetryMetadata;
}

function formatError(error: unknown): TelemetryMetadata {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack ?? null,
		};
	}

	if (error && typeof error === "object") {
		const errorObject = error as Record<string, unknown>;
		return {
			name: typeof errorObject.name === "string" ? errorObject.name : null,
			message: typeof errorObject.message === "string" ? errorObject.message : "Unknown error",
			code: sanitizeValue(errorObject.code) ?? null,
			details: sanitizeValue(errorObject.details) ?? null,
			hint: sanitizeValue(errorObject.hint) ?? null,
			status: sanitizeValue(errorObject.status) ?? null,
			statusText: sanitizeValue(errorObject.statusText) ?? null,
			stack: typeof errorObject.stack === "string" ? errorObject.stack : null,
		};
	}

	return {
		message: typeof error === "string" ? error : "Unknown error",
	};
}

async function hydrateTelemetryQueue(): Promise<void> {
	if (telemetryHydrated) return;
	if (telemetryHydrating) return telemetryHydrating;

	telemetryHydrating = (async () => {
		try {
			const raw = await asyncStorage.getItem(TELEMETRY_STORAGE_KEY);
			if (!raw) return;

			const parsed = JSON.parse(raw) as TelemetryQueueEvent[];
			if (Array.isArray(parsed)) {
				telemetryQueue = parsed.slice(-TELEMETRY_QUEUE_LIMIT);
			}
		} catch {
			telemetryQueue = [];
		} finally {
			telemetryHydrated = true;
			telemetryHydrating = null;
		}
	})();

	return telemetryHydrating;
}

async function persistTelemetryQueue(): Promise<void> {
	try {
		await asyncStorage.setItem(
			TELEMETRY_STORAGE_KEY,
			JSON.stringify(telemetryQueue.slice(-TELEMETRY_QUEUE_LIMIT))
		);
	} catch {
		// Telemetry should never block product flows.
	}
}

function buildTelemetryInsert(event: TelemetryQueueEvent, actorUserId: string): TelemetryInsert {
	return {
		occurred_at: event.occurred_at,
		event_kind: event.event_kind,
		severity: event.severity,
		name: event.name,
		message: event.message ?? null,
		stack_trace: event.stack_trace ?? null,
		source: event.source ?? null,
		platform: getPlatform(),
		app_version: getAppVersion(),
		build_number: getBuildNumber(),
		session_id: TELEMETRY_SESSION_ID,
		trace_id: null,
		span_id: null,
		parent_span_id: null,
		route: event.route ?? null,
		screen: event.screen ?? null,
		actor_user_id: actorUserId,
		event_id: null,
		metadata: event.metadata ?? {},
	};
}

function enqueueTelemetryEvent(event: Omit<TelemetryQueueEvent, "id" | "occurred_at">) {
	const normalizedRoute =
		event.route === undefined
			? telemetryContext.route
				? normalizeRoute(telemetryContext.route)
				: null
			: event.route
				? normalizeRoute(event.route)
				: null;

	const nextEvent: TelemetryQueueEvent = {
		...event,
		id: createId(),
		occurred_at: new Date().toISOString(),
		route: normalizedRoute,
		screen: event.screen ?? null,
		metadata: event.metadata ?? {},
	};

	telemetryQueue = [...telemetryQueue.slice(-(TELEMETRY_QUEUE_LIMIT - 1)), nextEvent];
	void persistTelemetryQueue();

	if (event.severity === "error" || event.severity === "fatal") {
		void flushTelemetryQueue(true);
	}
}

export function setTelemetryContext(context: TelemetryContext): void {
	telemetryContext = {
		...telemetryContext,
		...context,
	};

	if (context.route) {
		telemetryContext.route = normalizeRoute(context.route);
	}

	if (context.userId) {
		void flushTelemetryQueue(true);
	}
}

export function traceScreen(route: string, context?: LogContext): void {
	const normalizedRoute = normalizeRoute(route);
	setTelemetryContext({ route: normalizedRoute });

	enqueueTelemetryEvent({
		event_kind: "trace",
		severity: "info",
		name: "screen.view",
		message: normalizedRoute,
		source: "navigation",
		route: normalizedRoute,
		screen: normalizedRoute,
		metadata: sanitizeContext(context),
	});
}

export function traceEvent(name: string, context?: LogContext): void {
	enqueueTelemetryEvent({
		event_kind: "trace",
		severity: "info",
		name,
		message: null,
		source: "app",
		metadata: sanitizeContext(context),
	});
}

export function installTelemetry(): void {
	if (telemetryInstalled) return;
	telemetryInstalled = true;

	void hydrateTelemetryQueue();

	if (typeof ErrorUtils?.getGlobalHandler === "function") {
		const previousHandler = ErrorUtils.getGlobalHandler();
		ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
			enqueueTelemetryEvent({
				event_kind: "error",
				severity: isFatal ? "fatal" : "error",
				name: "error.unhandled_js_exception",
				message: error.message || "Unhandled JS exception",
				stack_trace: error.stack ?? null,
				source: "global_error_handler",
				metadata: {
					error: formatError(error),
					isFatal: Boolean(isFatal),
				},
			});

			previousHandler(error, isFatal);
		});
	}

	const globalScope = globalThis as typeof globalThis & {
		addEventListener?: (type: string, listener: (event: { reason?: unknown }) => void) => void;
	};

	if (typeof globalScope.addEventListener === "function") {
		globalScope.addEventListener("unhandledrejection", (event) => {
			const errorDetails = formatError(event.reason);
			enqueueTelemetryEvent({
				event_kind: "error",
				severity: "error",
				name: "error.unhandled_promise_rejection",
				message:
					typeof errorDetails.message === "string"
						? errorDetails.message
						: "Unhandled promise rejection",
				stack_trace: typeof errorDetails.stack === "string" ? errorDetails.stack : null,
				source: "global_promise_handler",
				metadata: {
					error: errorDetails,
				},
			});
		});
	}
}

export async function flushTelemetryQueue(force: boolean = false): Promise<boolean> {
	if (telemetryFlushing) return telemetryFlushing;

	telemetryFlushing = (async () => {
		await hydrateTelemetryQueue();
		if (telemetryQueue.length === 0) return false;

		const actorUserId = telemetryContext.userId;
		if (!actorUserId) return false;

		const now = Date.now();
		if (
			!force &&
			now - lastTelemetryFlushAt < TELEMETRY_FLUSH_COOLDOWN_MS &&
			telemetryQueue.length < TELEMETRY_BATCH_LIMIT
		) {
			return false;
		}

		const { supabase } = require("@/lib/supabase") as typeof import("@/lib/supabase");
		const {
			data: { session },
		} = await supabase.auth.getSession();
		if (!session) return false;

		let flushedAny = false;

		while (telemetryQueue.length > 0) {
			const batch = telemetryQueue
				.slice(0, TELEMETRY_BATCH_LIMIT)
				.map((event) => buildTelemetryInsert(event, actorUserId));

			const { error } = await supabase.from("telemetry_events").insert(batch);
			if (error) {
				safeConsoleWarn("Failed to flush telemetry events", error);
				return flushedAny;
			}

			flushedAny = true;
			lastTelemetryFlushAt = Date.now();
			telemetryQueue = telemetryQueue.slice(batch.length);
			await persistTelemetryQueue();

			if (!force && telemetryQueue.length < TELEMETRY_BATCH_LIMIT) {
				break;
			}
		}

		return flushedAny;
	})().finally(() => {
		telemetryFlushing = null;
	});

	return telemetryFlushing;
}

function emit(
	level: "log" | "warn" | "error",
	message: string,
	error?: unknown,
	context?: LogContext
) {
	const errorDetails = error ? formatError(error) : undefined;
	const payload = {
		level,
		message,
		error: errorDetails,
		context: sanitizeContext(context),
	};

	if (isDev) {
		console.log(payload);
	} else if (level !== "log") {
		console[level](payload);
	}

	if (level === "warn" || level === "error") {
		enqueueTelemetryEvent({
			event_kind: "error",
			severity: level === "warn" ? "warn" : "error",
			name: level === "warn" ? "log.warn" : "log.error",
			message,
			stack_trace: typeof errorDetails?.stack === "string" ? errorDetails.stack : null,
			source: "logger",
			metadata: {
				...(payload.context ?? {}),
				...(errorDetails ? { error: errorDetails } : {}),
			},
		});

		forwardToSentry(level, message, error, sanitizeContext(context));
	}
}

function forwardToSentry(
	level: "warn" | "error",
	message: string,
	error: unknown,
	context: TelemetryMetadata | undefined
): void {
	try {
		const sentryMod = require("@/lib/sentry") as typeof import("@/lib/sentry");
		const extra: Record<string, unknown> = {
			...(context ?? {}),
			route: telemetryContext.route ?? null,
		};
		if (error) {
			sentryMod.captureSentryException(error, { message, ...extra });
		} else {
			sentryMod.captureSentryMessage(message, level === "warn" ? "warning" : "error", extra);
		}
	} catch {
		return;
	}
}

export const logger = {
	debug(message: string, context?: LogContext) {
		emit("log", message, undefined, context);
	},
	info(message: string, context?: LogContext) {
		traceEvent(message, context);
		if (isDev) {
			console.log({
				message,
				context: sanitizeContext(context),
			});
		}
	},
	warn(message: string, error?: unknown, context?: LogContext) {
		emit("warn", message, error, context);
	},
	error(message: string, error?: unknown, context?: LogContext) {
		emit("error", message, error, context);
	},
};
