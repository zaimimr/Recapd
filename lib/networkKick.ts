import * as Network from "expo-network";
import { AppState, type AppStateStatus } from "react-native";
import { logger } from "./logger";

const FOREGROUND_KICK_DEBOUNCE_MS = 1500;
const CONNECTIVITY_KICK_DEBOUNCE_MS = 2000;

type KickQueue = () => Promise<void> | void;

let lastKickAt = 0;
let pendingKickTimer: ReturnType<typeof setTimeout> | null = null;
let appStateSub: { remove(): void } | null = null;
let networkSub: { remove(): void } | null = null;
let lastConnected: boolean | null = null;

function scheduleKick(reason: string, debounceMs: number, run: KickQueue): void {
	const now = Date.now();
	const elapsed = now - lastKickAt;

	if (pendingKickTimer) {
		clearTimeout(pendingKickTimer);
		pendingKickTimer = null;
	}

	const fire = () => {
		pendingKickTimer = null;
		lastKickAt = Date.now();
		logger.info("Upload queue kick", { reason });
		try {
			void Promise.resolve(run()).catch((error) => {
				logger.warn("Upload queue kick threw", error, { reason });
			});
		} catch (error) {
			logger.warn("Upload queue kick threw synchronously", error, { reason });
		}
	};

	if (elapsed >= debounceMs) {
		fire();
		return;
	}

	pendingKickTimer = setTimeout(fire, debounceMs - elapsed);
}

export function installUploadQueueKicker(run: KickQueue): () => void {
	teardownUploadQueueKicker();

	const handleAppState = (state: AppStateStatus) => {
		if (state === "active") {
			scheduleKick("appstate.active", FOREGROUND_KICK_DEBOUNCE_MS, run);
		}
	};

	const handleNetwork = (event: Network.NetworkStateEvent) => {
		const isConnected = event.isConnected === true;
		const previous = lastConnected;
		lastConnected = isConnected;
		if (previous === false && isConnected) {
			scheduleKick("network.restored", CONNECTIVITY_KICK_DEBOUNCE_MS, run);
		}
	};

	appStateSub = AppState.addEventListener("change", handleAppState);
	networkSub = Network.addNetworkStateListener(handleNetwork);

	Network.getNetworkStateAsync()
		.then((state) => {
			lastConnected = state.isConnected === true;
		})
		.catch((error) => {
			logger.warn("Initial network state probe failed", error);
		});

	return teardownUploadQueueKicker;
}

export function teardownUploadQueueKicker(): void {
	if (pendingKickTimer) {
		clearTimeout(pendingKickTimer);
		pendingKickTimer = null;
	}
	appStateSub?.remove();
	networkSub?.remove();
	appStateSub = null;
	networkSub = null;
	lastConnected = null;
	lastKickAt = 0;
}
