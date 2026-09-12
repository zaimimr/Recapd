import { StyleSheet, Text, View } from "react-native";
import { theme } from "@/constants/theme";
import { getAvatarColor } from "@/lib/colors";

function initial(name: string) {
	return (name?.trim()?.[0] ?? "?").toUpperCase();
}

export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
	return (
		<View
			style={[
				styles.avatar,
				{
					width: size,
					height: size,
					borderRadius: size / 2,
					backgroundColor: getAvatarColor(name || "?"),
				},
			]}
		>
			<Text style={[styles.initial, { fontSize: Math.round(size * 0.42) }]}>{initial(name)}</Text>
		</View>
	);
}

export function AvatarStack({
	names,
	size = 26,
	max = 5,
}: {
	names: string[];
	size?: number;
	max?: number;
}) {
	const shown = names.slice(0, max);
	const overflow = names.length - shown.length;

	return (
		<View style={styles.stack}>
			{shown.map((name, index) => (
				<View
					key={`${name}-${index}`}
					style={{ marginLeft: index === 0 ? 0 : -size * 0.32, borderRadius: size / 2 }}
				>
					<View style={styles.ring}>
						<Avatar name={name} size={size} />
					</View>
				</View>
			))}
			{overflow > 0 ? (
				<View
					style={[
						styles.avatar,
						styles.overflow,
						{
							width: size,
							height: size,
							borderRadius: size / 2,
							marginLeft: -size * 0.32,
						},
					]}
				>
					<Text style={[styles.initial, { fontSize: Math.round(size * 0.36) }]}>+{overflow}</Text>
				</View>
			) : null}
		</View>
	);
}

const styles = StyleSheet.create({
	avatar: {
		alignItems: "center",
		justifyContent: "center",
	},
	initial: {
		color: "#FFFFFF",
		fontWeight: "800",
	},
	stack: {
		flexDirection: "row",
		alignItems: "center",
	},
	ring: {
		borderWidth: 1.5,
		borderColor: theme.page,
		borderRadius: 999,
	},
	overflow: {
		backgroundColor: theme.cardElevated,
		borderWidth: 1.5,
		borderColor: theme.page,
	},
});
