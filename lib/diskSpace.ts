import { getFreeDiskStorageAsync } from "expo-file-system/legacy";

import { logger } from "./logger";

const DISK_SAFETY_MARGIN_BYTES = 100 * 1024 * 1024;

export interface DiskBudgetCheck {
	ok: boolean;
	freeBytes: number;
	requiredBytes: number;
}

export async function getFreeDiskBytes(): Promise<number> {
	try {
		return await getFreeDiskStorageAsync();
	} catch (error) {
		logger.warn("Free disk storage probe failed", error);
		return Number.POSITIVE_INFINITY;
	}
}

export async function checkDiskBudget(bundleBytes: number): Promise<DiskBudgetCheck> {
	const freeBytes = await getFreeDiskBytes();
	const requiredBytes = bundleBytes + DISK_SAFETY_MARGIN_BYTES;
	return { ok: freeBytes >= requiredBytes, freeBytes, requiredBytes };
}

export function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
	const gb = bytes / (1024 * 1024 * 1024);
	if (gb >= 1) return `${gb.toFixed(1)} GB`;
	const mb = bytes / (1024 * 1024);
	return `${Math.max(1, Math.round(mb))} MB`;
}
