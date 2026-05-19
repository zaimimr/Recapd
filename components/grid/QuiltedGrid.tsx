import { useCallback, useMemo, useRef, useState } from "react";
import {
	Animated,
	type NativeScrollEvent,
	type NativeSyntheticEvent,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { GridTile } from "@/components/grid/GridTile";
import { ClusterHeader } from "@/components/grid/MomentHeader";
import { buildQuiltedLayout, type DayCluster } from "@/components/grid/quiltedLayout";
import { StickyDatePill } from "@/components/grid/StickyDatePill";
import type { GalleryMediaItem, Moment } from "@/types/media";

type Props = {
	items: GalleryMediaItem[];
	moments?: Moment[];
	horizontalPadding?: number;
	gap?: number;
	headerComponent?: React.ReactElement;
	footerComponent?: React.ReactElement;
	onOpenItem: (itemId: string) => void;
};

const COLUMN_OPTIONS = [2, 3, 4] as const;
const DEFAULT_COLUMN_INDEX = 1;

function formatMomentLabel(moment: Moment) {
	const d = new Date(moment.starts_at);
	const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
	return { title: moment.title, time };
}

export function QuiltedGrid({
	items,
	moments,
	horizontalPadding = 12,
	gap = 3,
	headerComponent,
	footerComponent,
	onOpenItem,
}: Props) {
	const { width: screenWidth } = useWindowDimensions();
	const [columnIndex, setColumnIndex] = useState(DEFAULT_COLUMN_INDEX);
	const columns = COLUMN_OPTIONS[columnIndex];
	const containerWidth = screenWidth - horizontalPadding * 2;

	const layout = useMemo(
		() => buildQuiltedLayout(items, containerWidth, columns, gap),
		[items, containerWidth, columns, gap]
	);
	const visibleDayKey = useRef<string | null>(layout.clusters[0]?.dayKey ?? null);
	const [activeLabel, setActiveLabel] = useState<string | null>(layout.clusters[0]?.label ?? null);
	const [pillVisible, setPillVisible] = useState(false);

	const momentsByDay = useMemo(() => {
		const map = new Map<string, Moment[]>();
		if (!moments) return map;
		for (const m of moments) {
			const d = new Date(m.starts_at);
			const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
			const list = map.get(key) ?? [];
			list.push(m);
			map.set(key, list);
		}
		for (const list of map.values())
			list.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
		return map;
	}, [moments]);

	const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const onScroll = useCallback(
		(event: NativeSyntheticEvent<NativeScrollEvent>) => {
			const y = event.nativeEvent.contentOffset.y;
			if (!pillVisible) setPillVisible(true);
			if (hideTimer.current) clearTimeout(hideTimer.current);
			hideTimer.current = setTimeout(() => setPillVisible(false), 1100);
			let activeCluster: DayCluster | undefined;
			for (const cluster of layout.clusters) {
				if (cluster.headerY <= y + 60) activeCluster = cluster;
				else break;
			}
			if (activeCluster && activeCluster.dayKey !== visibleDayKey.current) {
				visibleDayKey.current = activeCluster.dayKey;
				setActiveLabel(activeCluster.label);
			}
		},
		[layout.clusters, pillVisible]
	);

	const pinch = Gesture.Pinch().onEnd((event) => {
		const scale = event.scale;
		const SHRINK_THRESHOLD = 0.78;
		const GROW_THRESHOLD = 1.22;
		if (scale < SHRINK_THRESHOLD) {
			runOnJS(setColumnIndex)(Math.min(columnIndex + 1, COLUMN_OPTIONS.length - 1));
		} else if (scale > GROW_THRESHOLD) {
			runOnJS(setColumnIndex)(Math.max(columnIndex - 1, 0));
		}
	});

	return (
		<View style={styles.root}>
			<GestureDetector gesture={pinch}>
				<Animated.ScrollView
					contentContainerStyle={[styles.scrollContent, { paddingHorizontal: horizontalPadding }]}
					onScroll={onScroll}
					scrollEventThrottle={16}
					showsVerticalScrollIndicator={false}
				>
					{headerComponent}
					<View style={{ width: containerWidth, height: layout.contentHeight }}>
						{layout.clusters.map((cluster) => {
							const dayMoments = momentsByDay.get(cluster.dayKey) ?? [];
							return (
								<View key={cluster.dayKey}>
									<View
										style={{
											position: "absolute",
											left: 0,
											right: 0,
											top: cluster.headerY,
											height: 32,
										}}
									>
										<ClusterHeader label={cluster.label} />
									</View>
									{dayMoments.length > 0 ? (
										<View
											style={{ position: "absolute", left: 0, right: 0, top: cluster.headerY + 18 }}
										>
											{dayMoments.map((m) => {
												const labels = formatMomentLabel(m);
												return (
													<Text key={m.id} style={styles.momentLine}>
														{labels.title}
														<Text style={styles.momentTime}> · {labels.time}</Text>
													</Text>
												);
											})}
										</View>
									) : null}
									{cluster.tiles.map((tile) => (
										<View
											key={tile.item.id}
											style={{
												position: "absolute",
												left: tile.x,
												top: tile.y,
												width: tile.width,
												height: tile.height,
											}}
										>
											<GridTile
												item={tile.item}
												width={tile.width}
												height={tile.height}
												onPress={() => onOpenItem(tile.item.id)}
											/>
										</View>
									))}
								</View>
							);
						})}
					</View>
					{footerComponent}
				</Animated.ScrollView>
			</GestureDetector>
			<StickyDatePill label={activeLabel} visible={pillVisible} />
		</View>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: "#0b0b0d",
	},
	scrollContent: {
		paddingTop: 12,
		paddingBottom: 64,
	},
	momentLine: {
		color: "#b6b6bd",
		fontSize: 12,
		fontWeight: "500",
	},
	momentTime: {
		color: "#7a7a82",
		fontWeight: "400",
	},
});
