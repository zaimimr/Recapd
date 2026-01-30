import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs, useRouter } from "expo-router";
import type React from "react";
import { TouchableOpacity } from "react-native";
import { useClientOnlyValue } from "@/components/useClientOnlyValue";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";

function TabBarIcon(props: {
	name: React.ComponentProps<typeof FontAwesome>["name"];
	color: string;
}) {
	return <FontAwesome size={24} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
	const colorScheme = useColorScheme();
	const router = useRouter();

	return (
		<Tabs
			screenOptions={{
				tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
				headerShown: useClientOnlyValue(false, true),
			}}
		>
			<Tabs.Screen
				name="index"
				options={{
					title: "Home",
					headerShown: false,
					tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
				}}
			/>
			<Tabs.Screen
				name="events"
				options={{
					title: "My Events",
					tabBarIcon: ({ color }) => <TabBarIcon name="calendar" color={color} />,
					headerRight: () => (
						<TouchableOpacity
							onPress={() => router.push("/event/create")}
							style={{ marginRight: 16 }}
							hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
						>
							<FontAwesome name="plus" size={22} color={Colors[colorScheme ?? "light"].tint} />
						</TouchableOpacity>
					),
				}}
			/>
			<Tabs.Screen
				name="settings"
				options={{
					title: "Settings",
					tabBarIcon: ({ color }) => <TabBarIcon name="cog" color={color} />,
				}}
			/>
		</Tabs>
	);
}
