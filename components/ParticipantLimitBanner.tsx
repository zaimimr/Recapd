import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSubscriptionStore } from "@/store/subscriptionStore";
import { FREE_PARTICIPANT_LIMIT, PARTICIPANT_WARNING_THRESHOLD } from "@/types/subscription";

interface ParticipantLimitBannerProps {
	participantCount: number;
	hostIsPro: boolean;
	isHost: boolean;
	isDark?: boolean;
}

export default function ParticipantLimitBanner({
	participantCount,
	hostIsPro,
	isHost,
	isDark = false,
}: ParticipantLimitBannerProps) {
	const { showPaywall } = useSubscriptionStore();

	if (hostIsPro) return null;
	if (participantCount < PARTICIPANT_WARNING_THRESHOLD) return null;

	const isAtLimit = participantCount >= FREE_PARTICIPANT_LIMIT;
	const remaining = FREE_PARTICIPANT_LIMIT - participantCount;

	const handleUpgrade = () => {
		showPaywall();
	};

	if (isAtLimit) {
		return (
			<View style={[styles.banner, styles.bannerLimit, isDark && styles.bannerDark]}>
				<View style={[styles.iconContainer, styles.iconLimit]}>
					<FontAwesome name="exclamation" size={14} color="#fff" />
				</View>
				<View style={styles.content}>
					<Text style={[styles.title, styles.titleLimit]}>Participant limit reached</Text>
					<Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
						{isHost
							? "Upgrade to Pro for unlimited participants"
							: "Ask the host to upgrade for more guests"}
					</Text>
				</View>
				{isHost && (
					<TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
						<Text style={styles.upgradeButtonText}>Upgrade</Text>
					</TouchableOpacity>
				)}
			</View>
		);
	}

	return (
		<View style={[styles.banner, styles.bannerWarning, isDark && styles.bannerDark]}>
			<View style={[styles.iconContainer, styles.iconWarning]}>
				<FontAwesome name="users" size={12} color="#fff" />
			</View>
			<View style={styles.content}>
				<Text style={[styles.title, styles.titleWarning]}>
					{remaining} spot{remaining !== 1 ? "s" : ""} left
				</Text>
				<Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
					{isHost
						? "Upgrade to Pro for unlimited"
						: `Free events allow up to ${FREE_PARTICIPANT_LIMIT} guests`}
				</Text>
			</View>
			{isHost && (
				<TouchableOpacity
					style={[styles.upgradeButton, styles.upgradeButtonWarning]}
					onPress={handleUpgrade}
				>
					<Text style={styles.upgradeButtonText}>Upgrade</Text>
				</TouchableOpacity>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	banner: {
		flexDirection: "row",
		alignItems: "center",
		padding: 12,
		borderRadius: 12,
		marginBottom: 16,
		gap: 12,
	},
	bannerWarning: {
		backgroundColor: "#fef3c7",
	},
	bannerLimit: {
		backgroundColor: "#fee2e2",
	},
	bannerDark: {
		backgroundColor: "#1a1a1a",
	},
	iconContainer: {
		width: 28,
		height: 28,
		borderRadius: 14,
		justifyContent: "center",
		alignItems: "center",
	},
	iconWarning: {
		backgroundColor: "#f59e0b",
	},
	iconLimit: {
		backgroundColor: "#ef4444",
	},
	content: {
		flex: 1,
	},
	title: {
		fontSize: 14,
		fontWeight: "600",
		marginBottom: 2,
	},
	titleWarning: {
		color: "#92400e",
	},
	titleLimit: {
		color: "#b91c1c",
	},
	subtitle: {
		fontSize: 12,
		color: "#78350f",
	},
	subtitleDark: {
		color: "#888",
	},
	upgradeButton: {
		backgroundColor: "#ef4444",
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 8,
	},
	upgradeButtonWarning: {
		backgroundColor: "#f59e0b",
	},
	upgradeButtonText: {
		color: "#fff",
		fontSize: 13,
		fontWeight: "600",
	},
});
