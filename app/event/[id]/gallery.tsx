import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EventGallery } from "@/components/EventGallery";
import { useEventGalleryData } from "@/lib/useEventGalleryData";

export default function EventGalleryScreen() {
	const params = useLocalSearchParams<{ id: string }>();
	const router = useRouter();
	const eventId = typeof params.id === "string" ? params.id : null;
	const { items, moments, loading, error } = useEventGalleryData(eventId);

	if (loading) {
		return (
			<SafeAreaView style={styles.center}>
				<ActivityIndicator color="#fff" />
			</SafeAreaView>
		);
	}

	if (error) {
		return (
			<SafeAreaView style={styles.center}>
				<Text style={styles.errorText}>{error}</Text>
			</SafeAreaView>
		);
	}

	const joinUrl = eventId ? `https://recapd.app/join/${eventId}` : "";

	return (
		<SafeAreaView edges={["top"]} style={styles.root}>
			<EventGallery
				eventTitle="Event"
				items={items}
				moments={moments}
				isHost={false}
				joinUrl={joinUrl}
				onAddPhotos={() => {
					if (!eventId) return;
					router.push({ pathname: "/contribute/[eventId]", params: { eventId } });
				}}
			/>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: "#0b0b0d",
	},
	center: {
		flex: 1,
		backgroundColor: "#0b0b0d",
		alignItems: "center",
		justifyContent: "center",
	},
	errorText: {
		color: "#ff7676",
		fontSize: 14,
	},
});
