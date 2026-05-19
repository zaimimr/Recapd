import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Pressable,
	SafeAreaView,
	StyleSheet,
	Text,
	View,
} from "react-native";
import { PreSelectStrip } from "@/components/PreSelectStrip";
import { UploadSheet } from "@/components/UploadSheet";
import { ensureMediaPermission, scanAssetsForWindow } from "@/lib/mediaLibrary";
import { supabase } from "@/lib/supabase";
import type { EventWindow, ScannedAsset } from "@/lib/upload/types";
import { useUploadQueue } from "@/store/uploadQueue";

type EventRow = {
	id: string;
	starts_at: string;
	ends_at: string;
	allow_outside_window: boolean | null;
};

type LoadState =
	| { kind: "loading" }
	| { kind: "needs-permission" }
	| { kind: "no-event" }
	| { kind: "ready"; window: EventWindow; ownerId: string; assets: ScannedAsset[] }
	| { kind: "error"; message: string };

export default function ContributeScreen() {
	const router = useRouter();
	const { eventId } = useLocalSearchParams<{ eventId: string }>();
	const [state, setState] = useState<LoadState>({ kind: "loading" });
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [submitting, setSubmitting] = useState(false);

	const hydrate = useUploadQueue((s) => s.hydrate);
	const enqueue = useUploadQueue((s) => s.enqueue);

	useEffect(() => {
		hydrate().catch(() => {});
	}, [hydrate]);

	const load = useCallback(async () => {
		if (!eventId) {
			setState({ kind: "no-event" });
			return;
		}
		setState({ kind: "loading" });

		const granted = await ensureMediaPermission();
		if (!granted) {
			setState({ kind: "needs-permission" });
			return;
		}

		const { data: userData, error: userErr } = await supabase.auth.getUser();
		if (userErr || !userData.user) {
			setState({ kind: "error", message: "Sign in required." });
			return;
		}

		const { data: eventRow, error: eventErr } = await supabase
			.from("events")
			.select("id, starts_at, ends_at, allow_outside_window")
			.eq("id", eventId)
			.maybeSingle<EventRow>();

		if (eventErr) {
			setState({ kind: "error", message: eventErr.message });
			return;
		}
		if (!eventRow) {
			setState({ kind: "no-event" });
			return;
		}

		const window: EventWindow = {
			eventId: eventRow.id,
			startsAt: Date.parse(eventRow.starts_at),
			endsAt: Date.parse(eventRow.ends_at),
			allowOutsideWindow: eventRow.allow_outside_window ?? false,
		};

		try {
			const assets = await scanAssetsForWindow(window);
			const preselected = new Set(assets.filter((a) => a.inWindow).map((a) => a.assetId));
			setSelectedIds(preselected);
			setState({ kind: "ready", window, ownerId: userData.user.id, assets });
		} catch (err) {
			const message = (err as { message?: string })?.message ?? "Failed to scan media library";
			setState({ kind: "error", message });
		}
	}, [eventId]);

	useEffect(() => {
		load();
	}, [load]);

	const onToggle = useCallback((assetId: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(assetId)) next.delete(assetId);
			else next.add(assetId);
			return next;
		});
	}, []);

	const ready = state.kind === "ready" ? state : null;

	const selectedAssets = useMemo(() => {
		if (!ready) return [];
		return ready.assets.filter((a) => selectedIds.has(a.assetId));
	}, [ready, selectedIds]);

	const onUploadPress = useCallback(async () => {
		if (!ready || selectedAssets.length === 0 || submitting) return;
		setSubmitting(true);
		try {
			await enqueue({
				eventId: ready.window.eventId,
				ownerId: ready.ownerId,
				assets: selectedAssets,
			});
			setSelectedIds(new Set());
			Alert.alert("Added to queue", `${selectedAssets.length} item${selectedAssets.length === 1 ? "" : "s"} queued.`);
		} catch (err) {
			Alert.alert("Could not queue uploads", (err as { message?: string })?.message ?? "Unknown error");
		} finally {
			setSubmitting(false);
		}
	}, [enqueue, ready, selectedAssets, submitting]);

	return (
		<SafeAreaView style={styles.container}>
			<Stack.Screen options={{ title: "Add to event", headerShown: true }} />
			{state.kind === "loading" ? (
				<View style={styles.center}>
					<ActivityIndicator color="#fff" />
				</View>
			) : null}

			{state.kind === "needs-permission" ? (
				<View style={styles.center}>
					<Text style={styles.title}>Photo access needed</Text>
					<Text style={styles.body}>Recapd needs to read photos taken during this event so you can pick what to share.</Text>
					<Pressable onPress={load} style={styles.primaryBtn}>
						<Text style={styles.primaryText}>Try again</Text>
					</Pressable>
				</View>
			) : null}

			{state.kind === "no-event" ? (
				<View style={styles.center}>
					<Text style={styles.title}>Event not found</Text>
					<Pressable onPress={() => router.back()} style={styles.primaryBtn}>
						<Text style={styles.primaryText}>Go back</Text>
					</Pressable>
				</View>
			) : null}

			{state.kind === "error" ? (
				<View style={styles.center}>
					<Text style={styles.title}>Something went wrong</Text>
					<Text style={styles.body}>{state.message}</Text>
					<Pressable onPress={load} style={styles.primaryBtn}>
						<Text style={styles.primaryText}>Retry</Text>
					</Pressable>
				</View>
			) : null}

			{ready ? (
				<View style={styles.flex}>
					<View style={styles.headerBlock}>
						<Text style={styles.heading}>Pick what to add</Text>
						<Text style={styles.subheading}>
							{ready.window.allowOutsideWindow
								? "Host allows photos from any time. In-window photos are preselected."
								: "Photos taken during the event."}
						</Text>
					</View>

					<PreSelectStrip
						assets={ready.assets}
						selectedIds={selectedIds}
						onToggle={onToggle}
					/>

					<View style={styles.ctaRow}>
						<Pressable
							onPress={onUploadPress}
							disabled={selectedAssets.length === 0 || submitting}
							style={[
								styles.ctaBtn,
								(selectedAssets.length === 0 || submitting) && styles.ctaBtnDisabled,
							]}
						>
							<Text style={styles.ctaText}>
								{submitting
									? "Queuing…"
									: selectedAssets.length === 0
										? "Select photos"
										: `Upload ${selectedAssets.length}`}
							</Text>
						</Pressable>
					</View>

					<View style={styles.queueWrap}>
						<UploadSheet eventId={ready.window.eventId} />
					</View>
				</View>
			) : null}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#0a0a0b",
	},
	flex: {
		flex: 1,
	},
	center: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 32,
		gap: 12,
	},
	title: {
		color: "#fff",
		fontSize: 20,
		fontWeight: "700",
	},
	body: {
		color: "#bbb",
		textAlign: "center",
	},
	headerBlock: {
		paddingHorizontal: 20,
		paddingTop: 12,
		paddingBottom: 4,
		gap: 4,
	},
	heading: {
		color: "#fff",
		fontSize: 22,
		fontWeight: "700",
	},
	subheading: {
		color: "#aaa",
		fontSize: 13,
	},
	ctaRow: {
		paddingHorizontal: 20,
		paddingTop: 4,
		paddingBottom: 12,
	},
	ctaBtn: {
		backgroundColor: "#7c3aed",
		borderRadius: 14,
		paddingVertical: 14,
		alignItems: "center",
	},
	ctaBtnDisabled: {
		backgroundColor: "#3a2766",
	},
	ctaText: {
		color: "#fff",
		fontSize: 15,
		fontWeight: "700",
	},
	primaryBtn: {
		backgroundColor: "#7c3aed",
		paddingHorizontal: 20,
		paddingVertical: 12,
		borderRadius: 12,
		marginTop: 12,
	},
	primaryText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "600",
	},
	queueWrap: {
		flex: 1,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: "#222",
	},
});
