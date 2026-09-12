/*
 * DIRECTION CONTRACT — Recapd "Sunset Pop" (seed: store-screenshots-2026-09-11)
 *
 * THESIS: The album is the interface. Photos carry the screen edge to edge and the
 *   chrome gets out of the way. Refuses the light, grey, bordered form-app it was.
 * OWN-WORLD: Near-black #0B0B12 ground, #15151F cards with 1px #2A2A38 edges and
 *   20px corners, one coral→pink→violet gradient reserved for the primary action,
 *   pink eyebrows, Feather icons at a single stroke weight, white on dark type.
 * STORY: A guest arrives mid-event, sees everyone's photos already piling up,
 *   adds theirs in two taps, and leaves with the whole night in their camera roll.
 * FIRST VIEWPORT: Event screen — inline nav, album card with title, live pill,
 *   guest stack and Photos/Videos/Guests tiles, gradient "Add your photos" as the
 *   only filled control, then the masonry feed running to the tab bar.
 * FORM: Native dark product UI, Operate mode; platform affordances kept intact.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 *   finish review, the verdict, DESIGN.md, and every shipping raster carrying its
 *   provenance.
 */
import Feather from "@expo/vector-icons/Feather";
import {
	DarkTheme as DefaultNavigationTheme,
	type Theme,
	ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Image as ExpoImage } from "expo-image";
