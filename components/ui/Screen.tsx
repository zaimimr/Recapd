import Feather from "@expo/vector-icons/Feather";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import {
	Pressable,
	ScrollView,
	type ScrollViewProps,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CONTENT_MAX_WIDTH, hitSlop, space, theme, type } from "@/constants/theme";

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
	center = false,
	...props
}: ScrollViewProps & {
	children: ReactNode;
	/**
	 * Centres short content in the viewport instead of stranding it against the
	 * top. Content taller than the viewport still scrolls normally.
	 */
	center?: boolean;
}) {
	return (
		<ScrollView
			style={styles.flex}
			contentContainerStyle={[styles.scrollOuter, center && styles.centered]}
			showsVerticalScrollIndicator={false}
			keyboardShouldPersistTaps="handled"
			indicatorStyle="white"
			{...props}
		>
			<View style={[styles.measure, contentContainerStyle]}>{children}</View>
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
	dismiss = false,
}: {
	title?: string;
	subtitle?: string;
	onBack?: () => void;
	right?: ReactNode;
	transparent?: boolean;
	/** Sheets close, they do not go back. Swaps the chevron for a Close control. */
	dismiss?: boolean;
}) {
	const router = useRouter();
	const handleBack = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")));

	return (
		<View style={[styles.nav, transparent && styles.navTransparent]}>
			<View style={styles.navSide}>
				<Pressable
					onPress={handleBack}
					hitSlop={hitSlop}
					accessibilityRole="button"
					accessibilityLabel={dismiss ? "Close" : "Go back"}
					style={({ pressed }) => [styles.navButton, pressed && { opacity: 0.6 }]}
				>
					<Feather
						name={dismiss ? "x" : "chevron-left"}
						size={dismiss ? 20 : 22}
						color={theme.textPrimary}
					/>
				</Pressable>
			</View>

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

			<View style={[styles.navSide, styles.navRight]}>
				{right ?? <View style={styles.navButtonSpacer} />}
			</View>
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
	scrollOuter: {
		paddingBottom: space.huge,
	},
	/**
	 * Caps the reading measure so a 13" iPad does not stretch a form into a
	 * single 1000pt line. Phones are narrower than the cap and ignore it.
	 */
	measure: {
		width: "100%",
		maxWidth: CONTENT_MAX_WIDTH,
		// alignSelf works here because this is a real View child. The same
		// property on a ScrollView contentContainer is ignored, which left-aligns
		// the capped column on a tablet.
		alignSelf: "center",
	},
	centered: {
		flexGrow: 1,
		justifyContent: "center",
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
	navSide: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		minWidth: 38,
	},
	navTitleWrap: {
		flexShrink: 1,
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
		justifyContent: "flex-end",
		gap: space.sm,
	},
});
