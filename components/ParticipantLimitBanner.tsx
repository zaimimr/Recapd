import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { Button, Card } from "@/components/ui";
import Icon from "@/components/ui/Icon";
import { radius, space, theme, type } from "@/constants/theme";
import { getEventPassPackage, purchaseEventPass } from "@/lib/eventPass";
import { useSubscriptionPlans, useSubscriptionStore } from "@/store/subscriptionStore";
import { getParticipantLimit, getParticipantWarningThreshold } from "@/types/subscription";

interface ParticipantLimitBannerProps {
	participantCount: number;
	hostIsPro: boolean;
	isHost: boolean;
	eventId: string;
	onEventPassActivated: () => void;
}

export default function ParticipantLimitBanner({
	participantCount,
	hostIsPro,
	isHost,
	eventId,
	onEventPassActivated,
}: ParticipantLimitBannerProps) {
	const { showPaywall } = useSubscriptionStore();
	const plans = useSubscriptionPlans();
	const participantLimit = getParticipantLimit(hostIsPro, plans);
	const warningThreshold = getParticipantWarningThreshold(hostIsPro, plans);
	const isVisible = !hostIsPro && participantCount >= warningThreshold;
	const [eventPassPackage, setEventPassPackage] = useState<PurchasesPackage | null>(null);
	const [buyingEventPass, setBuyingEventPass] = useState(false);

	useEffect(() => {
		if (!isHost || !isVisible) {
			return;
		}
		let active = true;
		getEventPassPackage()
			.then((pkg) => {
				if (active) {
					setEventPassPackage(pkg);
				}
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [isHost, isVisible]);

	if (!isVisible) return null;

	const handleBuyEventPass = async () => {
		if (!eventPassPackage) {
			return;
		}
		setBuyingEventPass(true);
		const outcome = await purchaseEventPass(eventId, eventPassPackage);
		setBuyingEventPass(false);
		if (outcome.ok) {
			onEventPassActivated();
			return;
		}
		if (outcome.reason === "cancelled") {
			return;
		}
		Alert.alert(
			outcome.reason === "not_redeemed" ? "Payment received" : "Purchase failed",
			outcome.reason === "not_redeemed"
				? "We couldn't unlock the album yet. Pull to refresh in a minute, or contact support."
				: (outcome.message ?? "Please try again.")
		);
	};

	const isAtLimit = participantCount >= participantLimit;
	const remaining = participantLimit - participantCount;
	const tint = isAtLimit ? theme.danger : theme.warning;

	const title = isAtLimit
		? "The album is full"
		: `${remaining} ${remaining === 1 ? "spot" : "spots"} left`;

	const body = isAtLimit
		? isHost
			? "Nobody else can join until you upgrade."
			: "Ask the host to upgrade so more people can join."
		: isHost
			? `Free albums hold ${participantLimit} guests. Pro removes the cap.`
			: `Free albums hold up to ${participantLimit} guests.`;

	return (
		<Card style={[styles.card, { borderColor: tint }]}>
			<View style={styles.row}>
				<View style={[styles.icon, { backgroundColor: `${tint}22` }]}>
					<Icon name={isAtLimit ? "alert-circle" : "users"} size={17} color={tint} />
				</View>
				<View style={styles.text}>
					<Text style={[styles.title, { color: tint }]}>{title}</Text>
					<Text style={styles.body}>{body}</Text>
				</View>
			</View>
			{isHost && eventPassPackage ? (
				<Button
					label={`Unlock this album · ${eventPassPackage.product.priceString}`}
					icon="unlock"
					size="md"
					loading={buyingEventPass}
					onPress={handleBuyEventPass}
					style={styles.action}
				/>
			) : null}
			{isHost ? (
				<Button
					label="Upgrade to Pro"
					icon="zap"
					size="md"
					variant="secondary"
					onPress={showPaywall}
					style={styles.action}
				/>
			) : null}
		</Card>
	);
}

const styles = StyleSheet.create({
	card: {
		gap: space.md,
	},
	row: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: space.md,
	},
	icon: {
		width: 38,
		height: 38,
		borderRadius: radius.md,
		alignItems: "center",
		justifyContent: "center",
	},
	text: {
		flex: 1,
		gap: 3,
	},
	title: {
		...type.bodyStrong,
	},
	body: {
		...type.caption,
		fontWeight: "500",
		color: theme.textMuted,
		lineHeight: 17,
	},
	action: {
		marginTop: space.xs,
	},
});
