import Feather from "@expo/vector-icons/Feather";
import type { ReactNode } from "react";
import {
	Pressable,
	type StyleProp,
	StyleSheet,
	Text,
	type TextStyle,
	View,
	type ViewStyle,
} from "react-native";
import { hitSlop, radius, shadow, space, theme, type } from "@/constants/theme";

/* -------------------------------------------------------------- Card */

interface CardProps {
	children: ReactNode;
	style?: StyleProp<ViewStyle>;
	elevated?: boolean;
	accent?: boolean;
	padded?: boolean;
	onPress?: () => void;
	accessibilityLabel?: string;
	accessibilityHint?: string;
}

export function Card({
	children,
	style,
	elevated = false,
	accent = false,
	padded = true,
	onPress,
	accessibilityLabel,
	accessibilityHint,
}: CardProps) {
	const base: StyleProp<ViewStyle> = [
		styles.card,
		padded && styles.cardPadded,
		elevated && { backgroundColor: theme.cardElevated },
		accent && { borderColor: theme.accentBorder },
		style,
	];

	if (!onPress) return <View style={base}>{children}</View>;

	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			accessibilityHint={accessibilityHint}
			style={({ pressed }) => [base, pressed && styles.pressed]}
		>
			{children}
		</Pressable>
	);
}

/* -------------------------------------------------------------- Eyebrow + SectionHeader */

