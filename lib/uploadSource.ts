import {
	copyAsync,
	deleteAsync,
	documentDirectory,
	getFreeDiskStorageAsync,
	getInfoAsync,
	makeDirectoryAsync,
} from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { logger } from "./logger";
import { addUploadBreadcrumb } from "./sentry";

function uriScheme(uri: string): string {
	if (uri.startsWith("ph://")) return "ph";
	if (uri.startsWith("assets-library://")) return "assets-library";
	if (uri.startsWith("content://")) return "content";
	if (uri.startsWith("file://")) {
		if (uri.includes("/Library/Caches/")) return "file:cache";
		if (uri.includes("/tmp/")) return "file:tmp";
		if (documentDirectory && uri.startsWith(documentDirectory)) return "file:doc";
		return "file:other";
	}
	if (uri.startsWith("/")) return "abs-path";
	return "unknown";
}

const SOURCE_DIR_NAME = "upload-sources";
const MIN_FREE_DISK_SAFETY_BYTES = 50 * 1024 * 1024;
const MIN_FREE_DISK_HEADROOM = 1.5;

export class UploadSourceUnavailableError extends Error {
	readonly reason: "missing" | "icloud" | "permission" | "disk";

	constructor(reason: UploadSourceUnavailableError["reason"], message: string) {
		super(message);
		this.name = "UploadSourceUnavailableError";
		this.reason = reason;
	}
}

export interface MaterializedSource {
	path: string;
	size: number;
	cleanup: () => Promise<void>;
}

