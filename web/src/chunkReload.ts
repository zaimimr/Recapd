const RELOAD_FLAG = "recapd-chunk-reload";

const CHUNK_ERROR_PATTERNS = [
	"failed to fetch dynamically imported module",
	"error loading dynamically imported module",
	"importing a module script failed",
	"unable to preload css",
];

export function isChunkLoadError(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error ?? "");
	const normalized = message.toLowerCase();
	return CHUNK_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export function shouldReloadForChunkError(error: unknown, alreadyReloaded: boolean): boolean {
	return !alreadyReloaded && isChunkLoadError(error);
}

export function hasReloadedForChunk(): boolean {
	try {
		return sessionStorage.getItem(RELOAD_FLAG) === "1";
	} catch {
		return true;
	}
}

export function markReloadedForChunk(): void {
	try {
		sessionStorage.setItem(RELOAD_FLAG, "1");
	} catch {
		return;
	}
}

export function clearChunkReloadFlag(): void {
	try {
		sessionStorage.removeItem(RELOAD_FLAG);
	} catch {
		return;
	}
}
