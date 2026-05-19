import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
	ANNUAL_PRICE_LABEL,
	MONTHLY_PRICE_LABEL,
	PER_EVENT_PRICE_LABEL,
} from "@/lib/billing/config";
import type { PaywallPackage, ProductKind } from "@/lib/subscription";
import { useSubscriptionStore } from "@/store/subscriptionStore";

const FEATURES: { label: string; perEvent: boolean; sub: boolean }[] = [
	{ label: "Unlimited guests", perEvent: true, sub: true },
	{ label: "Up to 30-day event window", perEvent: true, sub: true },
	{ label: "4-minute videos", perEvent: true, sub: true },
	{ label: "Full-resolution downloads (ZIP)", perEvent: true, sub: true },
	{ label: "Custom branding (cover, banner, color)", perEvent: true, sub: true },
	{ label: "Live slideshow / projector mode", perEvent: true, sub: true },
	{ label: "Co-host invites", perEvent: true, sub: true },
	{ label: "Outside-window uploads", perEvent: true, sub: true },
	{ label: "Storage kept past 60 days", perEvent: false, sub: true },
	{ label: "Unlimited active events", perEvent: false, sub: true },
];

const FALLBACK_PRICE: Record<ProductKind, string> = {
	per_event: PER_EVENT_PRICE_LABEL,
	monthly: MONTHLY_PRICE_LABEL,
	annual: ANNUAL_PRICE_LABEL,
};

const PLAN_TITLE: Record<ProductKind, string> = {
	per_event: "This event only",
	monthly: "Monthly",
	annual: "Annual",
};

const PLAN_SUBTITLE: Record<ProductKind, string> = {
	per_event: "One-time unlock for this event",
	monthly: "Cancel anytime",
	annual: "Best value, save vs monthly",
};

