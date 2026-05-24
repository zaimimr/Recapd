import { useColorScheme } from "react-native";
import { type AppTheme, getTheme } from "@/constants/theme";

export function useTheme(): AppTheme {
	const scheme = useColorScheme();
	return getTheme(scheme);
}
