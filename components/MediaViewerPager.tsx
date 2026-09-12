import {
	forwardRef,
	type ReactNode,
	useCallback,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { Dimensions, FlatList, type ViewToken } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const NEIGHBOR_RADIUS = 1;

export interface MediaViewerPagerHandle {
	scrollToIndex: (index: number, animated: boolean) => void;
}

export interface MediaPageState {
	isActive: boolean;
	isNeighbor: boolean;
}

export function getMediaPageState(index: number, activeIndex: number): MediaPageState {
	const distance = Math.abs(index - activeIndex);
	return {
		isActive: index === activeIndex,
		isNeighbor: distance <= NEIGHBOR_RADIUS,
	};
}

interface MediaViewerPagerProps<T> {
	data: T[];
	initialIndex: number;
	keyExtractor: (item: T, index: number) => string;
	onIndexChange?: (index: number) => void;
	renderPage: (item: T, index: number, state: MediaPageState) => ReactNode;
	pageStyle?: object;
}

function clampIndex(index: number, length: number): number {
	if (length <= 0) return 0;
	return Math.max(0, Math.min(index, length - 1));
}

function MediaViewerPagerInner<T>(
	{
		data,
		initialIndex,
		keyExtractor,
		onIndexChange,
		renderPage,
		pageStyle,
	}: MediaViewerPagerProps<T>,
	ref: React.Ref<MediaViewerPagerHandle>
) {
	const flatListRef = useRef<FlatList<T>>(null);
	const safeInitialIndex = clampIndex(initialIndex, data.length);
	const [activeIndex, setActiveIndex] = useState(safeInitialIndex);

	const scrollToIndex = useCallback((index: number, animated: boolean) => {
		flatListRef.current?.scrollToOffset({
			offset: SCREEN_WIDTH * index,
			animated,
		});
	}, []);

	useImperativeHandle(ref, () => ({ scrollToIndex }), [scrollToIndex]);

	const onIndexChangeRef = useRef(onIndexChange);
	onIndexChangeRef.current = onIndexChange;

	const handleViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
		const first = viewableItems[0];
		if (first && first.index !== null && first.index !== undefined) {
			setActiveIndex(first.index);
			onIndexChangeRef.current?.(first.index);
		}
	}).current;

	const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

	const getItemLayout = useCallback(
		(_: ArrayLike<T> | null | undefined, index: number) => ({
			length: SCREEN_WIDTH,
			offset: SCREEN_WIDTH * index,
			index,
		}),
		[]
	);

	const renderItem = useCallback(
		({ item, index }: { item: T; index: number }) => (
			<>{renderPage(item, index, getMediaPageState(index, activeIndex))}</>
		),
		[activeIndex, renderPage]
	);

	const handleScrollToIndexFailed = useCallback(
		({ index }: { index: number }) => {
			requestAnimationFrame(() => scrollToIndex(index, false));
		},
		[scrollToIndex]
	);

	const windowSize = useMemo(() => NEIGHBOR_RADIUS * 2 + 3, []);

	return (
		<FlatList
			ref={flatListRef}
			data={data}
			horizontal
			pagingEnabled
			showsHorizontalScrollIndicator={false}
			keyExtractor={keyExtractor}
			initialScrollIndex={safeInitialIndex}
			getItemLayout={getItemLayout}
			onViewableItemsChanged={handleViewableItemsChanged}
			viewabilityConfig={viewabilityConfig}
			onScrollToIndexFailed={handleScrollToIndexFailed}
			windowSize={windowSize}
			maxToRenderPerBatch={windowSize}
			renderItem={renderItem}
			style={pageStyle}
		/>
	);
}

const MediaViewerPager = forwardRef(MediaViewerPagerInner) as <T>(
	props: MediaViewerPagerProps<T> & { ref?: React.Ref<MediaViewerPagerHandle> }
) => ReactNode;

export default MediaViewerPager;
