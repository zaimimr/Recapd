import Feather from "@expo/vector-icons/Feather";
import type { ComponentProps } from "react";

type FeatherProps = ComponentProps<typeof Feather>;

export type IconName = FeatherProps["name"];

export default function Icon({ accessibilityLabel, ...props }: FeatherProps) {
	if (accessibilityLabel) {
		return <Feather {...props} accessibilityLabel={accessibilityLabel} accessible />;
	}

	return (
		<Feather
			{...props}
			accessibilityElementsHidden
			importantForAccessibility="no-hide-descendants"
		/>
	);
}
