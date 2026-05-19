import { StyleSheet, Text, View } from "react-native";

type Props = {
	label: string;
	subtitle?: string;
};

export function ClusterHeader({ label, subtitle }: Props) {
	return (
		<View style={styles.root}>
			<Text style={styles.label}>{label}</Text>
			{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		paddingHorizontal: 4,
		paddingTop: 6,
		flexDirection: "row",
		alignItems: "baseline",
		gap: 8,
	},
	label: {
		color: "#f4f4f6",
		fontSize: 15,
		fontWeight: "700",
		letterSpacing: 0.1,
	},
	subtitle: {
		color: "#8e8e94",
		fontSize: 12,
		fontWeight: "500",
	},
});
