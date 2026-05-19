import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ViewerImage } from "@/components/viewer/ViewerImage";
import { ZoomPanItem } from "@/components/viewer/ZoomPanItem";
import type { GalleryMediaItem } from "@/types/media";

type Props = {
	visible: boolean;
	items: GalleryMediaItem[];
	initialItemId: string | null;
	onClose: () => void;
};

const PRELOAD_RADIUS = 1;

export function FullScreenViewer({ visible, items, initialItemId, onClose }: Props) {
	const { width, height } = useWindowDimensions();
	const initialIndex = Math.max(
		0,
		items.findIndex((it) => it.id === initialItemId)
	);
	const [activeIndex, setActiveIndex] = useState(initialIndex);
	const [zoomActive, setZoomActive] = useState(false);
	const listRef = useRef<FlatList<GalleryMediaItem>>(null);

	useEffect(() => {
		if (visible) {
			setActiveIndex(initialIndex);
			setZoomActive(false);
		}
	}, [visible, initialIndex]);

	useEffect(() => {
		if (!visible) return;
		const next = items[activeIndex + 1];
		const prev = items[activeIndex - 1];
		const targets = [next, prev].filter(Boolean) as GalleryMediaItem[];
		void targets;
	}, [visible, activeIndex, items]);

	const renderItem = ({ item, index }: { item: GalleryMediaItem; index: number }) => {
		const distance = Math.abs(index - activeIndex);
		if (distance > PRELOAD_RADIUS) {
			return <View style={{ width, height }} />;
		}
		if (distance === 0) {
			return (
				<ZoomPanItem
					item={item}
					width={width}
					height={height}
					active={visible}
					onRequestDismiss={onClose}
					onZoomActiveChange={setZoomActive}
				/>
			);
		}
		return (
			<View
				style={{
					width,
					height,
					alignItems: "center",
					justifyContent: "center",
					backgroundColor: "#000",
				}}
			>
				<ViewerImage item={item} width={width} height={height} preloadOnly />
			</View>
		);
	};

	return (
		<Modal
			visible={visible}
			animationType="fade"
			onRequestClose={onClose}
			statusBarTranslucent
			transparent
		>
			<View style={styles.root}>
				<FlatList
					ref={listRef}
					data={items}
					keyExtractor={(item) => item.id}
					horizontal
					pagingEnabled
					initialScrollIndex={initialIndex}
					getItemLayout={(_data, index) => ({ length: width, offset: width * index, index })}
					showsHorizontalScrollIndicator={false}
					scrollEnabled={!zoomActive}
					onMomentumScrollEnd={(e) => {
						const next = Math.round(e.nativeEvent.contentOffset.x / width);
						if (next !== activeIndex) setActiveIndex(next);
					}}
					renderItem={renderItem}
					windowSize={3}
					initialNumToRender={1}
					maxToRenderPerBatch={1}
				/>
				<SafeAreaView pointerEvents="box-none" edges={["top"]} style={styles.topBar}>
					<Pressable onPress={onClose} hitSlop={14} style={styles.closeButton}>
						<Ionicons name="close" size={22} color="#fff" />
					</Pressable>
				</SafeAreaView>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: "#000",
	},
	topBar: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		paddingHorizontal: 12,
		paddingTop: 4,
	},
	closeButton: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: "rgba(0,0,0,0.45)",
		alignItems: "center",
		justifyContent: "center",
	},
});
