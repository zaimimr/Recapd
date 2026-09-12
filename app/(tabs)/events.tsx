import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import AlbumCard from "@/components/AlbumCard";
import { Button, EmptyState, Field, Screen, SectionHeader } from "@/components/ui";
import { CONTENT_MAX_WIDTH, space, theme, type } from "@/constants/theme";
import { useAuthStore } from "@/store/authStore";
import { useEventStore } from "@/store/eventStore";

export default function EventsScreen() {
	const router = useRouter();
	const user = useAuthStore((state) => state.user);
	const createUser = useAuthStore((state) => state.createUser);
	const { events, isLoading, fetchUserEvents, subscribeToUserEvents } = useEventStore();
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [displayName, setDisplayName] = useState("");
	const [isCreating, setIsCreating] = useState(false);

	async function handleCreateProfile() {
		const trimmedName = displayName.trim();
		if (trimmedName.length < 2) return;
		setIsCreating(true);
		await createUser(trimmedName);
		setIsCreating(false);
	}

	const loadEvents = useCallback(() => {
		if (user?.id) {
			fetchUserEvents(user.id);
		}
	}, [user?.id, fetchUserEvents]);

	const handleRefresh = useCallback(async () => {
		setIsRefreshing(true);
		await loadEvents();
		setIsRefreshing(false);
	}, [loadEvents]);

	useEffect(() => {
		loadEvents();
	}, [loadEvents]);

	useEffect(() => {
		if (user?.id) {
			const unsubscribe = subscribeToUserEvents(user.id);
			return unsubscribe;
		}
	}, [user?.id, subscribeToUserEvents]);

	if (!user) {
		return (
			<Screen>
				<View style={styles.welcome}>
					<SectionHeader eyebrow="Profile" title="What should we call you?" />
					<Text style={styles.welcomeBody}>
						Your name shows up on the photos you add. Nothing else is stored.
					</Text>
					<Field
						placeholder="Your first name"
						value={displayName}
						onChangeText={setDisplayName}
						autoCapitalize="words"
						autoCorrect={false}
						maxLength={30}
						returnKeyType="done"
						onSubmitEditing={handleCreateProfile}
						containerStyle={styles.welcomeField}
					/>
					<Button
						label="Continue"
						onPress={handleCreateProfile}
						loading={isCreating}
						disabled={displayName.trim().length < 2}
					/>
				</View>
			</Screen>
		);
	}

	return (
		<Screen>
			<FlatList
				data={events}
				keyExtractor={(item) => item.id}
				renderItem={({ item }) => (
					<AlbumCard event={item} onPress={() => router.push(`/event/${item.id}`)} />
				)}
				contentContainerStyle={[styles.list, events.length === 0 && styles.listEmpty]}
				refreshControl={
					<RefreshControl
						refreshing={isRefreshing}
						onRefresh={handleRefresh}
						tintColor={theme.accent}
						colors={[theme.accent]}
					/>
				}
				showsVerticalScrollIndicator={false}
				ListHeaderComponent={
					<SectionHeader eyebrow="Your albums" title="Every night, kept" style={styles.header} />
				}
				ListEmptyComponent={
					isLoading ? (
						<ActivityIndicator size="large" color={theme.accent} style={styles.loader} />
					) : (
						<EmptyState
							icon="calendar"
							title="No albums yet"
							body="Start one for tonight, or join someone else's with their code."
						/>
					)
				}
			/>

			<View style={styles.actions}>
				<Button
					label="New album"
					icon="plus"
					onPress={() => router.push("/event/create")}
					style={styles.action}
				/>
				<Button
					label="Join"
					icon="search"
					variant="secondary"
					onPress={() => router.push("/event/join")}
					style={styles.action}
				/>
			</View>
		</Screen>
	);
}

const styles = StyleSheet.create({
	list: {
		paddingHorizontal: space.lg,
		paddingBottom: space.md,
		gap: space.md,
		width: "100%",
		maxWidth: CONTENT_MAX_WIDTH,
		alignSelf: "center",
	},
	listEmpty: {
		flexGrow: 1,
	},
	header: {
		paddingTop: space.sm,
		paddingBottom: space.lg,
	},
	loader: {
		marginTop: space.huge,
	},
	actions: {
		flexDirection: "row",
		gap: space.md,
		width: "100%",
		maxWidth: CONTENT_MAX_WIDTH,
		alignSelf: "center",
		paddingHorizontal: space.lg,
		paddingTop: space.md,
		paddingBottom: space.lg,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: theme.border,
		backgroundColor: theme.page,
	},
	action: {
		flex: 1,
	},
	welcome: {
		flex: 1,
		justifyContent: "center",
		paddingHorizontal: space.xl,
		gap: space.lg,
		width: "100%",
		maxWidth: CONTENT_MAX_WIDTH,
		alignSelf: "center",
	},
	welcomeBody: {
		...type.body,
		color: theme.textMuted,
	},
	welcomeField: {
		marginTop: space.xs,
	},
});
