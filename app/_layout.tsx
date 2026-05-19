import { Stack } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthStore } from "@/store/authStore";

export default function RootLayout() {
	const hydrate = useAuthStore((s) => s.hydrate);
	const status = useAuthStore((s) => s.status);

	useEffect(() => {
		hydrate();
	}, [hydrate]);

	if (status === "loading") {
		return (
			<View
				style={{
					flex: 1,
					alignItems: "center",
					justifyContent: "center",
					backgroundColor: "#0b0b0d",
				}}
			>
				<ActivityIndicator />
			</View>
		);
	}

	return (
		<GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0b0b0d" }}>
			<SafeAreaProvider>
				<Stack
					screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0b0b0d" } }}
				>
					<Stack.Screen name="index" />
					<Stack.Screen name="auth/login" />
					<Stack.Screen name="(tabs)" />
					<Stack.Screen name="event/create" options={{ presentation: "modal" }} />
					<Stack.Screen name="event/[id]/index" />
					<Stack.Screen name="event/[id]/edit" options={{ presentation: "modal" }} />
					<Stack.Screen name="join/[code]" />
					<Stack.Screen
						name="paywall"
						options={{ presentation: "modal", animation: "slide_from_bottom" }}
					/>
				</Stack>
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
}
