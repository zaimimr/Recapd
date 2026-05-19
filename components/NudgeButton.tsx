import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import {
	formatCooldownLabel,
	getHostNudgeCooldown,
	sendHostBroadcastNudge,
} from "../lib/reminderScheduler";

type Props = {
	eventId: string;
	onSent?: (recipientCount: number) => void;
	onError?: (message: string) => void;
};

type State =
	| { kind: "loading" }
	| { kind: "ready" }
	| { kind: "cooldown"; remainingMs: number }
	| { kind: "sending" }
	| { kind: "sent"; recipientCount: number };

export function NudgeButton({ eventId, onSent, onError }: Props) {
	const [state, setState] = useState<State>({ kind: "loading" });

	const refresh = useCallback(async () => {
		const info = await getHostNudgeCooldown(eventId);
		if (info.canSend) {
			setState({ kind: "ready" });
		} else {
			setState({ kind: "cooldown", remainingMs: info.remainingMs });
		}
	}, [eventId]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	useEffect(() => {
		if (state.kind !== "cooldown") return;
		const interval = setInterval(() => {
			setState((prev) => {
				if (prev.kind !== "cooldown") return prev;
				const next = prev.remainingMs - 60000;
				if (next <= 0) return { kind: "ready" };
				return { kind: "cooldown", remainingMs: next };
			});
		}, 60000);
		return () => clearInterval(interval);
	}, [state.kind]);

	const handlePress = async () => {
		if (state.kind !== "ready") return;
		setState({ kind: "sending" });
		const result = await sendHostBroadcastNudge(eventId);
		if (result.ok) {
			const count = result.recipientCount ?? 0;
			setState({ kind: "sent", recipientCount: count });
			onSent?.(count);
			setTimeout(() => refresh(), 2500);
			return;
		}
		if (result.cooldownRemainingMs && result.cooldownRemainingMs > 0) {
			setState({ kind: "cooldown", remainingMs: result.cooldownRemainingMs });
			return;
		}
		onError?.(result.error ?? "Could not send nudge");
		setState({ kind: "ready" });
	};

	const disabled = state.kind !== "ready";
	const label = renderLabel(state);

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityState={{ disabled }}
			onPress={handlePress}
			disabled={disabled}
			style={({ pressed }) => [
				styles.button,
				disabled && styles.disabled,
				pressed && !disabled && styles.pressed,
			]}
		>
			<View style={styles.iconWrap}>
				<Text style={styles.icon}>📣</Text>
			</View>
			<View style={styles.textWrap}>
				<Text style={styles.title}>Nudge everyone</Text>
				<Text style={styles.subtitle}>{label}</Text>
			</View>
			{state.kind === "sending" ? <ActivityIndicator color="#fff" /> : null}
		</Pressable>
	);
}

function renderLabel(state: State): string {
	switch (state.kind) {
		case "loading":
			return "...";
		case "ready":
			return "Ping guests who haven't uploaded";
		case "cooldown":
			return `Available in ${formatCooldownLabel(state.remainingMs)}`;
		case "sending":
			return "Sending...";
		case "sent":
			return state.recipientCount > 0
				? `Pinged ${state.recipientCount} guest${state.recipientCount === 1 ? "" : "s"}`
				: "No one to ping right now";
	}
}

const styles = StyleSheet.create({
	button: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#7c3aed",
		paddingVertical: 14,
		paddingHorizontal: 16,
		borderRadius: 16,
		gap: 12,
	},
	pressed: { opacity: 0.9 },
	disabled: { backgroundColor: "#3a334d" },
	iconWrap: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: "rgba(255,255,255,0.15)",
		alignItems: "center",
		justifyContent: "center",
	},
	icon: { fontSize: 20 },
	textWrap: { flex: 1 },
	title: { color: "#fff", fontWeight: "700", fontSize: 16 },
	subtitle: { color: "rgba(255,255,255,0.78)", fontSize: 13, marginTop: 2 },
});

export default NudgeButton;