export function Eyebrow({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
	return <Text style={[styles.eyebrow, style]}>{String(children).toUpperCase()}</Text>;
}

export function SectionHeader({
	eyebrow,
	title,
	trailing,
	style,
}: {
	eyebrow?: string;
	title?: string;
	trailing?: ReactNode;
	style?: StyleProp<ViewStyle>;
}) {
	return (
		<View style={[styles.sectionHeader, style]}>
			<View style={styles.sectionHeaderText}>
				{eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
				{title ? (
					<Text style={styles.sectionTitle} numberOfLines={2}>
						{title}
					</Text>
				) : null}
			</View>
			{trailing}
		</View>
	);
}

/* -------------------------------------------------------------- Pill */

export type PillTone = "neutral" | "live" | "success" | "warning" | "danger" | "accent";

const PILL_TONES: Record<PillTone, { bg: string; fg: string }> = {
	neutral: { bg: theme.pillSurface, fg: theme.textMuted },
	live: { bg: theme.successSurface, fg: theme.success },
	success: { bg: theme.successSurface, fg: theme.success },
	warning: { bg: theme.warningSurface, fg: theme.warning },
	danger: { bg: theme.dangerSurface, fg: theme.danger },
	accent: { bg: theme.accentSurface, fg: theme.accentSoft },
};

export function Pill({
	label,
	tone = "neutral",
	dot = false,
	icon,
	style,
}: {
	label: string;
	tone?: PillTone;
	dot?: boolean;
	icon?: React.ComponentProps<typeof Feather>["name"];
	style?: StyleProp<ViewStyle>;
}) {
	const { bg, fg } = PILL_TONES[tone];
	return (
		<View style={[styles.pill, { backgroundColor: bg }, style]}>
			{dot ? <View style={[styles.pillDot, { backgroundColor: fg }]} /> : null}
			{icon ? <Feather name={icon} size={12} color={fg} /> : null}
			<Text style={[styles.pillLabel, { color: fg }]} numberOfLines={1}>
				{label}
			</Text>
		</View>
	);
}

/* -------------------------------------------------------------- StatTile */

export function StatRow({ items }: { items: { value: string | number; label: string }[] }) {
	return (
		<View style={styles.statRow}>
			{items.map((item) => (
				<View key={item.label} style={styles.statTile}>
					<Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
						{item.value}
					</Text>
					<Text style={styles.statLabel} numberOfLines={1}>
						{item.label.toUpperCase()}
					</Text>
				</View>
			))}
		</View>
	);
}

/* -------------------------------------------------------------- IconButton */

export function IconButton({
	icon,
	onPress,
	accessibilityLabel,
	tone = "glass",
	size = 38,
	disabled = false,
	style,
}: {
	icon: React.ComponentProps<typeof Feather>["name"];
	onPress?: () => void;
	accessibilityLabel: string;
	tone?: "glass" | "plain" | "danger";
	size?: number;
	disabled?: boolean;
	style?: StyleProp<ViewStyle>;
}) {
	const fg = tone === "danger" ? theme.danger : theme.textPrimary;
	return (
		<Pressable
			onPress={onPress}
			disabled={disabled}
			hitSlop={hitSlop}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			accessibilityState={{ disabled }}
			style={({ pressed }) => [
				{
					width: size,
					height: size,
					borderRadius: size / 2,
					alignItems: "center",
					justifyContent: "center",
					backgroundColor:
						tone === "plain"
							? "transparent"
							: tone === "danger"
								? theme.dangerSurface
								: "rgba(255,255,255,0.08)",
					opacity: disabled ? 0.4 : 1,
				},
				pressed && !disabled && styles.pressed,
				style,
			]}
		>
			<Feather name={icon} size={Math.round(size * 0.5)} color={fg} />
		</Pressable>
	);
}

/* -------------------------------------------------------------- ListRow */

export function ListRow({
	icon,
	iconTone = "accent",
	title,
	subtitle,
	trailing,
	onPress,
	last = false,
	destructive = false,
	accessibilityHint,
}: {
	icon?: React.ComponentProps<typeof Feather>["name"];
	iconTone?: "accent" | "neutral" | "danger";
	title: string;
	subtitle?: string;
	trailing?: ReactNode;
	onPress?: () => void;
	last?: boolean;
	destructive?: boolean;
	accessibilityHint?: string;
}) {
	const iconBg =
		iconTone === "danger"
			? theme.dangerSurface
			: iconTone === "neutral"
				? "rgba(255,255,255,0.07)"
				: theme.accentSurface;
	const iconFg =
		iconTone === "danger" ? theme.danger : iconTone === "neutral" ? theme.textMuted : theme.accentSoft;

	const content = (
		<>
			{icon ? (
				<View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
					<Feather name={icon} size={17} color={iconFg} />
				</View>
			) : null}
			<View style={styles.rowText}>
				<Text
					style={[styles.rowTitle, destructive && { color: theme.danger }]}
					numberOfLines={1}
				>
					{title}
				</Text>
				{subtitle ? (
					<Text style={styles.rowSubtitle} numberOfLines={2}>
						{subtitle}
					</Text>
				) : null}
			</View>
			{trailing ?? (onPress ? <Feather name="chevron-right" size={17} color={theme.textDisabled} /> : null)}
		</>
	);

	if (!onPress) {
		return <View style={[styles.row, !last && styles.rowDivider]}>{content}</View>;
	}

	return (
		<Pressable
			onPress={onPress}
			accessibilityRole="button"
			accessibilityLabel={title}
			accessibilityHint={accessibilityHint}
			style={({ pressed }) => [styles.row, !last && styles.rowDivider, pressed && styles.pressed]}
		>
			{content}
		</Pressable>
	);
}

/* -------------------------------------------------------------- EmptyState */

export function EmptyState({
	icon = "image",
	title,
	body,
	action,
}: {
	icon?: React.ComponentProps<typeof Feather>["name"];
	title: string;
	body?: string;
	action?: ReactNode;
}) {
	return (
		<View style={styles.empty}>
			<View style={styles.emptyIcon}>
				<Feather name={icon} size={26} color={theme.accentSoft} />
			</View>
			<Text style={styles.emptyTitle}>{title}</Text>
			{body ? <Text style={styles.emptyBody}>{body}</Text> : null}
			{action ? <View style={styles.emptyAction}>{action}</View> : null}
		</View>
	);
}

/* -------------------------------------------------------------- styles */

const styles = StyleSheet.create({
	card: {
		backgroundColor: theme.card,
		borderRadius: radius.xl,
		borderWidth: 1,
		borderColor: theme.border,
		...shadow.card,
	},
	cardPadded: {
		padding: space.lg,
	},
	pressed: {
		opacity: 0.75,
	},

	eyebrow: {
		...type.eyebrow,
		color: theme.accentSoft,
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "flex-end",
		justifyContent: "space-between",
		gap: space.md,
	},
	sectionHeaderText: {
		flex: 1,
		gap: space.xs,
	},
	sectionTitle: {
		...type.title,
		color: theme.textPrimary,
	},

	pill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		borderRadius: radius.pill,
		paddingHorizontal: 10,
		paddingVertical: 5,
		alignSelf: "flex-start",
	},
	pillDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
	},
	pillLabel: {
		fontSize: 11.5,
		fontWeight: "700",
		letterSpacing: -0.1,
	},

	statRow: {
		flexDirection: "row",
		gap: space.sm,
	},
	statTile: {
		flex: 1,
		backgroundColor: theme.cardElevated,
		borderRadius: radius.lg,
		borderWidth: 1,
		borderColor: theme.border,
		paddingVertical: space.md,
		paddingHorizontal: space.sm,
		alignItems: "center",
	},
	statValue: {
		fontSize: 20,
		fontWeight: "800",
		letterSpacing: -0.6,
		color: theme.textPrimary,
	},
	statLabel: {
		fontSize: 10,
		fontWeight: "700",
		letterSpacing: 0.6,
		color: theme.textMuted,
		marginTop: 2,
	},

	row: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.md,
		paddingVertical: 13,
		paddingHorizontal: space.lg,
		minHeight: 60,
	},
	rowDivider: {
		borderBottomWidth: 1,
		borderBottomColor: theme.border,
	},
	rowIcon: {
		width: 36,
		height: 36,
		borderRadius: radius.md,
		alignItems: "center",
		justifyContent: "center",
	},
	rowText: {
		flex: 1,
		gap: 2,
	},
	rowTitle: {
		...type.bodyStrong,
		color: theme.textPrimary,
	},
	rowSubtitle: {
		...type.caption,
		fontWeight: "500",
		color: theme.textMuted,
	},

	empty: {
		alignItems: "center",
		paddingVertical: space.huge,
		paddingHorizontal: space.xxl,
		gap: space.sm,
	},
	emptyIcon: {
		width: 64,
		height: 64,
		borderRadius: radius.xl,
		backgroundColor: theme.accentSurface,
		alignItems: "center",
		justifyContent: "center",
		marginBottom: space.xs,
	},
	emptyTitle: {
		...type.heading,
		color: theme.textPrimary,
		textAlign: "center",
	},
	emptyBody: {
		...type.body,
		color: theme.textMuted,
		textAlign: "center",
		maxWidth: 300,
	},
	emptyAction: {
		marginTop: space.md,
		alignSelf: "stretch",
	},
});