export default function PaywallScreen() {
	const params = useLocalSearchParams<{ eventId?: string }>();
	const eventId = typeof params.eventId === "string" ? params.eventId : undefined;
	const packages = useSubscriptionStore((s) => s.packages);
	const offering = useSubscriptionStore((s) => s.offering);
	const loadOfferings = useSubscriptionStore((s) => s.loadOfferings);
	const purchaseAction = useSubscriptionStore((s) => s.purchase);
	const restoreAction = useSubscriptionStore((s) => s.restore);
	const lastError = useSubscriptionStore((s) => s.lastError);
	const isPro = useSubscriptionStore((s) => s.entitlement === "pro");
	const loadLimits = useSubscriptionStore((s) => s.loadLimits);

	const [busyKind, setBusyKind] = useState<ProductKind | null>(null);
	const [restoring, setRestoring] = useState(false);
	const [selected, setSelected] = useState<ProductKind>(eventId ? "per_event" : "annual");
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		void Promise.all([loadOfferings(), loadLimits()]).finally(() => setLoaded(true));
	}, [loadOfferings, loadLimits]);

	const byKind = useMemo(() => {
		const map = new Map<ProductKind, PaywallPackage>();
		for (const p of packages) map.set(p.kind, p);
		return map;
	}, [packages]);

	const savingsLabel = useMemo(() => {
		const m = byKind.get("monthly");
		const a = byKind.get("annual");
		if (!m || !a) return null;
		const yearlyIfMonthly = m.rawPrice * 12;
		if (yearlyIfMonthly <= 0) return null;
		const pct = Math.round(((yearlyIfMonthly - a.rawPrice) / yearlyIfMonthly) * 100);
		return pct > 0 ? `Save ${pct}%` : null;
	}, [byKind]);

	const handlePurchase = async () => {
		const pkg = byKind.get(selected);
		if (!pkg) return;
		setBusyKind(selected);
		const result = await purchaseAction(pkg, selected === "per_event" ? eventId : undefined);
		setBusyKind(null);
		if (result.success) {
			router.back();
		}
	};

	const handleRestore = async () => {
		setRestoring(true);
		await restoreAction();
		setRestoring(false);
	};

	const renderPlan = (kind: ProductKind) => {
		const pkg = byKind.get(kind);
		const price = pkg?.priceLabel ?? FALLBACK_PRICE[kind];
		const isSelected = selected === kind;
		const isAnnual = kind === "annual";
		const isPerEvent = kind === "per_event";

		return (
			<Pressable
				key={kind}
				onPress={() => setSelected(kind)}
				style={[styles.plan, isSelected && styles.planSelected]}
			>
				<View style={styles.planHeader}>
					<View>
						<Text style={styles.planTitle}>{PLAN_TITLE[kind]}</Text>
						<Text style={styles.planSubtitle}>{PLAN_SUBTITLE[kind]}</Text>
					</View>
					<View style={styles.priceCol}>
						<Text style={styles.priceText}>{price}</Text>
						{isPerEvent ? (
							<Text style={styles.priceUnit}>one-time</Text>
						) : isAnnual ? (
							<Text style={styles.priceUnit}>per year</Text>
						) : (
							<Text style={styles.priceUnit}>per month</Text>
						)}
					</View>
				</View>
				{isAnnual && savingsLabel ? (
					<View style={styles.badge}>
						<Text style={styles.badgeText}>{savingsLabel}</Text>
					</View>
				) : null}
				{isSelected ? (
					<View style={styles.checkPill}>
						<Ionicons name="checkmark" size={14} color="#fff" />
					</View>
				) : (
					<View style={styles.checkPillEmpty} />
				)}
			</Pressable>
		);
	};

	return (
		<SafeAreaView style={styles.safe} edges={["top"]}>
			<ScrollView contentContainerStyle={styles.content}>
				<Pressable
					accessibilityLabel="Close"
					hitSlop={12}
					style={styles.close}
					onPress={() => router.back()}
				>
					<Ionicons name="close" size={24} color="#111827" />
				</Pressable>

				<View style={styles.hero}>
					<View style={styles.heroBadge}>
						<Ionicons name="sparkles" size={16} color="#7c3aed" />
						<Text style={styles.heroBadgeText}>Recapd Pro</Text>
					</View>
					<Text style={styles.heroTitle}>
						{isPro ? "You're a Pro member" : "Make every event unforgettable"}
					</Text>
					<Text style={styles.heroSubtitle}>
						Unlimited guests, longer events, full-resolution downloads, custom branding.
					</Text>
				</View>

				<View style={styles.plans}>
					{eventId ? renderPlan("per_event") : null}
					{renderPlan("annual")}
					{renderPlan("monthly")}
				</View>

				<View style={styles.features}>
					{FEATURES.map((f) => {
						const included = selected === "per_event" ? f.perEvent : f.sub;
						return (
							<View key={f.label} style={styles.featureRow}>
								<Ionicons
									name={included ? "checkmark-circle" : "remove-circle-outline"}
									size={18}
									color={included ? "#10b981" : "#d1d5db"}
								/>
								<Text style={[styles.featureLabel, !included && styles.featureLabelMuted]}>
									{f.label}
								</Text>
							</View>
						);
					})}
				</View>

				<Pressable
					style={[styles.cta, busyKind === selected && styles.ctaDisabled]}
					onPress={handlePurchase}
					disabled={busyKind !== null || !byKind.has(selected)}
				>
					{busyKind === selected ? (
						<ActivityIndicator color="#fff" />
					) : (
						<Text style={styles.ctaText}>
							{selected === "per_event"
								? `Unlock for ${byKind.get("per_event")?.priceLabel ?? PER_EVENT_PRICE_LABEL}`
								: `Start ${PLAN_TITLE[selected]}`}
						</Text>
					)}
				</Pressable>

				{!byKind.has(selected) && loaded ? (
					<Text style={styles.unavailable}>
						This plan isn't available right now. Try again in a moment.
					</Text>
				) : null}

				<View style={styles.trust}>
					<TrustItem icon="shield-checkmark" label="Secure payment" />
					<TrustItem icon="refresh" label="Cancel anytime" />
					<TrustItem icon="lock-closed" label="Your photos stay private" />
				</View>

				<Pressable onPress={handleRestore} disabled={restoring}>
					<Text style={styles.restore}>{restoring ? "Restoring..." : "Restore purchases"}</Text>
				</Pressable>

				{lastError ? <Text style={styles.error}>{lastError}</Text> : null}
				{!offering && loaded ? (
					<Text style={styles.note}>
						Showing reference pricing. Tap a plan to start once billing is available.
					</Text>
				) : null}
			</ScrollView>
		</SafeAreaView>
	);
}

