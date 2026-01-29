import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { StatusBar } from "react-native";
import "react-native-reanimated";
import "react-native-url-polyfill/auto";

import { useColorScheme } from "@/components/useColorScheme";
import {
  registerForPushNotifications,
  savePushToken,
  setupNotificationHandler,
} from "@/lib/notifications";
import { useAuthStore } from "@/store/authStore";
import { useEventStore } from "@/store/eventStore";
import { useSubscriptionStore } from "@/store/subscriptionStore";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    initializeAuth();
  }, []);

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
  const user = useAuthStore((state) => state.user);
  const initializePendingUploads = useEventStore((state) => state.initializePendingUploads);
  const initializeSubscription = useSubscriptionStore((state) => state.initialize);

  useEffect(() => {
    setupNotificationHandler();
    initializePendingUploads();
  }, []);

  useEffect(() => {
    if (user?.id) {
      registerForPushNotifications().then((token) => {
        if (token && user.push_token !== token) {
          savePushToken(user.id, token);
        }
      });
      initializeSubscription(user.id);
    }
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
