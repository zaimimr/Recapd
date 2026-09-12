import { useId } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

interface GradientProps {
	colors: readonly string[];
	/** 0 = left-to-right, 90 = top-to-bottom, 135 = the brand diagonal. */
	angle?: number;
	style?: StyleProp<ViewStyle>;
	children?: React.ReactNode;
	pointerEvents?: "none" | "auto" | "box-none";
}

function angleToPoints(angle: number) {
	const rad = ((angle - 90) * Math.PI) / 180;
	const x = Math.cos(rad);
	const y = Math.sin(rad);
	return {
		x1: `${(0.5 - x / 2) * 100}%`,
		y1: `${(0.5 - y / 2) * 100}%`,
		x2: `${(0.5 + x / 2) * 100}%`,
		y2: `${(0.5 + y / 2) * 100}%`,
	};
}

/**
 * Linear gradient fill built on react-native-svg, which is already linked for
 * QR rendering. Clip it by giving the wrapper a borderRadius and overflow hidden.
 */
export default function Gradient({
	colors,
	angle = 135,
	style,
	children,
	pointerEvents,
}: GradientProps) {
	const id = `grad${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
	const { x1, y1, x2, y2 } = angleToPoints(angle);
	const stops = colors.length === 1 ? [colors[0], colors[0]] : colors;

	return (
		<View style={style} pointerEvents={pointerEvents}>
			<Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
				<Defs>
					<LinearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
						{stops.map((color, index) => (
							<Stop
								// biome-ignore lint/suspicious/noArrayIndexKey: gradient stops are positional
								key={index}
								offset={`${(index / (stops.length - 1)) * 100}%`}
								stopColor={color}
								stopOpacity={1}
							/>
						))}
					</LinearGradient>
				</Defs>
				<Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
			</Svg>
			{children}
		</View>
	);
}
