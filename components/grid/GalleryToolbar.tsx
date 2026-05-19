import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
	title: string;
	subtitle?: string;
	isHost: boolean;
	itemCount: number;
	onBulkDownload?: () => void;
	onAddPhotos: () => void;
};

export function GalleryToolbar({
	title,
	subtitle,
	isHost,
	itemCount,
	onBulkDownload,
	onAddPhotos,
}: Props) {
	return (
		<View style={styles.root}>
			<View style={styles.titleBlock}>
				<Text numberOfLines={1} style={styles.title}>
					{title}
				</Text>
				{subtitle ? (
					<Text numberOfLines={1} style={styles.subtitle}>
						{subtitle}
					</Text>
				) : null}
			</View>
			<View style={styles.actions}>
				{isHost ? (
					<Pressable
						accessibilityRole="button"
						accessibilityLabel="Download all media"
						onPress={onBulkDownload}
						disabled={itemCount === 0}
						style={({ pressed }) => [
							styles.iconButton,
							pressed && styles.pressed,
							itemCount === 0 && styles.disabled,
						]}
					>
						<Ionicons name="download-outline" size={18} color="#f6f6f8" />
					</Pressable>
				) : null}
				<Pressable
					accessibilityRole="button"
					accessibilityLabel="Add photos"
					onPress={onAddPhotos}
					style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
				>
					<Ionicons name="add" size={18} color="#0b0b0d" />
					<Text style={styles.primaryLabel}>Add</Text>
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 4,
		paddingBottom: 12,
		gap: 12,
	},
	titleBlock: {
		flex: 1,
		minWidth: 0,
	},
	title: {
		color: "#f6f6f8",
		fontSize: 20,
		fontWeight: "700",
	},
	subtitle: {
		color: "#9c9caa",
		fontSize: 12,
		marginTop: 2,
	},
	actions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	iconButton: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: "#19191e",
		alignItems: "center",
		justifyContent: "center",
	},
	primary: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		backgroundColor: "#f6f6f8",
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 999,
	},
	primaryLabel: {
		color: "#0b0b0d",
		fontSize: 14,
		fontWeight: "700",
	},
	pressed: {
		opacity: 0.85,
	},
	disabled: {
		opacity: 0.4,
	},
});
