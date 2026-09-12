import Feather from "@expo/vector-icons/Feather";
import { useCallback, useEffect, useRef } from "react";
import { Animated, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Gradient } from "@/components/ui";
import { radius, space, theme, type } from "@/constants/theme";

const SHEET_HEIGHT = 340;

interface NotificationPromptModalProps {
	visible: boolean;
	onEnable: () => void;
	onMaybeLater: () => void;
}

export default function NotificationPromptModal({
	visible,
	onEnable,
	onMaybeLater,
}: NotificationPromptModalProps) {
	const insets = useSafeAreaInsets();
	const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
	const backdropOpacity = useRef(new Animated.Value(0)).current;

	const openSheet = useCallback(() => {
		Animated.parallel([
			Animated.spring(translateY, {
				toValue: 0,
				useNativeDriver: true,
				damping: 20,
				stiffness: 200,
			}),
			Animated.timing(backdropOpacity, {
				toValue: 1,
				duration: 200,
				useNativeDriver: true,
			}),
		]).start();
	}, [translateY, backdropOpacity]);

	const closeSheet = useCallback(
		(callback: () => void) => {
			Animated.parallel([
				Animated.spring(translateY, {
					toValue: SHEET_HEIGHT,
					useNativeDriver: true,
					damping: 20,
					stiffness: 200,
				}),
				Animated.timing(backdropOpacity, {
					toValue: 0,
					duration: 150,
					useNativeDriver: true,
				}),
			]).start(() => {
				callback();
			});
		},
		[translateY, backdropOpacity]
	);

	useEffect(() => {
		if (visible) {
			translateY.setValue(SHEET_HEIGHT);
			backdropOpacity.setValue(0);
			openSheet();
		}
	}, [visible, openSheet, translateY, backdropOpacity]);

	if (!visible) return null;

	function handleEnable() {
		closeSheet(onEnable);
	}

	function handleMaybeLater() {
		closeSheet(onMaybeLater);
	}

	return (
		<Modal
			visible={visible}
			transparent
			animationType="none"
			statusBarTranslucent
			onRequestClose={handleMaybeLater}
		>
			<View style={styles.container}>
				<Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
					<TouchableOpacity
						style={StyleSheet.absoluteFill}
						activeOpacity={1}
						onPress={handleMaybeLater}
					/>
				</Animated.View>

				<Animated.View
					style={[
						styles.sheet,
						{
							transform: [{ translateY }],
							paddingBottom: insets.bottom + space.lg,
						},
					]}
				>
					<View style={styles.handleContainer}>
						<View style={styles.handle} />
					</View>

					<View style={styles.content}>
						<View style={styles.iconWrap}>
							<Gradient colors={theme.gradient} style={styles.iconFill} pointerEvents="none" />
							<Feather name="bell" size={26} color="#FFFFFF" />
						</View>

						<Text style={styles.title}>Know before it closes</Text>

						<Text style={styles.message}>
							We'll nudge you to add your photos after the event, and again before the album deletes
							itself. Nothing else, ever.
						</Text>

						<View style={styles.actions}>
							<Button label="Turn on notifications" icon="bell" onPress={handleEnable} />
							<Button label="Not now" variant="ghost" size="md" onPress={handleMaybeLater} />
						</View>
					</View>
				</Animated.View>
			</View>
		</Modal>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: "flex-end",
	},
	backdrop: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: theme.overlay,
	},
	sheet: {
		backgroundColor: theme.card,
		borderTopLeftRadius: radius.xxl,
		borderTopRightRadius: radius.xxl,
		borderTopWidth: 1,
		borderColor: theme.border,
		paddingHorizontal: space.xl,
	},
	handleContainer: {
		alignItems: "center",
		paddingTop: space.md,
		paddingBottom: space.sm,
	},
	handle: {
		width: 40,
		height: 4,
		borderRadius: 2,
		backgroundColor: theme.borderStrong,
	},
	content: {
		alignItems: "center",
		gap: space.md,
		paddingTop: space.md,
	},
	iconWrap: {
		width: 62,
		height: 62,
		borderRadius: radius.xl,
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
	},
	iconFill: {
		...StyleSheet.absoluteFillObject,
	},
	title: {
		...type.title,
		color: theme.textPrimary,
		textAlign: "center",
		marginTop: space.xs,
	},
	message: {
		...type.body,
		color: theme.textMuted,
		textAlign: "center",
		lineHeight: 22,
	},
	actions: {
		alignSelf: "stretch",
		gap: space.sm,
		marginTop: space.lg,
	},
});
