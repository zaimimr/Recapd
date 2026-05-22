import FontAwesome from "@expo/vector-icons/FontAwesome";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSubscriptionPlans, useSubscriptionStore } from "@/store/subscriptionStore";
import { getParticipantLimit, getParticipantWarningThreshold } from "@/types/subscription";

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
	const plans = useSubscriptionPlans();
	const participantLimit = getParticipantLimit(hostIsPro, plans);
	const warningThreshold = getParticipantWarningThreshold(hostIsPro, plans);

	if (hostIsPro) return null;
	if (participantCount < warningThreshold) return null;

	const isAtLimit = participantCount >= participantLimit;
	const remaining = participantLimit - participantCount;

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
						: `Free events allow up to ${participantLimit} guests`}
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
		paddingHorizontal: 14,
		paddingVertical: 14,
		borderWidth: 1,
		marginBottom: 16,
		gap: 12,
	},
	bannerWarning: {
		backgroundColor: "#fff",
		borderColor: "#f59e0b",
	},
	bannerLimit: {
		backgroundColor: "#fff",
		borderColor: "#ef4444",
	},
	bannerDark: {
		backgroundColor: "#0f1115",
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
		marginBottom: 3,
		textTransform: "uppercase",
		letterSpacing: 0.8,
	},
	titleWarning: {
		color: "#92400e",
	},
	titleLimit: {
		color: "#b91c1c",
	},
	subtitle: {
		fontSize: 13,
		color: "#6b7280",
	},
	subtitleDark: {
		color: "#9ca3af",
	},
	upgradeButton: {
		backgroundColor: "#111827",
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 999,
	},
	upgradeButtonWarning: {
		backgroundColor: "#111827",
	},
	upgradeButtonText: {
		color: "#fff",
		fontSize: 13,
		fontWeight: "600",
	},
});
