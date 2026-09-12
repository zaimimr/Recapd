import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import {
	Pressable,
	type ScrollViewProps,
	ScrollView,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { hitSlop, space, theme, type } from "@/constants/theme";

/**
 * Page shell. Owns the ground colour and the safe-area padding so no screen
 * has to rediscover either.
 */
export function Screen({
	children,
	style,
	edges = "top",
}: {
	children: ReactNode;
	style?: ViewStyle;
	edges?: "top" | "none" | "both";
}) {
	const insets = useSafeAreaInsets();
	return (
		<View
			style={[
				styles.screen,
				{
					paddingTop: edges === "none" ? 0 : insets.top,
					paddingBottom: edges === "both" ? insets.bottom : 0,
				},
				style,
			]}
		>
			{children}
		</View>
	);
}

export function ScreenScroll({
	children,
	contentContainerStyle,
	...props
}: ScrollViewProps & { children: ReactNode }) {
	return (
		<ScrollView
			style={styles.flex}
			contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
			showsVerticalScrollIndicator={false}
			keyboardShouldPersistTaps="handled"
			indicatorStyle="white"
			{...props}
		>
			{children}
		</ScrollView>
	);
}

/**
 * Inline navigation bar. Deep screens stay inline per platform convention;
 * top-level screens use a large title in the body instead.
 */
export function NavBar({
	title,
	subtitle,
	onBack,
	right,
	transparent = false,
}: {
	title?: string;
	subtitle?: string;
	onBack?: () => void | null;
	right?: ReactNode;
	transparent?: boolean;
}) {
	const router = useRouter();
	const handleBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")));

	return (
		<View style={[styles.nav, transparent && styles.navTransparent]}>
			<Pressable
				onPress={handleBack}
				hitSlop={hitSlop}
				accessibilityRole="button"
				accessibilityLabel="Go back"
				style={({ pressed }) => [styles.navButton, pressed && { opacity: 0.6 }]}
			>
				<Feather name="chevron-left" size={22} color={theme.textPrimary} />
			</Pressable>

			<View style={styles.navTitleWrap}>
				{title ? (
					<Text style={styles.navTitle} numberOfLines={1}>
						{title}
					</Text>
				) : null}
				{subtitle ? (
					<Text style={styles.navSubtitle} numberOfLines={1}>
						{subtitle}
					</Text>
				) : null}
			</View>

			<View style={styles.navRight}>{right ?? <View style={styles.navButtonSpacer} />}</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: theme.page,
	},
	flex: {
		flex: 1,
	},
	scrollContent: {
		paddingBottom: space.huge,
	},
	nav: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.md,
		paddingHorizontal: space.lg,
		paddingTop: space.xs,
		paddingBottom: space.md,
	},
	navTransparent: {
		backgroundColor: "transparent",
	},
	navButton: {
		width: 38,
		height: 38,
		borderRadius: 19,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(255,255,255,0.08)",
	},
	navButtonSpacer: {
		width: 38,
		height: 38,
	},
	navTitleWrap: {
		flex: 1,
		alignItems: "center",
		gap: 1,
	},
	navTitle: {
		...type.subheading,
		fontSize: 17,
		color: theme.textPrimary,
	},
	navSubtitle: {
		...type.caption,
		fontWeight: "500",
		color: theme.textMuted,
	},
	navRight: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.sm,
	},
});
