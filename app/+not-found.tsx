import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useColorScheme } from "@/components/useColorScheme";

export default function NotFoundScreen() {
	const colorScheme = useColorScheme();
	const isDark = colorScheme === "dark";

	return (
		<>
			<Stack.Screen options={{ title: "Oops!" }} />
			<View style={[styles.container, isDark && styles.containerDark]}>
				<Text style={[styles.title, isDark && styles.textDark]}>This screen doesn't exist.</Text>

				<Link href="/" style={styles.link}>
					<Text style={[styles.linkText]}>Go to home screen!</Text>
				</Link>
			</View>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		padding: 20,
		backgroundColor: "#fff",
	},
	containerDark: {
		backgroundColor: "#000",
	},
	title: {
		fontSize: 20,
		fontWeight: "bold",
		color: "#000",
	},
	textDark: {
		color: "#fff",
	},
	link: {
		marginTop: 15,
		paddingVertical: 15,
	},
	linkText: {
		fontSize: 14,
		color: "#2e78b7",
	},
});
