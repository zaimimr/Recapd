import { Image } from "expo-image";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ScannedAsset } from "@/lib/upload/types";

type Props = {
	assets: ScannedAsset[];
	selectedIds: Set<string>;
	onToggle: (assetId: string) => void;
};

const TILE = 84;

export function PreSelectStrip({ assets, selectedIds, onToggle }: Props) {
	const rows = useMemo(() => assets, [assets]);

	if (rows.length === 0) {
		return (
			<View style={styles.empty}>
				<Text style={styles.emptyText}>No photos found in this event window yet.</Text>
			</View>
		);
	}

	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={styles.strip}
		>
			{rows.map((asset) => {
				const selected = selectedIds.has(asset.assetId);
				return (
					<Pressable
						key={asset.assetId}
						onPress={() => onToggle(asset.assetId)}
						style={[styles.tile, selected && styles.tileSelected, !asset.inWindow && styles.tileOutside]}
					>
						<Image
							source={{ uri: asset.uri }}
							style={styles.image}
							contentFit="cover"
							transition={120}
						/>
						{asset.isVideo ? <View style={styles.videoBadge}><Text style={styles.videoBadgeText}>VIDEO</Text></View> : null}
						{!asset.inWindow ? <View style={styles.outsideBadge}><Text style={styles.outsideText}>OUT</Text></View> : null}
						{selected ? (
							<View style={styles.checkBubble}>
								<Text style={styles.checkText}>✓</Text>
							</View>
						) : (
							<View style={styles.dimOverlay} />
						)}
					</Pressable>
				);
			})}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	strip: {
		paddingHorizontal: 16,
		paddingVertical: 12,
		gap: 8,
	},
	tile: {
		width: TILE,
		height: TILE,
		borderRadius: 12,
		overflow: "hidden",
		borderWidth: 2,
		borderColor: "transparent",
		backgroundColor: "#111",
	},
	tileSelected: {
		borderColor: "#fff",
	},
	tileOutside: {
		opacity: 0.85,
	},
	image: {
		width: "100%",
		height: "100%",
	},
	dimOverlay: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(0,0,0,0.35)",
	},
	checkBubble: {
		position: "absolute",
		top: 6,
		right: 6,
		width: 22,
		height: 22,
		borderRadius: 11,
		backgroundColor: "#fff",
		alignItems: "center",
		justifyContent: "center",
	},
	checkText: {
		color: "#000",
		fontWeight: "700",
		fontSize: 14,
	},
	videoBadge: {
		position: "absolute",
		bottom: 6,
		left: 6,
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
		backgroundColor: "rgba(0,0,0,0.65)",
	},
	videoBadgeText: {
		color: "#fff",
		fontSize: 9,
		fontWeight: "700",
		letterSpacing: 0.5,
	},
	outsideBadge: {
		position: "absolute",
		top: 6,
		left: 6,
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
		backgroundColor: "rgba(255,193,7,0.92)",
	},
	outsideText: {
		color: "#000",
		fontSize: 9,
		fontWeight: "700",
		letterSpacing: 0.5,
	},
	empty: {
		paddingHorizontal: 24,
		paddingVertical: 32,
	},
	emptyText: {
		color: "#999",
		textAlign: "center",
	},
});