function stripUriDecorations(uri: string): string {
	return uri.replace(/[?#].*$/, "");
}

function getExtension(uri: string, fallback: string): string {
	const stripped = stripUriDecorations(uri);
	const lastSegment = stripped.split("/").pop() ?? "";
	const match = lastSegment.match(/\.([a-z0-9]+)$/i);
	return (match?.[1] ?? fallback).toLowerCase();
}

function sourcesDir(): string {
	if (!documentDirectory) {
		throw new UploadSourceUnavailableError(
			"permission",
			"documentDirectory is unavailable on this platform"
		);
	}
	return `${documentDirectory}${SOURCE_DIR_NAME}/`;
}

function joinSourcePath(uploadId: string, extension: string): string {
	const ext = extension ? `.${extension}` : "";
	return `${sourcesDir()}${uploadId}${ext}`;
}

function isUnderDocumentDirectory(uri: string): boolean {
	return Boolean(documentDirectory) && uri.startsWith(documentDirectory!);
}

function isPhAssetUri(uri: string): boolean {
	return uri.startsWith("ph://") || uri.startsWith("assets-library://");
}

function isContentUri(uri: string): boolean {
	return uri.startsWith("content://");
}

async function ensureSourcesDir(): Promise<void> {
	const dir = sourcesDir();
	await makeDirectoryAsync(dir, { intermediates: true });
}

async function ensureFreeDiskFor(size: number): Promise<void> {
	try {
		const free = await getFreeDiskStorageAsync();
		const required = size * MIN_FREE_DISK_HEADROOM + MIN_FREE_DISK_SAFETY_BYTES;
		if (free < required) {
			throw new UploadSourceUnavailableError(
				"disk",
				`Not enough free space. Need ${Math.ceil(required / (1024 * 1024))}MB, have ${Math.floor(
					free / (1024 * 1024)
				)}MB.`
			);
		}
	} catch (error) {
		if (error instanceof UploadSourceUnavailableError) throw error;
		logger.warn("Free disk probe failed during materialization", error);
	}
}

async function resolvePhAssetToFileUri(assetId: string): Promise<string> {
	const startedAt = Date.now();
	addUploadBreadcrumb("phasset.resolve.start", { assetId });
	const info = await MediaLibrary.getAssetInfoAsync(assetId, {
		shouldDownloadFromNetwork: true,
	});
	const localUri = info?.localUri;
	if (!localUri) {
		addUploadBreadcrumb(
			"phasset.resolve.icloud-unavailable",
			{ assetId, elapsedMs: Date.now() - startedAt },
			"warning"
		);
		throw new UploadSourceUnavailableError(
			"icloud",
			`Asset ${assetId} could not be downloaded from iCloud`
		);
	}
	addUploadBreadcrumb("phasset.resolve.ok", {
		assetId,
		elapsedMs: Date.now() - startedAt,
		uriScheme: uriScheme(localUri),
	});
	return localUri;
}

async function copyToSources(
	fromUri: string,
	uploadId: string,
	fallbackExtension: string,
	knownSize: number | undefined
): Promise<MaterializedSource> {
	const extension = getExtension(fromUri, fallbackExtension);
	const target = joinSourcePath(uploadId, extension);
	const startedAt = Date.now();
	addUploadBreadcrumb("materialize.copy.stat", { fromScheme: uriScheme(fromUri), uploadId });

	let sourceInfo: Awaited<ReturnType<typeof getInfoAsync>>;
	try {
		sourceInfo = await getInfoAsync(stripUriDecorations(fromUri));
	} catch (statError) {
		addUploadBreadcrumb(
			"materialize.copy.stat-threw",
			{
				uploadId,
				fromScheme: uriScheme(fromUri),
				err: statError instanceof Error ? statError.message : String(statError),
			},
			"error"
		);
		throw statError;
	}
	if (!sourceInfo.exists || sourceInfo.isDirectory) {
		addUploadBreadcrumb(
			"materialize.copy.source-missing",
			{ uploadId, fromScheme: uriScheme(fromUri) },
			"warning"
		);
		throw new UploadSourceUnavailableError(
			"missing",
			`Source file vanished before copy: ${fromUri}`
		);
	}
	const detectedSize =
		typeof sourceInfo.size === "number" && sourceInfo.size > 0 ? sourceInfo.size : (knownSize ?? 0);
	if (detectedSize > 0) {
		await ensureFreeDiskFor(detectedSize);
	}

	await ensureSourcesDir();
	try {
		await copyAsync({ from: stripUriDecorations(fromUri), to: target });
	} catch (copyError) {
		addUploadBreadcrumb(
			"materialize.copy.copy-threw",
			{
				uploadId,
				fromScheme: uriScheme(fromUri),
				sizeBytes: detectedSize,
				elapsedMs: Date.now() - startedAt,
				err: copyError instanceof Error ? copyError.message : String(copyError),
			},
			"error"
		);
		throw copyError;
	}

	const copied = await getInfoAsync(target);
	if (!copied.exists || copied.isDirectory) {
		throw new UploadSourceUnavailableError(
			"missing",
			`Copied source missing immediately after copy: ${target}`
		);
	}
	const finalSize =
		typeof copied.size === "number" && copied.size > 0
			? copied.size
			: detectedSize > 0
				? detectedSize
				: 0;
	if (finalSize === 0) {
		throw new UploadSourceUnavailableError("missing", `Copied source is empty: ${target}`);
	}

	addUploadBreadcrumb("materialize.copy.ok", {
		uploadId,
		fromScheme: uriScheme(fromUri),
		sizeBytes: finalSize,
		elapsedMs: Date.now() - startedAt,
	});

	return {
		path: target,
		size: finalSize,
		cleanup: async () => {
			try {
				await deleteAsync(target, { idempotent: true });
				addUploadBreadcrumb("materialize.cleanup.ok", { uploadId });
			} catch (error) {
				addUploadBreadcrumb(
					"materialize.cleanup.failed",
					{ uploadId, err: error instanceof Error ? error.message : String(error) },
					"warning"
				);
				logger.warn("Upload source cleanup failed", error, { target });
			}
		},
	};
}

async function useInPlace(uri: string, knownSize: number | undefined): Promise<MaterializedSource> {
	const info = await getInfoAsync(stripUriDecorations(uri));
	if (!info.exists || info.isDirectory) {
		throw new UploadSourceUnavailableError("missing", `In-place source missing: ${uri}`);
	}
	const size = typeof info.size === "number" && info.size > 0 ? info.size : (knownSize ?? 0);
	if (size === 0) {
		throw new UploadSourceUnavailableError("missing", `In-place source is empty: ${uri}`);
	}
	return {
		path: stripUriDecorations(uri),
		size,
		cleanup: async () => {},
	};
}

export interface MaterializeOptions {
	uri: string;
	assetId?: string;
	uploadId: string;
	mediaType: "photo" | "video";
	knownSize?: number;
}

export async function materializeUploadSource(
	options: MaterializeOptions
): Promise<MaterializedSource> {
	const { uri, assetId, uploadId, mediaType, knownSize } = options;
	const fallbackExtension = mediaType === "video" ? "mp4" : "jpg";
	const scheme = uriScheme(uri);

	addUploadBreadcrumb("materialize.start", {
		uploadId,
		uriScheme: scheme,
		assetId,
		mediaType,
		knownSize,
	});

	const result = await materializeImpl();
	addUploadBreadcrumb("materialize.done", {
		uploadId,
		path: result.path,
		sizeBytes: result.size,
	});
	return result;

	async function materializeImpl(): Promise<MaterializedSource> {
		if (isUnderDocumentDirectory(uri)) {
			try {
				return await useInPlace(uri, knownSize);
			} catch (error) {
				if (
					error instanceof UploadSourceUnavailableError &&
					error.reason === "missing" &&
					assetId
				) {
					addUploadBreadcrumb(
						"materialize.recover.phasset",
						{ uploadId, assetId, reason: "doc-dir-vanished" },
						"warning"
					);
					const recovered = await resolvePhAssetToFileUri(assetId);
					return copyToSources(recovered, uploadId, fallbackExtension, knownSize);
				}
				throw error;
			}
		}

		if (isPhAssetUri(uri)) {
			const inferredAssetId =
				assetId ?? uri.replace("ph://", "").replace("assets-library://", "").split("/")[0];
			if (!inferredAssetId) {
				throw new UploadSourceUnavailableError(
					"missing",
					`Cannot resolve PHAsset URI without an asset id: ${uri}`
				);
			}
			const resolved = await resolvePhAssetToFileUri(inferredAssetId);
			return copyToSources(resolved, uploadId, fallbackExtension, knownSize);
		}

		if (isContentUri(uri)) {
			return copyToSources(uri, uploadId, fallbackExtension, knownSize);
		}

		if (uri.startsWith("file://") || uri.startsWith("/")) {
			try {
				return await copyToSources(uri, uploadId, fallbackExtension, knownSize);
			} catch (error) {
				if (
					error instanceof UploadSourceUnavailableError &&
					error.reason === "missing" &&
					assetId
				) {
					addUploadBreadcrumb(
						"materialize.recover.phasset",
						{ uploadId, assetId, reason: "file-vanished", uriScheme: scheme },
						"warning"
					);
					const recovered = await resolvePhAssetToFileUri(assetId);
					return copyToSources(recovered, uploadId, fallbackExtension, knownSize);
				}
				throw error;
			}
		}

		throw new UploadSourceUnavailableError("missing", `Unsupported source URI scheme: ${uri}`);
	}
}

export async function cleanupOrphanedUploadSources(): Promise<void> {
	try {
		const dir = sourcesDir();
		const info = await getInfoAsync(dir);
		if (!info.exists) return;
		await deleteAsync(dir, { idempotent: true });
		await ensureSourcesDir();
	} catch (error) {
		logger.warn("Upload source dir reset failed", error);
	}
}

export const __test = {
	stripUriDecorations,
	getExtension,
	isUnderDocumentDirectory,
	isPhAssetUri,
	isContentUri,
};
