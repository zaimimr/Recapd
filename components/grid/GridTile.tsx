import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getThumbUrl, skeletonColor } from "@/lib/thumbnails";
import type { GalleryMediaItem } from "@/types/media";

type Props = {
	item: GalleryMediaItem;
	width: number;
	height: number;
	onPress: () => void;
};

function formatDuration(ms: number | null | undefined) {
	if (!ms || ms <= 0) return null;
	const total = Math.round(ms / 1000);
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
}

export function GridTile({ item, width, height, onPress }: Props) {
	const [url, setUrl] = useState<string | null>(null);
	const skeleton = skeletonColor(item);

	useEffect(() => {
		let cancelled = false;
		getThumbUrl(item).then((next) => {
			if (!cancelled) setUrl(next);
		});
		return () => {
			cancelled = true;
		};
	}, [item]);

	const durationLabel = item.is_video ? formatDuration(item.duration_ms) : null;

	return (
		<Pressable
			accessibilityRole="imagebutton"
			accessibilityLabel={item.is_video ? "Open video" : "Open photo"}
			onPress={onPress}
			style={[styles.root, { width, height, backgroundColor: skeleton }]}
		>
			{url ? (
				<Image
					source={{ uri: url }}
					style={StyleSheet.absoluteFill}
					contentFit="cover"
					cachePolicy="memory-disk"
					transition={140}
					recyclingKey={item.id}
				/>
			) : null}
			{item.is_video ? (
				<View style={styles.videoBadge} pointerEvents="none">
					<Ionicons name="play" size={11} color="#fff" />
					{durationLabel ? <Text style={styles.duration}>{durationLabel}</Text> : null}
				</View>
			) : null}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	root: {
		overflow: "hidden",
		borderRadius: 6,
	},
	videoBadge: {
		position: "absolute",
		bottom: 6,
		left: 6,
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
		paddingHorizontal: 6,
		paddingVertical: 3,
		borderRadius: 999,
		backgroundColor: "rgba(0,0,0,0.55)",
	},
	duration: {
		color: "#fff",
		fontSize: 11,
		fontWeight: "600",
	},
});
