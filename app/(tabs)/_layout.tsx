import { Tabs } from "expo-router";
import { Platform, StyleSheet } from "react-native";
import Icon, { type IconName } from "@/components/ui/Icon";
import { theme } from "@/constants/theme";

function TabBarIcon({ name, color }: { name: IconName; color: string }) {
	return <Icon size={22} name={name} color={color} />;
}

export default function TabLayout() {
	return (
		<Tabs
			screenOptions={{
				headerShown: false,
				tabBarActiveTintColor: theme.accent,
				tabBarInactiveTintColor: theme.textDisabled,
				tabBarStyle: styles.tabBar,
				tabBarLabelStyle: styles.tabLabel,
				tabBarItemStyle: styles.tabItem,
				sceneStyle: { backgroundColor: theme.page },
			}}
		>
			<Tabs.Screen
				name="index"
				options={{
					title: "Home",
					tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
				}}
			/>
			<Tabs.Screen
				name="events"
				options={{
					title: "Albums",
					tabBarIcon: ({ color }) => <TabBarIcon name="calendar" color={color} />,
				}}
			/>
			<Tabs.Screen
				name="settings"
				options={{
					title: "Settings",
					tabBarIcon: ({ color }) => <TabBarIcon name="settings" color={color} />,
				}}
			/>
		</Tabs>
	);
}

const styles = StyleSheet.create({
	tabBar: {
		backgroundColor: "rgba(15,15,22,0.98)",
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: theme.border,
		height: Platform.OS === "ios" ? 84 : 66,
		paddingTop: 8,
	},
	tabLabel: {
		fontSize: 10.5,
		fontWeight: "600",
		letterSpacing: 0,
	},
	tabItem: {
		paddingTop: 2,
	},
});
