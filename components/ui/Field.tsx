import { forwardRef } from "react";
import {
	StyleSheet,
	Text,
	TextInput,
	type TextInputProps,
	View,
	type ViewStyle,
} from "react-native";
import Icon, { type IconName } from "@/components/ui/Icon";
import { radius, space, theme, type } from "@/constants/theme";

interface FieldProps extends TextInputProps {
	label?: string;
	hint?: string;
	error?: string | null;
	icon?: IconName;
	containerStyle?: ViewStyle;
}

const Field = forwardRef<TextInput, FieldProps>(function Field(
	{ label, hint, error, icon, containerStyle, style, ...props },
	ref
) {
	return (
		<View style={[styles.wrap, containerStyle]}>
			{label ? <Text style={styles.label}>{label}</Text> : null}
			<View style={[styles.inputShell, !!error && styles.inputShellError]}>
				{icon ? <Icon name={icon} size={17} color={theme.textMuted} /> : null}
				<TextInput
					ref={ref}
					style={[styles.input, style]}
					placeholderTextColor={theme.textMuted}
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
