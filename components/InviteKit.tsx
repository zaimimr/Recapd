import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { Eyebrow } from "@/components/ui";
import Icon from "@/components/ui/Icon";
import { radius, space, theme, type } from "@/constants/theme";
import {
	buildKitImageUrl,
	buildKitPrintUrl,
	KIT_ERROR_MESSAGE,
	type KitFormat,
	openKitPrint,
	shareKitImage,
} from "@/lib/inviteKit";

type Tile = { format: KitFormat; label: string; aspectRatio: number };

const TILES: Tile[] = [
	{ format: "social", label: "Facebook / post", aspectRatio: 1920 / 1005 },
	{ format: "story", label: "Story", aspectRatio: 1080 / 1920 },
	{ format: "table", label: "Table cards", aspectRatio: 397 / 559 },
	{ format: "poster", label: "Poster", aspectRatio: 794 / 1123 },
];

const TILE_HEIGHT = 132;

export default function InviteKit({ code }: { code: string }) {
	const [busyFormat, setBusyFormat] = useState<KitFormat | null>(null);

	async function handlePress(format: KitFormat) {
		setBusyFormat(format);
		try {
			if (format === "social" || format === "story") {
				await shareKitImage(code, format);
			} else {
				await openKitPrint(code, format);
			}
		} catch {
			Alert.alert("Invite kit", KIT_ERROR_MESSAGE);
		} finally {
			setBusyFormat(null);
		}
	}

	async function handleCopyPrintLink(format: "table" | "poster") {
		await Clipboard.setStringAsync(buildKitPrintUrl(code, format));
	}

	return (
		<View style={styles.container}>
			<Eyebrow>Invite kit</Eyebrow>
			<ScrollView
				horizontal
				showsHorizontalScrollIndicator={false}
				contentContainerStyle={styles.row}
			>
				{TILES.map((tile) => {
					const isPrint = tile.format === "table" || tile.format === "poster";
					return (
						<View key={tile.format} style={styles.tile}>
							<Pressable
								onPress={() => handlePress(tile.format)}
								disabled={busyFormat !== null}
								accessibilityRole="button"
								accessibilityLabel={
									isPrint ? `Open ${tile.label} for printing` : `Share ${tile.label} image`
								}
								style={({ pressed }) => [pressed && { opacity: 0.7 }]}
							>
								<View style={[styles.preview, { width: TILE_HEIGHT * tile.aspectRatio }]}>
									<Image
										source={{ uri: buildKitImageUrl(code, tile.format) }}
										style={StyleSheet.absoluteFill}
										contentFit="cover"
										cachePolicy="memory-disk"
									/>
									{busyFormat === tile.format ? (
										<View style={styles.busy}>
											<ActivityIndicator color={theme.textPrimary} />
										</View>
									) : null}
								</View>
								<View style={styles.labelRow}>
									<Icon name={isPrint ? "printer" : "share"} size={14} color={theme.textMuted} />
									<Text style={styles.label}>{tile.label}</Text>
								</View>
							</Pressable>
							{isPrint ? (
								<Pressable
									onPress={() => handleCopyPrintLink(tile.format as "table" | "poster")}
									accessibilityRole="button"
									accessibilityLabel={`Copy ${tile.label} print link`}
									hitSlop={8}
								>
									<Text style={styles.copyLink}>Copy link</Text>
								</Pressable>
							) : null}
						</View>
					);
				})}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		gap: space.sm,
	},
	row: {
		gap: space.md,
	},
	tile: {
		gap: space.xs,
	},
	preview: {
		height: TILE_HEIGHT,
		borderRadius: radius.md,
		overflow: "hidden",
		backgroundColor: theme.cardElevated,
		borderWidth: 1,
		borderColor: theme.border,
	},
	busy: {
		...StyleSheet.absoluteFillObject,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(11,11,18,0.55)",
	},
	labelRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		marginTop: space.xs,
	},
	label: {
		...type.caption,
		color: theme.textPrimary,
	},
	copyLink: {
		...type.caption,
		color: theme.accent,
	},
});
