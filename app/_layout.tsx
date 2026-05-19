import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
	return (
		<GestureHandlerRootView style={{ flex: 1, backgroundColor: "#0b0b0d" }}>
			<SafeAreaProvider>
				<Stack
					screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0b0b0d" } }}
				>
					<Stack.Screen
						name="paywall"
						options={{ presentation: "modal", animation: "slide_from_bottom" }}
					/>
				</Stack>
			</SafeAreaProvider>
		</GestureHandlerRootView>
	);
}
