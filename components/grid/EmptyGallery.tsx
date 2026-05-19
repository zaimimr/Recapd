import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

type Props = {
	joinUrl: string;
	onAddPhotos: () => void;
};

export function EmptyGallery({ joinUrl, onAddPhotos }: Props) {
	return (
		<View style={styles.root}>
			<View style={styles.illustration}>
				<Ionicons name="images-outline" size={36} color="#9c9caa" />
			</View>
			<Text style={styles.title}>No photos yet</Text>
			<Text style={styles.body}>
				Be the first to add a memory. Guests can scan this code to join and contribute.
			</Text>
			<View style={styles.qrCard}>
				<QRCode value={joinUrl} size={140} backgroundColor="#fff" color="#000" />
				<Text numberOfLines={1} style={styles.qrUrl}>
					{joinUrl}
				</Text>
			</View>
			<Pressable
				accessibilityRole="button"
				onPress={onAddPhotos}
				style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
			>
				<Ionicons name="add" size={18} color="#0b0b0d" />
				<Text style={styles.ctaLabel}>Add the first photos</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 28,
		paddingVertical: 48,
		gap: 14,
	},
	illustration: {
		width: 84,
		height: 84,
		borderRadius: 28,
		backgroundColor: "#19191e",
		alignItems: "center",
		justifyContent: "center",
	},
	title: {
		color: "#f6f6f8",
		fontSize: 20,
		fontWeight: "700",
	},
	body: {
		color: "#9c9caa",
		fontSize: 14,
		textAlign: "center",
		lineHeight: 20,
		maxWidth: 320,
	},
	qrCard: {
		marginTop: 8,
		backgroundColor: "#fff",
		padding: 14,
		borderRadius: 16,
		alignItems: "center",
		gap: 8,
		maxWidth: 220,
	},
	qrUrl: {
		color: "#525258",
		fontSize: 11,
		fontWeight: "600",
		maxWidth: 180,
	},
	cta: {
		marginTop: 12,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		backgroundColor: "#f6f6f8",
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderRadius: 999,
	},
	ctaPressed: {
		opacity: 0.85,
	},
	ctaLabel: {
		color: "#0b0b0d",
		fontSize: 15,
		fontWeight: "700",
	},
});
