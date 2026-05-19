import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
	ActivityIndicator,
	Modal,
	Pressable,
	StyleSheet,
	Text,
	View,
} from "react-native";
import {
	MONTHLY_PRICE_LABEL,
	PER_EVENT_PRICE_LABEL,
} from "@/lib/billing/config";
import { useSubscriptionStore } from "@/store/subscriptionStore";

export type UpgradeReason =
	| "guest_cap"
	| "event_window"
	| "video_length"
	| "media_ttl"
	| "active_event_cap"
	| "full_res_download"
	| "custom_branding"
	| "live_slideshow"
	| "multi_host"
	| "outside_window";

const COPY: Record<UpgradeReason, { title: string; body: string }> = {
	guest_cap: {
		title: "You've hit 20 guests",
		body: "Unlock unlimited guests for this event with a one-time Pro pass, or go monthly for every event.",
	},
	event_window: {
		title: "Free events last 48 hours",
		body: "Pro keeps your event open for up to 30 days so late uploads still land.",
	},
	video_length: {
		title: "Videos longer than 30s need Pro",
		body: "Pro lifts the cap to 4 minutes per clip.",
	},
	media_ttl: {
		title: "This event expires in a few days",
		body: "Extend storage and keep the originals safe with Pro.",
	},
	active_event_cap: {
		title: "You already have an active event",
		body: "Free hosts can run one event at a time. Pro lets you run as many as you want.",
	},
	full_res_download: {
		title: "Full-resolution downloads are Pro",
		body: "Get the originals as a single ZIP. Free guests still see 1080p previews.",
	},
	custom_branding: {
		title: "Custom branding is Pro",
		body: "Add your own cover photo, banner image, and title color.",
	},
	live_slideshow: {
		title: "Live slideshow is Pro",
		body: "Project the event on a TV or web URL while photos roll in.",
	},
	multi_host: {
		title: "Co-hosts are Pro",
		body: "Invite other organizers to help moderate and download.",
	},
	outside_window: {
		title: "Outside-window uploads are Pro",
		body: "Let guests keep uploading after the event window closes.",
	},
};

type Props = {
	visible: boolean;
	reason: UpgradeReason;
	eventId?: string;
	onClose: () => void;
	onUnlocked?: () => void;
};

export function UpgradePrompt({
	visible,
	reason,
	eventId,
	onClose,
	onUnlocked,
}: Props) {
	const [busy, setBusy] = useState(false);
	const packages = useSubscriptionStore((s) => s.packages);
	const loadOfferings = useSubscriptionStore((s) => s.loadOfferings);
	const purchaseAction = useSubscriptionStore((s) => s.purchase);
	const copy = COPY[reason];

	const perEvent = packages.find((p) => p.kind === "per_event");

	const handleUnlock = async () => {
		setBusy(true);
		if (packages.length === 0) {
			await loadOfferings();
		}
		const fresh = useSubscriptionStore.getState().packages.find(
			(p) => p.kind === "per_event",
		);
		if (!fresh) {
			setBusy(false);
			return openFullPaywall();
		}
		const result = await purchaseAction(fresh, eventId);
		setBusy(false);
		if (result.success) {
			onUnlocked?.();
			onClose();
		}
	};

	const openFullPaywall = () => {
		onClose();
		router.push("/paywall");
	};

	return (
		<Modal
			visible={visible}
			animationType="slide"
			transparent
			onRequestClose={onClose}
		>
			<Pressable style={styles.backdrop} onPress={onClose}>
				<Pressable style={styles.sheet} onPress={() => {}}>
					<View style={styles.handle} />
					<Ionicons name="sparkles" size={28} color="#7c3aed" />
					<Text style={styles.title}>{copy.title}</Text>
					<Text style={styles.body}>{copy.body}</Text>

					{eventId ? (
						<Pressable
							style={[styles.primary, busy && styles.disabled]}
							onPress={handleUnlock}
							disabled={busy}
						>
							{busy ? (
								<ActivityIndicator color="#fff" />
							) : (
								<Text style={styles.primaryText}>
									Unlock this event {perEvent?.priceLabel ?? PER_EVENT_PRICE_LABEL}
								</Text>
							)}
						</Pressable>
					) : null}

					<Pressable style={styles.secondary} onPress={openFullPaywall}>
						<Text style={styles.secondaryText}>
							See all plans, from {MONTHLY_PRICE_LABEL}/mo
						</Text>
					</Pressable>

					<Pressable onPress={onClose}>
						<Text style={styles.dismiss}>Not now</Text>
					</Pressable>
				</Pressable>
			</Pressable>
		</Modal>
	);
}

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.55)",
		justifyContent: "flex-end",
	},
	sheet: {
		backgroundColor: "#fff",
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		paddingHorizontal: 24,
		paddingTop: 12,
		paddingBottom: 36,
		alignItems: "center",
		gap: 12,
	},
	handle: {
		width: 44,
		height: 5,
		borderRadius: 999,
		backgroundColor: "#d4d4d8",
		marginBottom: 8,
	},
	title: {
		fontSize: 22,
		fontWeight: "700",
		color: "#111",
		textAlign: "center",
	},
	body: {
		fontSize: 15,
		color: "#52525b",
		textAlign: "center",
		lineHeight: 22,
		marginBottom: 4,
	},
	primary: {
		marginTop: 8,
		backgroundColor: "#7c3aed",
		paddingVertical: 16,
		paddingHorizontal: 24,
		borderRadius: 16,
		alignSelf: "stretch",
		alignItems: "center",
	},
	primaryText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "700",
	},
	disabled: {
		opacity: 0.6,
	},
	secondary: {
		paddingVertical: 14,
		alignSelf: "stretch",
		alignItems: "center",
	},
	secondaryText: {
		color: "#7c3aed",
		fontSize: 15,
		fontWeight: "600",
	},
	dismiss: {
		color: "#71717a",
		fontSize: 14,
		marginTop: 4,
	},
});
