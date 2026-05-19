import * as ImageManipulator from "expo-image-manipulator";
import * as VideoThumbnails from "expo-video-thumbnails";

const THUMB_LONG_EDGE = 1024;
const THUMB_QUALITY = 0.72;

export type ThumbResult = {
	uri: string;
	width: number;
	height: number;
	mimeType: "image/jpeg";
};

export async function generateImageThumb(sourceUri: string): Promise<ThumbResult> {
	const result = await ImageManipulator.manipulateAsync(
		sourceUri,
		[{ resize: { width: THUMB_LONG_EDGE } }],
		{
			compress: THUMB_QUALITY,
			format: ImageManipulator.SaveFormat.JPEG,
		}
	);
	return {
		uri: result.uri,
		width: result.width,
		height: result.height,
		mimeType: "image/jpeg",
	};
}

export async function generateVideoThumb(sourceUri: string): Promise<ThumbResult> {
	const { uri } = await VideoThumbnails.getThumbnailAsync(sourceUri, {
		time: 500,
		quality: 0.8,
	});
	const downsized = await ImageManipulator.manipulateAsync(
		uri,
		[{ resize: { width: THUMB_LONG_EDGE } }],
		{
			compress: THUMB_QUALITY,
			format: ImageManipulator.SaveFormat.JPEG,
		}
	);
	return {
		uri: downsized.uri,
		width: downsized.width,
		height: downsized.height,
		mimeType: "image/jpeg",
	};
}

export async function generateThumb(sourceUri: string, isVideo: boolean): Promise<ThumbResult> {
	return isVideo ? generateVideoThumb(sourceUri) : generateImageThumb(sourceUri);
}
