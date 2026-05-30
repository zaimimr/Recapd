import { Image } from "expo-image";
import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";

function clearImageMemory() {
	void Image.clearMemoryCache();
}

export function useImageMemoryGuard() {
	useEffect(() => {
		const memoryWarningSubscription = AppState.addEventListener("memoryWarning", clearImageMemory);

		const appStateSubscription = AppState.addEventListener("change", (state: AppStateStatus) => {
			if (state === "background" || state === "inactive") {
				clearImageMemory();
			}
		});

		return () => {
			memoryWarningSubscription.remove();
			appStateSubscription.remove();
		};
	}, []);
}
