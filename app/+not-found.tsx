import { Link, Stack } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { Screen } from "@/components/ui";
import { space, theme, type } from "@/constants/theme";

export default function NotFoundScreen() {
	return (
		<>
			<Stack.Screen options={{ title: "Not found", headerShown: false }} />
			<Screen style={styles.container}>
				<Text style={styles.title}>This screen doesn't exist</Text>
				<Text style={styles.body}>
					The link may be old, or the album it pointed at has already closed.
				</Text>
				<Link href="/" style={styles.link}>
					<Text style={styles.linkText}>Back to Recapd</Text>
				</Link>
			</Screen>
		</>
	);
}

const styles = StyleSheet.create({
	container: {
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: space.xl,
		gap: space.md,
	},
	title: {
		...type.title,
		color: theme.textPrimary,
		textAlign: "center",
	},
	body: {
		...type.body,
		color: theme.textMuted,
		textAlign: "center",
		maxWidth: 300,
	},
	link: {
		marginTop: space.lg,
		paddingVertical: space.md,
	},
	linkText: {
		...type.bodyStrong,
		color: theme.accent,
	},
});