import {
	type ErrorBoundaryProps,
	ErrorBoundary as ExpoRouterErrorBoundary,
	Stack,
	usePathname,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { AppState, StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "react-native-reanimated";
import "react-native-url-polyfill/auto";

import { theme } from "@/constants/theme";
import { installBackgroundUploadTask } from "@/lib/backgroundUpload";
import {
	flushTelemetryQueue,
	installTelemetry,
	logger,
	setTelemetryContext,
	traceEvent,
	traceScreen,
} from "@/lib/logger";
import { installUploadQueueKicker } from "@/lib/networkKick";
import {
	registerForPushNotifications,
	savePushToken,
	setupNotificationHandler,
} from "@/lib/notifications";
import { configureRecapdUploader, refreshUploaderConfig } from "@/lib/recapdUploaderBridge";
import { initSentry, Sentry, setSentryUser } from "@/lib/sentry";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import { useEventStore } from "@/store/eventStore";
import { useSubscriptionStore } from "@/store/subscriptionStore";

initSentry();

export const unstable_settings = {
	initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
	const pathname = usePathname();

	useEffect(() => {
		logger.error("Route render error", error, { route: pathname });
	}, [error, pathname]);

	return <ExpoRouterErrorBoundary error={error} retry={retry} />;
}

function RootLayout() {
	const [loaded, error] = useFonts({
		...Feather.font,
	});
	const initializeAuth = useAuthStore((state) => state.initializeAuth);
	const isInitialized = useAuthStore((state) => state.isInitialized);

	useEffect(() => {
		installTelemetry();
		traceEvent("app.bootstrap.started");
	}, []);

	useEffect(() => {
		if (error) {
			logger.error("Font load failed", error);
			throw error;
		}
	}, [error]);

	useEffect(() => {
		initializeAuth();
	}, [initializeAuth]);

	useEffect(() => {
		if (loaded && isInitialized) {
			SplashScreen.hideAsync();
		}
	}, [loaded, isInitialized]);

	if (!loaded || !isInitialized) {
		return null;
	}

	return <RootLayoutNav />;
}

const navigationTheme: Theme = {
	dark: true,
	colors: {
		primary: theme.accent,
		background: theme.page,
		card: theme.page,
		text: theme.textPrimary,
		border: theme.border,
		notification: theme.accent,
	},
	fonts: DefaultNavigationTheme.fonts,
};

const stackScreenOptions = {
	headerShown: false,
	contentStyle: { backgroundColor: theme.page },
	animation: "slide_from_right",
} as const;

function RootLayoutNav() {
	const pathname = usePathname();
	const user = useAuthStore((state) => state.user);
	const initializePendingUploads = useEventStore((state) => state.initializePendingUploads);
	const initializeSubscription = useSubscriptionStore((state) => state.initialize);

	useEffect(() => {
		setupNotificationHandler();
	}, []);

	useEffect(() => {
		if (!user?.id) {
			return;
		}

		void initializePendingUploads(user.id);
	}, [initializePendingUploads, user?.id]);

	useEffect(() => {
		setTelemetryContext({ userId: user?.id ?? null });
		setSentryUser(user?.id ?? null);
		if (user?.id) {
			traceEvent("app.user_context.ready", { userId: user.id });
		}
	}, [user?.id]);

	useEffect(() => {
		traceScreen(pathname);
	}, [pathname]);

	useEffect(() => {
		if (!user?.id) return;
		registerForPushNotifications().then((token) => {
			if (token) {
				savePushToken(user.id, token);
			}
		});
		initializeSubscription(user.id);
	}, [user?.id, initializeSubscription]);

	useEffect(() => {
		if (!user?.id) return;
		let cancelled = false;

		const configureWith = async (
			session: { access_token?: string; refresh_token?: string } | null | undefined,
			source: string
		) => {
			if (cancelled) return;
			const bearer = session?.access_token;
			const refreshToken = session?.refresh_token;
			const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
			const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
			if (!bearer || !supabaseUrl || !anonKey) {
				logger.warn("Recapd uploader configure skipped (missing config)", { source });
				return;
			}
			await configureRecapdUploader({ supabaseUrl, anonKey, bearerToken: bearer, refreshToken });
			traceEvent("recapd.uploader.configured", { source });
		};

		(async () => {
			const { data: sessionData } = await supabase.auth.getSession();
			await configureWith(sessionData.session, "initial");
		})();

		const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
			if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
				void configureWith(session, event);
			}
		});

		return () => {
			cancelled = true;
			authSub.subscription.unsubscribe();
		};
	}, [user?.id]);

	useEffect(() => {
		traceEvent("app.state.changed", { state: AppState.currentState });
		const subscription = AppState.addEventListener("change", (state) => {
			traceEvent("app.state.changed", { state });
			if (state === "active") {
				void flushTelemetryQueue();
			}
			if (state === "background" || state === "inactive") {
				void flushTelemetryQueue(true);
				void refreshUploaderConfig();
			}
		});
		const memoryWarningSubscription = AppState.addEventListener(
			"memoryWarning" as Parameters<typeof AppState.addEventListener>[0],
			() => {
				traceEvent("app.memory.warning");
				void ExpoImage.clearMemoryCache();
			}
		);

		return () => {
			subscription.remove();
			memoryWarningSubscription.remove();
		};
	}, []);

	useEffect(() => {
		if (!user?.id) return;
		const processPendingUploads = useEventStore.getState().processPendingUploads;
		const teardown = installUploadQueueKicker(() => processPendingUploads());
		return teardown;
	}, [user?.id]);

	useEffect(() => {
		if (!user?.id) return;
		let uninstall: (() => Promise<void>) | null = null;
		void installBackgroundUploadTask(async () => {
			await useEventStore.getState().processPendingUploads();
		}).then((fn) => {
			uninstall = fn;
		});
		return () => {
			void uninstall?.();
		};
	}, [user?.id]);

	return (
		<SafeAreaProvider>
			<ThemeProvider value={navigationTheme}>
				<StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
				<Stack screenOptions={stackScreenOptions}>
					<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
					<Stack.Screen
						name="event/create"
						options={{ headerShown: false, presentation: "modal" }}
					/>
					<Stack.Screen name="event/join" options={{ headerShown: false, presentation: "modal" }} />
					<Stack.Screen name="event/[id]" options={{ headerShown: false }} />
					<Stack.Screen name="event/edit/[id]" options={{ headerShown: false }} />
					<Stack.Screen
						name="event/share/[id]"
						options={{ headerShown: false, presentation: "modal" }}
					/>
					<Stack.Screen
						name="contribute/[eventId]"
						options={{ headerShown: false, presentation: "modal" }}
					/>
					<Stack.Screen
						name="onboarding"
						options={{
							headerShown: false,
							presentation: "modal",
							gestureEnabled: false,
						}}
					/>
				</Stack>
			</ThemeProvider>
		</SafeAreaProvider>
	);
}

export default Sentry.wrap(RootLayout);
