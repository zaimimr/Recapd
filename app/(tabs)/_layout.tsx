import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { theme } from "@/constants/theme";

export default function TabsLayout() {
	return (
		<Tabs
			screenOptions={{
				headerShown: false,
				tabBarStyle: { backgroundColor: theme.bg, borderTopColor: theme.border },
				tabBarActiveTintColor: theme.accentSoft,
				tabBarInactiveTintColor: theme.textSubtle,
			}}
		>
			<Tabs.Screen
				name="events"
				options={{
					title: "Events",
					tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
				}}
			/>
			<Tabs.Screen
				name="settings"
				options={{
					title: "Settings",
					tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
				}}
			/>
		</Tabs>
	);
}
