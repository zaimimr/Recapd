import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useEntitlement } from "@/lib/entitlement";
import { UpgradePrompt } from "./UpgradePrompt";

const PRESET_COLORS = ["#111111", "#7c3aed", "#2563eb", "#059669", "#dc2626", "#f59e0b", "#ec4899"];

export type BrandingValue = {
	titleColor: string;
	bannerUri: string | null;
	coverUri: string | null;
};

type Props = {
	eventId: string;
	value: BrandingValue;
	onChange: (next: BrandingValue) => void;
};

export function BrandingSettings({ eventId, value, onChange }: Props) {
	const entitlement = useEntitlement(eventId);
	const [promptVisible, setPromptVisible] = useState(false);
	const locked = !entitlement.allowsCustomBranding;

	const guard = (fn: () => void) => () => {
		if (locked) {
			setPromptVisible(true);
			return;
		}
		fn();
	};

	const pick = async (key: "bannerUri" | "coverUri") => {
		const res = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ImagePicker.MediaTypeOptions.Images,
			allowsEditing: true,
			quality: 0.9,
		});
		if (!res.canceled && res.assets[0]) {
			onChange({ ...value, [key]: res.assets[0].uri });
		}
	};

	return (
		<View style={styles.section}>
			<View style={styles.header}>
				<Text style={styles.heading}>Custom branding</Text>
				{locked ? (
					<View style={styles.lockChip}>
						<Ionicons name="lock-closed" size={11} color="#fff" />
						<Text style={styles.lockChipText}>Pro</Text>
					</View>
				) : null}
			</View>
			<Text style={styles.subtitle}>
				Set your event's cover photo, banner image, and title color.
			</Text>

			<Text style={styles.label}>Title color</Text>
			<View style={styles.colorRow}>
				{PRESET_COLORS.map((color) => {
					const active = value.titleColor === color;
					return (
						<Pressable
							key={color}
							onPress={guard(() => onChange({ ...value, titleColor: color }))}
							style={[
								styles.swatch,
								{ backgroundColor: color },
								active && styles.swatchActive,
								locked && styles.swatchLocked,
							]}
						/>
					);
				})}
			</View>

			<Text style={styles.label}>Cover photo</Text>
			<Pressable
				style={[styles.mediaSlot, styles.mediaSlotCover, locked && styles.lockedSlot]}
				onPress={guard(() => pick("coverUri"))}
			>
				{value.coverUri ? (
					<Image source={{ uri: value.coverUri }} style={styles.preview} />
				) : (
					<View style={styles.placeholder}>
						<Ionicons name="image-outline" size={28} color="#9ca3af" />
						<Text style={styles.placeholderText}>Add cover photo</Text>
					</View>
				)}
			</Pressable>

			<Text style={styles.label}>Banner image</Text>
			<Pressable
				style={[styles.mediaSlot, styles.mediaSlotBanner, locked && styles.lockedSlot]}
				onPress={guard(() => pick("bannerUri"))}
			>
				{value.bannerUri ? (
					<Image source={{ uri: value.bannerUri }} style={styles.preview} />
				) : (
					<View style={styles.placeholder}>
						<Ionicons name="image-outline" size={24} color="#9ca3af" />
						<Text style={styles.placeholderText}>Add banner</Text>
					</View>
				)}
			</Pressable>

			<UpgradePrompt
				visible={promptVisible}
				reason="custom_branding"
				eventId={eventId}
				onClose={() => setPromptVisible(false)}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	section: {
		gap: 10,
		paddingVertical: 16,
		paddingHorizontal: 16,
		backgroundColor: "#fff",
		borderRadius: 16,
	},
	header: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	heading: {
		fontSize: 16,
		fontWeight: "700",
		color: "#111827",
	},
	subtitle: {
		fontSize: 13,
		color: "#6b7280",
		marginBottom: 6,
	},
	label: {
		fontSize: 13,
		fontWeight: "600",
		color: "#374151",
		marginTop: 8,
	},
	colorRow: {
		flexDirection: "row",
		gap: 10,
		flexWrap: "wrap",
	},
	swatch: {
		width: 28,
		height: 28,
		borderRadius: 999,
		borderWidth: 2,
		borderColor: "transparent",
	},
	swatchActive: {
		borderColor: "#111827",
	},
	swatchLocked: {
		opacity: 0.5,
	},
	mediaSlot: {
		backgroundColor: "#f3f4f6",
		borderRadius: 12,
		overflow: "hidden",
		justifyContent: "center",
		alignItems: "center",
	},
	mediaSlotCover: {
		aspectRatio: 4 / 3,
	},
	mediaSlotBanner: {
		aspectRatio: 16 / 5,
	},
	preview: {
		width: "100%",
		height: "100%",
	},
	placeholder: {
		alignItems: "center",
		gap: 6,
	},
	placeholderText: {
		fontSize: 13,
		color: "#9ca3af",
		fontWeight: "500",
	},
	lockedSlot: {
		opacity: 0.6,
	},
	lockChip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		backgroundColor: "#7c3aed",
		borderRadius: 999,
		paddingVertical: 3,
		paddingHorizontal: 8,
	},
	lockChipText: {
		color: "#fff",
		fontSize: 11,
		fontWeight: "700",
	},
});
