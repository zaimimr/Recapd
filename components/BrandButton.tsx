import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
	ActivityIndicator,
	type GestureResponderEvent,
	type StyleProp,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
	type ViewStyle,
} from "react-native";
import { useTheme } from "@/components/useTheme";

type BrandButtonVariant = "solid" | "outline" | "soft";

interface BrandButtonProps {
	label: string;
	onPress?: (event: GestureResponderEvent) => void;
	icon?: React.ComponentProps<typeof FontAwesome>["name"];
	variant?: BrandButtonVariant;
	loading?: boolean;
	disabled?: boolean;
	style?: StyleProp<ViewStyle>;
	accessibilityLabel?: string;
	accessibilityHint?: string;
}

export default function BrandButton({
	label,
	onPress,
	icon,
	variant = "solid",
	loading = false,
	disabled = false,
	style,
	accessibilityLabel,
	accessibilityHint,
}: BrandButtonProps) {
	const theme = useTheme();

	const isSolid = variant === "solid";
	const isOutline = variant === "outline";

	const containerStyle: ViewStyle = {
		backgroundColor: isSolid ? theme.accent : isOutline ? "transparent" : theme.accentSurface,
		borderWidth: isOutline ? 1.5 : 0,
		borderColor: isOutline ? theme.accentBorder : "transparent",
		opacity: disabled ? 0.5 : 1,
	};

	const contentColor = isSolid ? theme.textOnAccent : theme.accent;

	return (
		<TouchableOpacity
			style={[styles.button, containerStyle, style]}
			onPress={onPress}
			disabled={disabled || loading}
			activeOpacity={0.85}
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel ?? label}
			accessibilityHint={accessibilityHint}
		>
			{loading ? (
				<ActivityIndicator color={contentColor} />
			) : (
				<View style={styles.content}>
					{icon && <FontAwesome name={icon} size={15} color={contentColor} />}
					<Text style={[styles.label, { color: contentColor }]}>{label}</Text>
				</View>
			)}
		</TouchableOpacity>
	);
}

const styles = StyleSheet.create({
	button: {
		paddingVertical: 16,
		paddingHorizontal: 20,
		borderRadius: 999,
		alignItems: "center",
		justifyContent: "center",
	},
	content: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	label: {
		fontSize: 16,
		fontWeight: "700",
	},
});
