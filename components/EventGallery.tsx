import { useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { EmptyGallery } from "@/components/grid/EmptyGallery";
import { GalleryToolbar } from "@/components/grid/GalleryToolbar";
import { QuiltedGrid } from "@/components/grid/QuiltedGrid";
import { FullScreenViewer } from "@/components/viewer/FullScreenViewer";
import type { GalleryMediaItem, Moment } from "@/types/media";

type Props = {
	eventTitle: string;
	eventSubtitle?: string;
	items: GalleryMediaItem[];
	moments?: Moment[];
	isHost: boolean;
	joinUrl: string;
	onAddPhotos: () => void;
	onBulkDownload?: () => void;
};

export function EventGallery({
	eventTitle,
	eventSubtitle,
	items,
	moments,
	isHost,
	joinUrl,
	onAddPhotos,
	onBulkDownload,
}: Props) {
	const [openId, setOpenId] = useState<string | null>(null);

	const visibleItems = useMemo(
		() => items.filter((it) => it.status === "ready" && !it.hidden_by_host_at),
		[items]
	);
	const viewerItems = useMemo(
		() =>
			[...visibleItems].sort(
				(a, b) => new Date(a.capture_time).getTime() - new Date(b.capture_time).getTime()
			),
		[visibleItems]
	);

	const handleBulkDownload = () => {
		if (!onBulkDownload) {
			Alert.alert(
				"Coming soon",
				"Bulk download will be available once the host ZIP backend lands."
			);
			return;
		}
		onBulkDownload();
	};

	if (visibleItems.length === 0) {
		return (
			<View style={styles.root}>
				<View style={styles.toolbarRow}>
					<GalleryToolbar
						title={eventTitle}
						subtitle={eventSubtitle}
						isHost={isHost}
						itemCount={0}
						onAddPhotos={onAddPhotos}
					/>
				</View>
				<EmptyGallery joinUrl={joinUrl} onAddPhotos={onAddPhotos} />
			</View>
		);
	}

	return (
		<View style={styles.root}>
			<QuiltedGrid
				items={visibleItems}
				moments={moments}
				headerComponent={
					<View style={styles.toolbarRow}>
						<GalleryToolbar
							title={eventTitle}
							subtitle={eventSubtitle ?? `${visibleItems.length} memories`}
							isHost={isHost}
							itemCount={visibleItems.length}
							onAddPhotos={onAddPhotos}
							onBulkDownload={handleBulkDownload}
						/>
					</View>
				}
				onOpenItem={setOpenId}
			/>
			<FullScreenViewer
				visible={openId !== null}
				items={viewerItems}
				initialItemId={openId}
				onClose={() => setOpenId(null)}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: "#0b0b0d",
	},
	toolbarRow: {
		paddingTop: 12,
	},
});
