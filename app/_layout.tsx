import FontAwesome from "@expo/vector-icons/FontAwesome";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
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
import "react-native-reanimated";
import "react-native-url-polyfill/auto";

import { useColorScheme } from "@/components/useColorScheme";
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
import { configureRecapdUploader } from "@/lib/recapdUploaderBridge";
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
		SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
		...FontAwesome.font,
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

function RootLayoutNav() {
	const colorScheme = useColorScheme();
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

		const configureWith = async (bearer: string | undefined, source: string) => {
			if (cancelled) return;
			const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
			const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
			if (!bearer || !supabaseUrl || !anonKey) {
				logger.warn("Recapd uploader configure skipped (missing config)", { source });
				return;
			}
			await configureRecapdUploader({ supabaseUrl, anonKey, bearerToken: bearer });
			traceEvent("recapd.uploader.configured", { source });
		};

		(async () => {
			const { data: sessionData } = await supabase.auth.getSession();
			await configureWith(sessionData.session?.access_token, "initial");
		})();

		const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
			if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
				void configureWith(session?.access_token, event);
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
		<ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
			<StatusBar hidden />
			<Stack>
				<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
				<Stack.Screen
					name="event/create"
					options={{
						title: "Create Event",
						presentation: "modal",
					}}
				/>
				<Stack.Screen
					name="event/join"
					options={{
						title: "Join Event",
						presentation: "modal",
					}}
				/>
				<Stack.Screen
					name="event/[id]"
					options={{
						title: "Event",
						headerBackTitle: "Back",
					}}
				/>
				<Stack.Screen
					name="event/share/[id]"
					options={{
						title: "Share Event",
						presentation: "modal",
					}}
				/>
				<Stack.Screen
					name="contribute/[eventId]"
					options={{
						title: "Add Photos",
						presentation: "modal",
					}}
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
	);
}

export default Sentry.wrap(RootLayout);
