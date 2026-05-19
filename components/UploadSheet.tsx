import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { uploadQueueSelectors, useUploadQueue } from "@/store/uploadQueue";

type Props = {
	eventId: string;
	onRequestClose?: () => void;
};

function statusLabel(status: string): string {
	switch (status) {
		case "queued":
			return "Queued";
		case "uploading":
			return "Uploading";
		case "done":
			return "Done";
		case "failed":
			return "Failed";
		default:
			return status;
	}
}

export function UploadSheet({ eventId, onRequestClose }: Props) {
	const items = useUploadQueue(useMemo(() => uploadQueueSelectors.itemsForEvent(eventId), [eventId]));
	const retry = useUploadQueue((s) => s.retryItem);
	const remove = useUploadQueue((s) => s.removeItem);
	const clearDone = useUploadQueue((s) => s.clearDone);

	const counts = useMemo(() => {
		let queued = 0;
		let uploading = 0;
		let done = 0;
		let failed = 0;
		for (const item of items) {
			if (item.status === "queued") queued += 1;
			else if (item.status === "uploading") uploading += 1;
			else if (item.status === "done") done += 1;
			else if (item.status === "failed") failed += 1;
		}
		return { queued, uploading, done, failed };
	}, [items]);

	return (
		<View style={styles.sheet}>
			<View style={styles.header}>
				<Text style={styles.title}>Uploads</Text>
				{onRequestClose ? (
					<Pressable onPress={onRequestClose} hitSlop={12}>
						<Text style={styles.close}>Close</Text>
					</Pressable>
				) : null}
			</View>

			<View style={styles.summaryRow}>
				<Text style={styles.summary}>{counts.uploading} uploading</Text>
				<Text style={styles.summary}>{counts.queued} queued</Text>
				<Text style={styles.summary}>{counts.done} done</Text>
				{counts.failed > 0 ? <Text style={[styles.summary, styles.failed]}>{counts.failed} failed</Text> : null}
				{counts.done > 0 ? (
					<Pressable onPress={clearDone} style={styles.clearBtn} hitSlop={8}>
						<Text style={styles.clearText}>Clear done</Text>
					</Pressable>
				) : null}
			</View>

			<ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
				{items.map((item) => (
					<View key={item.id} style={styles.row}>
						<View style={styles.rowMain}>
							<Text numberOfLines={1} style={styles.filename}>
								{item.filename}
							</Text>
							<Text style={[styles.status, item.status === "failed" && styles.failed]}>{statusLabel(item.status)}</Text>
						</View>
						<View style={styles.progressTrack}>
							<View
								style={[
									styles.progressFill,
									{ width: `${Math.round(item.progress * 100)}%` },
									item.status === "failed" && styles.progressFailed,
								]}
							/>
						</View>
						{item.status === "failed" ? (
							<View style={styles.actions}>
								<Pressable onPress={() => retry(item.id)} style={styles.actionBtn}>
									<Text style={styles.actionText}>Retry</Text>
								</Pressable>
								<Pressable onPress={() => remove(item.id)} style={styles.actionBtn}>
									<Text style={styles.actionText}>Remove</Text>
								</Pressable>
								{item.error ? <Text style={styles.errorText} numberOfLines={2}>{item.error}</Text> : null}
							</View>
						) : null}
					</View>
				))}
				{items.length === 0 ? <Text style={styles.empty}>Nothing in queue.</Text> : null}
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
	sheet: {
		backgroundColor: "#0e0e10",
		flex: 1,
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		paddingHorizontal: 20,
		paddingTop: 18,
		paddingBottom: 8,
	},
	title: {
		color: "#fff",
		fontSize: 22,
		fontWeight: "700",
	},
	close: {
		color: "#bbb",
		fontSize: 15,
	},
	summaryRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 14,
		paddingHorizontal: 20,
		paddingBottom: 12,
		alignItems: "center",
	},
	summary: {
		color: "#bbb",
		fontSize: 13,
	},
	failed: {
		color: "#ff6b6b",
	},
	clearBtn: {
		marginLeft: "auto",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 8,
		backgroundColor: "#222",
	},
	clearText: {
		color: "#ddd",
		fontSize: 12,
		fontWeight: "600",
	},
	list: {
		flex: 1,
	},
	listContent: {
		paddingHorizontal: 20,
		paddingBottom: 32,
		gap: 12,
	},
	row: {
		backgroundColor: "#17171a",
		borderRadius: 12,
		padding: 12,
		gap: 8,
	},
	rowMain: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		gap: 12,
	},
	filename: {
		color: "#fff",
		fontSize: 14,
		flex: 1,
	},
	status: {
		color: "#aaa",
		fontSize: 12,
		fontWeight: "600",
	},
	progressTrack: {
		height: 4,
		borderRadius: 2,
		backgroundColor: "#2a2a2e",
		overflow: "hidden",
	},
	progressFill: {
		height: "100%",
		backgroundColor: "#7c3aed",
	},
	progressFailed: {
		backgroundColor: "#ff6b6b",
	},
	actions: {
		flexDirection: "row",
		gap: 10,
		alignItems: "center",
		flexWrap: "wrap",
	},
	actionBtn: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 8,
		backgroundColor: "#222",
	},
	actionText: {
		color: "#fff",
		fontSize: 12,
		fontWeight: "600",
	},
	errorText: {
		color: "#ff9b9b",
		fontSize: 11,
		flex: 1,
	},
	empty: {
		color: "#777",
		textAlign: "center",
		paddingVertical: 24,
	},
});
