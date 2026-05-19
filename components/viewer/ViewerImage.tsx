import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { getOriginalUrl, getThumbUrl } from "@/lib/thumbnails";
import type { GalleryMediaItem } from "@/types/media";

type Props = {
	item: GalleryMediaItem;
	width: number;
	height: number;
	preloadOnly?: boolean;
};

export function ViewerImage({ item, width, height, preloadOnly }: Props) {
	const [thumbUrl, setThumbUrl] = useState<string | null>(null);
	const [originalUrl, setOriginalUrl] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		getThumbUrl(item).then((next) => {
			if (!cancelled) setThumbUrl(next);
		});
		getOriginalUrl(item).then((next) => {
			if (!cancelled) setOriginalUrl(next);
		});
		return () => {
			cancelled = true;
		};
	}, [item]);

	if (preloadOnly) {
		if (originalUrl) Image.prefetch([originalUrl], "memory-disk");
		return null;
	}

	return (
		<Image
			source={originalUrl ? { uri: originalUrl } : thumbUrl ? { uri: thumbUrl } : undefined}
			placeholder={thumbUrl ? { uri: thumbUrl } : undefined}
			placeholderContentFit="contain"
			style={[styles.image, { width, height }]}
			contentFit="contain"
			cachePolicy="memory-disk"
			transition={120}
		/>
	);
}

const styles = StyleSheet.create({
	image: {
		backgroundColor: "#000",
	},
});
