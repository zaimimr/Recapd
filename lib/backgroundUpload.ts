import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { logger } from "./logger";

export const UPLOAD_BACKGROUND_TASK = "recapd-upload-queue";
const BACKGROUND_TASK_TIMEOUT_MS = 25 * 1000;

type ProcessUploadsFn = () => Promise<void>;

let activeProcessUploads: ProcessUploadsFn | null = null;
let registered = false;
let expirationSub: { remove(): void } | null = null;

function registerBackgroundTaskDefinition(): void {
	if (TaskManager.isTaskDefined(UPLOAD_BACKGROUND_TASK)) {
		return;
	}
	TaskManager.defineTask(UPLOAD_BACKGROUND_TASK, async () => {
		const run = activeProcessUploads;
		if (!run) {
			logger.warn("Background upload task fired without a registered runner");
			return BackgroundTask.BackgroundTaskResult.Failed;
		}
		try {
			await Promise.race([
				run(),
				new Promise<void>((_, reject) => {
					setTimeout(
						() => reject(new Error("Background upload task budget exhausted")),
						BACKGROUND_TASK_TIMEOUT_MS
					);
				}),
			]);
			return BackgroundTask.BackgroundTaskResult.Success;
		} catch (error) {
			logger.warn("Background upload task failed", error);
			return BackgroundTask.BackgroundTaskResult.Failed;
		}
	});
}

registerBackgroundTaskDefinition();

export async function isBackgroundUploadAvailable(): Promise<boolean> {
	try {
		const status = await BackgroundTask.getStatusAsync();
		return status === BackgroundTask.BackgroundTaskStatus.Available;
	} catch (error) {
		logger.warn("Background task availability probe failed", error);
		return false;
	}
}

export async function installBackgroundUploadTask(
	processUploads: ProcessUploadsFn
): Promise<() => Promise<void>> {
	activeProcessUploads = processUploads;

	if (registered) {
		return uninstallBackgroundUploadTask;
	}

	const available = await isBackgroundUploadAvailable();
	if (!available) {
		logger.info("Background task API not available - skipping registration");
		return uninstallBackgroundUploadTask;
	}

	try {
		await BackgroundTask.registerTaskAsync(UPLOAD_BACKGROUND_TASK, {
			minimumInterval: 15,
		});
		registered = true;
		expirationSub?.remove();
		expirationSub = BackgroundTask.addExpirationListener(() => {
			logger.info("Background upload task expired");
		});
	} catch (error) {
		logger.warn("Background upload task registration failed", error);
	}

	return uninstallBackgroundUploadTask;
}

export async function uninstallBackgroundUploadTask(): Promise<void> {
	activeProcessUploads = null;
	expirationSub?.remove();
	expirationSub = null;
	if (!registered) return;
	try {
		await BackgroundTask.unregisterTaskAsync(UPLOAD_BACKGROUND_TASK);
	} catch (error) {
		logger.warn("Background upload task unregister failed", error);
	} finally {
		registered = false;
	}
}
