import Feather from "@expo/vector-icons/Feather";
import { forwardRef } from "react";
import {
	StyleSheet,
	Text,
	TextInput,
	type TextInputProps,
	View,
	type ViewStyle,
} from "react-native";
import { radius, space, theme, type } from "@/constants/theme";

interface FieldProps extends TextInputProps {
	label?: string;
	hint?: string;
	error?: string | null;
	icon?: React.ComponentProps<typeof Feather>["name"];
	containerStyle?: ViewStyle;
}

/**
 * Single text field. Errors name the problem under the input and turn the
 * border red; the hint stays visible until an error replaces it.
 */
const Field = forwardRef<TextInput, FieldProps>(function Field(
	{ label, hint, error, icon, containerStyle, style, ...props },
	ref
) {
	return (
		<View style={[styles.wrap, containerStyle]}>
			{label ? <Text style={styles.label}>{label}</Text> : null}
			<View style={[styles.inputShell, !!error && styles.inputShellError]}>
				{icon ? <Feather name={icon} size={17} color={theme.textMuted} /> : null}
				<TextInput
					ref={ref}
					style={[styles.input, style]}
					placeholderTextColor={theme.textDisabled}
					selectionColor={theme.accent}
					cursorColor={theme.accent}
					accessibilityLabel={props.accessibilityLabel ?? label}
					{...props}
				/>
			</View>
			{error ? (
				<Text style={styles.error} accessibilityLiveRegion="polite">
					{error}
				</Text>
			) : hint ? (
				<Text style={styles.hint}>{hint}</Text>
			) : null}
		</View>
	);
});

export default Field;

const styles = StyleSheet.create({
	wrap: {
		gap: space.sm,
	},
	label: {
		...type.bodyStrong,
		color: theme.textPrimary,
	},
	inputShell: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.md,
		minHeight: 52,
		paddingHorizontal: space.lg,
		borderRadius: radius.lg,
		backgroundColor: theme.cardElevated,
		borderWidth: 1,
		borderColor: theme.border,
	},
	inputShellError: {
		borderColor: theme.danger,
	},
	input: {
		flex: 1,
		...type.body,
		fontWeight: "600",
		color: theme.textPrimary,
		paddingVertical: space.md,
	},
	hint: {
		...type.caption,
		fontWeight: "500",
		color: theme.textMuted,
	},
	error: {
		...type.caption,
		fontWeight: "600",
		color: theme.danger,
	},
});