function TrustItem({
	icon,
	label,
}: {
	icon: React.ComponentProps<typeof Ionicons>["name"];
	label: string;
}) {
	return (
		<View style={styles.trustItem}>
			<Ionicons name={icon} size={14} color="#6b7280" />
			<Text style={styles.trustLabel}>{label}</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	safe: { flex: 1, backgroundColor: "#fafaf9" },
	content: {
		paddingHorizontal: 20,
		paddingBottom: 60,
		gap: 16,
	},
	close: {
		alignSelf: "flex-end",
		padding: 4,
	},
	hero: {
		alignItems: "center",
		gap: 8,
		paddingTop: 8,
		paddingBottom: 4,
	},
	heroBadge: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		backgroundColor: "#ede9fe",
		paddingHorizontal: 10,
		paddingVertical: 4,
		borderRadius: 999,
	},
	heroBadgeText: {
		color: "#5b21b6",
		fontSize: 12,
		fontWeight: "700",
		letterSpacing: 0.4,
	},
	heroTitle: {
		fontSize: 26,
		fontWeight: "800",
		color: "#0f172a",
		textAlign: "center",
		marginTop: 4,
	},
	heroSubtitle: {
		fontSize: 15,
		color: "#475569",
		textAlign: "center",
		lineHeight: 22,
		paddingHorizontal: 8,
	},
	plans: {
		gap: 10,
		marginTop: 4,
	},
	plan: {
		backgroundColor: "#fff",
		borderRadius: 16,
		borderWidth: 1.5,
		borderColor: "#e5e7eb",
		paddingVertical: 14,
		paddingHorizontal: 16,
		position: "relative",
	},
	planSelected: {
		borderColor: "#7c3aed",
		backgroundColor: "#faf5ff",
	},
	planHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "flex-start",
	},
	planTitle: {
		fontSize: 16,
		fontWeight: "700",
		color: "#0f172a",
	},
	planSubtitle: {
		fontSize: 12,
		color: "#64748b",
		marginTop: 2,
	},
	priceCol: {
		alignItems: "flex-end",
	},
	priceText: {
		fontSize: 18,
		fontWeight: "800",
		color: "#0f172a",
	},
	priceUnit: {
		fontSize: 11,
		color: "#64748b",
	},
	badge: {
		position: "absolute",
		top: -8,
		right: 14,
		backgroundColor: "#7c3aed",
		paddingHorizontal: 8,
		paddingVertical: 2,
		borderRadius: 999,
	},
	badgeText: {
		color: "#fff",
		fontSize: 11,
		fontWeight: "700",
	},
	checkPill: {
		position: "absolute",
		left: -6,
		top: 16,
		width: 22,
		height: 22,
		borderRadius: 999,
		backgroundColor: "#7c3aed",
		alignItems: "center",
		justifyContent: "center",
	},
	checkPillEmpty: {
		position: "absolute",
		left: -6,
		top: 16,
		width: 22,
		height: 22,
		borderRadius: 999,
		backgroundColor: "#fff",
		borderWidth: 1.5,
		borderColor: "#d1d5db",
	},
	features: {
		gap: 8,
		marginTop: 8,
		padding: 14,
		backgroundColor: "#fff",
		borderRadius: 14,
	},
	featureRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	featureLabel: {
		fontSize: 14,
		color: "#1f2937",
	},
	featureLabelMuted: {
		color: "#9ca3af",
		textDecorationLine: "line-through",
	},
	cta: {
		backgroundColor: "#0f172a",
		borderRadius: 16,
		paddingVertical: 16,
		alignItems: "center",
		marginTop: 4,
	},
	ctaDisabled: { opacity: 0.7 },
	ctaText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "700",
	},
	unavailable: {
		fontSize: 12,
		color: "#9ca3af",
		textAlign: "center",
	},
	trust: {
		flexDirection: "row",
		justifyContent: "space-around",
		marginTop: 4,
	},
	trustItem: {
		alignItems: "center",
		gap: 4,
	},
	trustLabel: {
		fontSize: 11,
		color: "#6b7280",
		fontWeight: "500",
	},
	restore: {
		textAlign: "center",
		fontSize: 14,
		color: "#7c3aed",
		fontWeight: "600",
		paddingVertical: 8,
	},
	error: {
		textAlign: "center",
		fontSize: 12,
		color: "#dc2626",
	},
	note: {
		textAlign: "center",
		fontSize: 11,
		color: "#9ca3af",
		fontStyle: "italic",
	},
});
