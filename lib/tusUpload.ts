import AsyncStorage from "@react-native-async-storage/async-storage";
import { EncodingType, readAsStringAsync } from "expo-file-system/legacy";
import { logger } from "./logger";
import { addUploadBreadcrumb } from "./sentry";
import { supabase } from "./supabase";

const TUS_VERSION = "1.0.0";
const TUS_CHUNK_SIZE = 2 * 1024 * 1024;
const TUS_CHUNK_TIMEOUT_MS = 90 * 1000;
const TUS_CREATE_TIMEOUT_MS = 30 * 1000;
const TUS_STATE_PREFIX = "recapd_tus_v1_";

export interface TusUploadOptions {
	fileUri: string;
	fileSize: number;
	bucket: string;
	objectName: string;
	contentType: string;
	cacheControl?: string;
	upsert?: boolean;
	fileFingerprint: string;
	signal?: AbortSignal;
	onProgress?: (bytesUploaded: number, totalBytes: number) => void;
}

export interface TusUploadResult {
	path: string;
}

interface PersistedTusState {
	tusUrl: string;
	totalBytes: number;
	updatedAt: string;
}

function tusEndpoint(): string {
	const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
	if (!base) {
		throw new Error("EXPO_PUBLIC_SUPABASE_URL is not configured");
	}
	return `${base.replace(/\/$/, "")}/storage/v1/upload/resumable`;
}

function encodeTusMetadata(metadata: Record<string, string>): string {
	return Object.entries(metadata)
		.map(([key, value]) => {
			const encoded =
				typeof Buffer !== "undefined"
					? Buffer.from(value, "utf8").toString("base64")
					: globalThis.btoa(unescape(encodeURIComponent(value)));
			return `${key} ${encoded}`;
		})
		.join(",");
}

function withTusTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const timeoutPromise = new Promise<T>((_, reject) => {
		timeoutId = setTimeout(() => reject(new Error("timeout")), timeoutMs);
	});
	return Promise.race([promise, timeoutPromise]).finally(() => {
		if (timeoutId) clearTimeout(timeoutId);
	});
}

async function getAuthHeaders(): Promise<{ Authorization: string; apikey: string }> {
	const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
	if (!anonKey) {
		throw new Error("EXPO_PUBLIC_SUPABASE_ANON_KEY is not configured");
	}
	const {
		data: { session },
	} = await supabase.auth.getSession();
	return {
		Authorization: `Bearer ${session?.access_token ?? anonKey}`,
		apikey: anonKey,
	};
}

function stateKey(fingerprint: string): string {
	return `${TUS_STATE_PREFIX}${fingerprint}`;
}

async function loadPersistedState(fingerprint: string): Promise<PersistedTusState | null> {
	try {
		const raw = await AsyncStorage.getItem(stateKey(fingerprint));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as PersistedTusState;
		if (!parsed?.tusUrl || typeof parsed.totalBytes !== "number") return null;
		return parsed;
	} catch (error) {
		logger.warn("TUS state read failed", error, { fingerprint });
		return null;
	}
}

async function savePersistedState(
	fingerprint: string,
	state: PersistedTusState
): Promise<void> {
	try {
		await AsyncStorage.setItem(stateKey(fingerprint), JSON.stringify(state));
	} catch (error) {
		logger.warn("TUS state write failed", error, { fingerprint });
	}
}

async function clearPersistedState(fingerprint: string): Promise<void> {
	try {
		await AsyncStorage.removeItem(stateKey(fingerprint));
	} catch (error) {
		logger.warn("TUS state clear failed", error, { fingerprint });
	}
}

export async function createTusUpload(args: {
	totalBytes: number;
	bucket: string;
	objectName: string;
	contentType: string;
	cacheControl?: string;
	upsert?: boolean;
}): Promise<string> {
	const { totalBytes, bucket, objectName, contentType, cacheControl, upsert } = args;
	const headers = await getAuthHeaders();
	const metadata = encodeTusMetadata({
		bucketName: bucket,
		objectName,
		contentType,
		cacheControl: cacheControl ?? "max-age=3600",
	});

	const response = await withTusTimeout(
		fetch(tusEndpoint(), {
			method: "POST",
			headers: {
				...headers,
				"Tus-Resumable": TUS_VERSION,
				"Upload-Length": String(totalBytes),
				"Upload-Metadata": metadata,
				"x-upsert": upsert ? "true" : "false",
			},
		}),
		TUS_CREATE_TIMEOUT_MS
	);

	if (response.status !== 201) {
		const body = await response.text().catch(() => "");
		const err = new Error(
			`TUS create failed (${response.status})${body ? `: ${body}` : ""}`
		) as Error & { httpStatus?: number };
		err.httpStatus = response.status;
		throw err;
	}

	const location = response.headers.get("location") ?? response.headers.get("Location");
	if (!location) {
		throw new Error("TUS create response missing Location header");
	}
	if (/^https?:\/\//i.test(location)) {
		return location;
	}
	const base = process.env.EXPO_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
	return location.startsWith("/") ? `${base}${location}` : `${base}/${location}`;
}

