import {
	ActivityIndicator,
	type GestureResponderEvent,
	Pressable,
	type StyleProp,
	StyleSheet,
	Text,
	View,
	type ViewStyle,
} from "react-native";
import Icon, { type IconName } from "@/components/ui/Icon";
import { gradients, radius, shadow, space, theme, type } from "@/constants/theme";
import Gradient from "./Gradient";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "lg" | "md" | "sm";

interface ButtonProps {
	label: string;
	onPress?: (event: GestureResponderEvent) => void;
	icon?: IconName;
	iconRight?: IconName;
	variant?: ButtonVariant;
	size?: ButtonSize;
	loading?: boolean;
	disabled?: boolean;
	full?: boolean;
	style?: StyleProp<ViewStyle>;
	accessibilityLabel?: string;
	accessibilityHint?: string;
	testID?: string;
}

const SIZES: Record<ButtonSize, { height: number; padding: number; font: number; icon: number }> = {
	lg: { height: 54, padding: space.xl, font: 16, icon: 19 },
	md: { height: 46, padding: space.lg, font: 15, icon: 17 },
	sm: { height: 38, padding: space.md, font: 13.5, icon: 15 },
};

export default function Button({
	label,
	onPress,
	icon,
	iconRight,
	variant = "primary",
	size = "lg",
	loading = false,
	disabled = false,
	full = true,
	style,
	accessibilityLabel,
	accessibilityHint,
	testID,
}: ButtonProps) {
	const dims = SIZES[size];
	const isDisabled = disabled || loading;

	const isFilled = variant === "primary" || variant === "danger";

	const contentColor = isDisabled
		? theme.textMuted
		: isFilled
			? theme.textOnAccent
			: variant === "secondary"
				? theme.textPrimary
				: theme.accent;

	const body = loading ? (
		<ActivityIndicator color={contentColor} />
	) : (
		<View style={styles.content}>
			{icon ? <Icon name={icon} size={dims.icon} color={contentColor} /> : null}
			<Text style={[styles.label, { color: contentColor, fontSize: dims.font }]} numberOfLines={1}>
				{label}
			</Text>
			{iconRight ? <Icon name={iconRight} size={dims.icon} color={contentColor} /> : null}
		</View>
	);

	const shell: ViewStyle = {
		height: dims.height,
		paddingHorizontal: dims.padding,
		borderRadius: radius.lg,
		alignSelf: full ? "stretch" : "flex-start",
		alignItems: "center",
		justifyContent: "center",
		overflow: "hidden",
	};

	return (
		<Pressable
			onPress={onPress}
			disabled={isDisabled}
			testID={testID}
			accessibilityRole="button"
			accessibilityState={{ disabled: isDisabled, busy: loading }}
			accessibilityLabel={accessibilityLabel ?? label}
			accessibilityHint={accessibilityHint}
			style={({ pressed }) => [
				shell,
				isDisabled && {
					backgroundColor: theme.card,
					borderWidth: 0,
				},
				!isFilled &&
					!isDisabled && {
						backgroundColor: variant === "secondary" ? theme.cardElevated : "transparent",
						borderWidth: variant === "secondary" ? 1 : 0,
						borderColor: theme.border,
					},
				variant === "primary" && !isDisabled && shadow.accent,
				pressed && !isDisabled && styles.pressed,
				style,
			]}
		>
			{isFilled && !isDisabled ? (
				<Gradient
					colors={variant === "primary" ? gradients.brand : gradients.danger}
					style={styles.fill}
					pointerEvents="none"
				/>
			) : null}
			{body}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	fill: StyleSheet.absoluteFillObject,
	content: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.sm,
	},
	label: {
		fontWeight: type.subheading.fontWeight,
		letterSpacing: -0.2,
	},
	pressed: {
		opacity: 0.82,
		transform: [{ scale: 0.985 }],
	},
});