export async function getTusOffset(tusUrl: string): Promise<number> {
	const headers = await getAuthHeaders();
	const response = await withTusTimeout(
		fetch(tusUrl, {
			method: "HEAD",
			headers: {
				...headers,
				"Tus-Resumable": TUS_VERSION,
			},
		}),
		TUS_CREATE_TIMEOUT_MS
	);
	if (response.status === 404 || response.status === 410) {
		const err = new Error(`TUS upload no longer exists (${response.status})`) as Error & {
			httpStatus?: number;
		};
		err.httpStatus = response.status;
		throw err;
	}
	if (response.status < 200 || response.status >= 300) {
		const err = new Error(`TUS head failed (${response.status})`) as Error & {
			httpStatus?: number;
		};
		err.httpStatus = response.status;
		throw err;
	}
	const offsetHeader =
		response.headers.get("upload-offset") ?? response.headers.get("Upload-Offset");
	const offset = offsetHeader ? Number.parseInt(offsetHeader, 10) : Number.NaN;
	if (!Number.isFinite(offset) || offset < 0) {
		throw new Error("TUS head returned invalid Upload-Offset");
	}
	return offset;
}

function base64ToUint8Array(base64: string): Uint8Array {
	if (typeof Buffer !== "undefined") {
		return new Uint8Array(Buffer.from(base64, "base64"));
	}
	const binary = globalThis.atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export async function readFileChunk(
	fileUri: string,
	position: number,
	length: number
): Promise<Uint8Array> {
	const base64 = await readAsStringAsync(fileUri, {
		encoding: EncodingType.Base64,
		position,
		length,
	});
	return base64ToUint8Array(base64);
}

export async function uploadTusChunk(args: {
	tusUrl: string;
	chunk: Uint8Array;
	offset: number;
}): Promise<number> {
	const { tusUrl, chunk, offset } = args;
	const headers = await getAuthHeaders();
	const response = await withTusTimeout(
		fetch(tusUrl, {
			method: "PATCH",
			headers: {
				...headers,
				"Tus-Resumable": TUS_VERSION,
				"Upload-Offset": String(offset),
				"Content-Type": "application/offset+octet-stream",
			},
			body: chunk as any,
		}),
		TUS_CHUNK_TIMEOUT_MS
	);
	if (response.status !== 204 && response.status !== 200) {
		const body = await response.text().catch(() => "");
		const err = new Error(
			`TUS patch failed (${response.status})${body ? `: ${body}` : ""}`
		) as Error & { httpStatus?: number };
		err.httpStatus = response.status;
		throw err;
	}
	const nextOffsetHeader =
		response.headers.get("upload-offset") ?? response.headers.get("Upload-Offset");
	const nextOffset = nextOffsetHeader ? Number.parseInt(nextOffsetHeader, 10) : Number.NaN;
	if (!Number.isFinite(nextOffset) || nextOffset <= offset) {
		throw new Error("TUS patch returned non-advancing Upload-Offset");
	}
	return nextOffset;
}

function encodeObjectPath(objectName: string): string {
	return objectName
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
}

async function verifyObjectExists(args: {
	bucket: string;
	objectName: string;
}): Promise<void> {
	const { bucket, objectName } = args;
	const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
	if (!base) {
		throw new Error("EXPO_PUBLIC_SUPABASE_URL is not configured");
	}
	const headers = await getAuthHeaders();
	const url = `${base.replace(/\/$/, "")}/storage/v1/object/info/${bucket}/${encodeObjectPath(objectName)}`;
	const response = await withTusTimeout(
		fetch(url, { method: "GET", headers }),
		TUS_CREATE_TIMEOUT_MS
	);
	if (response.status >= 200 && response.status < 300) return;
	const err = new Error(
		`TUS verify: storage object missing at ${bucket}/${objectName} (status ${response.status})`
	) as Error & { httpStatus?: number };
	err.httpStatus = response.status;
	throw err;
}

export async function uploadMediaResumable(
	options: TusUploadOptions
): Promise<TusUploadResult> {
	const {
		fileUri,
		fileSize,
		bucket,
		objectName,
		contentType,
		cacheControl,
		upsert,
		fileFingerprint,
		signal,
		onProgress,
	} = options;

	if (fileSize <= 0) {
		throw new Error("TUS upload requires a positive fileSize");
	}

	const totalChunks = Math.ceil(fileSize / TUS_CHUNK_SIZE);
	const startedAt = Date.now();
	addUploadBreadcrumb("tus.start", {
		bucket,
		objectName,
		fileSize,
		totalChunks,
		chunkSize: TUS_CHUNK_SIZE,
		contentType,
	});

	const persisted = await loadPersistedState(fileFingerprint);
	let tusUrl: string;
	let offset = 0;

	if (persisted && persisted.totalBytes === fileSize) {
		try {
			offset = await getTusOffset(persisted.tusUrl);
			tusUrl = persisted.tusUrl;
			addUploadBreadcrumb("tus.resume.ok", {
				bucket,
				objectName,
				resumedOffset: offset,
				totalBytes: fileSize,
			});
		} catch (error) {
			addUploadBreadcrumb(
				"tus.resume.failed",
				{
					bucket,
					objectName,
					err: error instanceof Error ? error.message : String(error),
				},
				"warning"
			);
			await clearPersistedState(fileFingerprint);
			tusUrl = await createWithBreadcrumb();
			offset = 0;
			await savePersistedState(fileFingerprint, {
				tusUrl,
				totalBytes: fileSize,
				updatedAt: new Date().toISOString(),
			});
		}
	} else {
		if (persisted) {
			await clearPersistedState(fileFingerprint);
		}
		tusUrl = await createWithBreadcrumb();
		await savePersistedState(fileFingerprint, {
			tusUrl,
			totalBytes: fileSize,
			updatedAt: new Date().toISOString(),
		});
	}

	let chunkIndex = Math.floor(offset / TUS_CHUNK_SIZE);
	while (offset < fileSize) {
		if (signal?.aborted) {
			addUploadBreadcrumb("tus.aborted", { offset, fileSize }, "warning");
			throw new Error("TUS upload aborted");
		}
		const length = Math.min(TUS_CHUNK_SIZE, fileSize - offset);
		const chunkStart = Date.now();
		const chunk = await readFileChunk(fileUri, offset, length);
		const readMs = Date.now() - chunkStart;
		const patchStart = Date.now();
		let nextOffset: number;
		try {
			nextOffset = await uploadTusChunk({ tusUrl, chunk, offset });
		} catch (chunkError) {
			addUploadBreadcrumb(
				"tus.chunk.failed",
				{
					chunkIndex,
					of: totalChunks,
					offset,
					length,
					readMs,
					patchMs: Date.now() - patchStart,
					err: chunkError instanceof Error ? chunkError.message : String(chunkError),
					httpStatus:
						chunkError &&
						typeof chunkError === "object" &&
						"httpStatus" in chunkError
							? (chunkError as { httpStatus?: number }).httpStatus
							: undefined,
				},
				"error"
			);
			throw chunkError;
		}
		const patchMs = Date.now() - patchStart;
		addUploadBreadcrumb("tus.chunk.ok", {
			chunkIndex,
			of: totalChunks,
			from: offset,
			to: nextOffset,
			length,
			readMs,
			patchMs,
		});
		offset = nextOffset;
		chunkIndex += 1;
		onProgress?.(offset, fileSize);
		await savePersistedState(fileFingerprint, {
			tusUrl,
			totalBytes: fileSize,
			updatedAt: new Date().toISOString(),
		});
	}

	const verifyStart = Date.now();
	try {
		await verifyObjectExists({ bucket, objectName });
		addUploadBreadcrumb("tus.verify.ok", {
			bucket,
			objectName,
			elapsedMs: Date.now() - verifyStart,
		});
	} catch (verifyError) {
		const httpStatus =
			verifyError && typeof verifyError === "object" && "httpStatus" in verifyError
				? (verifyError as { httpStatus?: number }).httpStatus
				: undefined;
		addUploadBreadcrumb(
			"tus.verify.failed",
			{
				bucket,
				objectName,
				fileSize,
				totalChunks,
				elapsedMs: Date.now() - verifyStart,
				httpStatus,
				err: verifyError instanceof Error ? verifyError.message : String(verifyError),
			},
			"error"
		);
		await clearPersistedState(fileFingerprint);
		throw verifyError;
	}

	await clearPersistedState(fileFingerprint);
	const elapsedMs = Date.now() - startedAt;
	addUploadBreadcrumb("tus.done", {
		bucket,
		objectName,
		fileSize,
		elapsedMs,
		throughputKbps: elapsedMs > 0 ? Math.round((fileSize * 8) / elapsedMs) : null,
	});
	return { path: objectName };

	async function createWithBreadcrumb(): Promise<string> {
		const createStart = Date.now();
		try {
			const url = await createTusUpload({
				totalBytes: fileSize,
				bucket,
				objectName,
				contentType,
				cacheControl,
				upsert,
			});
			addUploadBreadcrumb("tus.create.ok", {
				bucket,
				objectName,
				elapsedMs: Date.now() - createStart,
			});
			return url;
		} catch (createError) {
			addUploadBreadcrumb(
				"tus.create.failed",
				{
					bucket,
					objectName,
					elapsedMs: Date.now() - createStart,
					err: createError instanceof Error ? createError.message : String(createError),
					httpStatus:
						createError &&
						typeof createError === "object" &&
						"httpStatus" in createError
							? (createError as { httpStatus?: number }).httpStatus
							: undefined,
				},
				"error"
			);
			throw createError;
		}
	}
}