import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { parseVideoTrack, type VideoTrackInfo } from "./mp4.ts";

const STORAGE_BUCKET = "event-photos";
const TARGET_SEGMENT_SECONDS = 6;
const HEAD_BYTES = 5 * 1024 * 1024;
const TAIL_BYTES = 5 * 1024 * 1024;
const MANIFEST_VERSION = 1;
const KEYFRAMES_SUFFIX = ".hls.json";

interface MediaItemRecord {
	id: string;
	storage_path: string;
	media_type: string;
	hls_path: string | null;
}

interface WebhookPayload {
	type: string;
	table?: string;
	record?: MediaItemRecord;
}

interface KeyframeManifest {
	version: number;
	totalSize: number;
	duration: number;
	segments: Array<{ offset: number; length: number; duration: number }>;
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

async function downloadRange(url: string, start: number, end: number): Promise<ArrayBuffer> {
	const response = await fetch(url, {
		headers: { Range: `bytes=${start}-${end}` },
	});
	if (!response.ok && response.status !== 206) {
		throw new Error(`Storage range fetch failed: ${response.status}`);
	}
	return await response.arrayBuffer();
}

async function getObjectSize(url: string): Promise<number> {
	const response = await fetch(url, { method: "HEAD" });
	if (!response.ok) {
		throw new Error(`HEAD failed: ${response.status}`);
	}
	const length = response.headers.get("content-length");
	if (!length) throw new Error("Content-Length missing on storage HEAD");
	return Number.parseInt(length, 10);
}

async function readMp4Track(signedUrl: string, totalSize: number): Promise<VideoTrackInfo> {
	const headEnd = Math.min(HEAD_BYTES, totalSize) - 1;
	const headBuffer = await downloadRange(signedUrl, 0, headEnd);
	const headInfo = parseVideoTrack(headBuffer, 0);
	if (headInfo) return headInfo;

	if (totalSize <= HEAD_BYTES) {
		throw new Error("moov not found in small file");
	}

	const tailStart = Math.max(0, totalSize - TAIL_BYTES);
	const tailBuffer = await downloadRange(signedUrl, tailStart, totalSize - 1);
	const tailInfo = parseVideoTrack(tailBuffer, tailStart);
	if (tailInfo) return tailInfo;

	throw new Error("moov box not found in head or tail of file");
}

function buildSegmentList(track: VideoTrackInfo): KeyframeManifest {
	const sortedKeys = [...track.keyframes].sort((a, b) => a.byteOffset - b.byteOffset);
	if (sortedKeys.length === 0) {
		return {
			version: MANIFEST_VERSION,
			totalSize: track.totalByteSize,
			duration: track.durationSeconds,
			segments: [],
		};
	}

	const segments: KeyframeManifest["segments"] = [];
	let currentStart = sortedKeys[0];
	let currentEnd = currentStart;

	for (let i = 1; i < sortedKeys.length; i++) {
		const candidate = sortedKeys[i];
		const tentativeDuration = candidate.timestampSeconds - currentStart.timestampSeconds;
		if (tentativeDuration >= TARGET_SEGMENT_SECONDS) {
			const length = candidate.byteOffset - currentStart.byteOffset;
			segments.push({
				offset: currentStart.byteOffset,
				length,
				duration: candidate.timestampSeconds - currentStart.timestampSeconds,
			});
			currentStart = candidate;
		}
		currentEnd = candidate;
	}

	const lastByteOffset = currentEnd.byteOffset + currentEnd.byteLength;
	segments.push({
		offset: currentStart.byteOffset,
		length: lastByteOffset - currentStart.byteOffset,
		duration: Math.max(0.5, track.durationSeconds - currentStart.timestampSeconds),
	});

	return {
		version: MANIFEST_VERSION,
		totalSize: track.totalByteSize,
		duration: track.durationSeconds,
		segments,
	};
}

function deriveManifestPath(storagePath: string): string {
	return `${storagePath}${KEYFRAMES_SUFFIX}`;
}

async function processSingleRecord(record: MediaItemRecord, requestId: string): Promise<void> {
	if (record.media_type !== "video") {
		console.log(`[${requestId}] skip non-video ${record.id}`);
		return;
	}
	if (record.hls_path) {
		console.log(`[${requestId}] already processed ${record.id}`);
		return;
	}

	const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
	const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
	const supabase = createClient(supabaseUrl, serviceKey, {
		auth: { autoRefreshToken: false, persistSession: false },
	});

	const { data: signed, error: signedError } = await supabase.storage
		.from(STORAGE_BUCKET)
		.createSignedUrl(record.storage_path, 60 * 30);
	if (signedError || !signed?.signedUrl) {
		throw new Error(`signed URL failed: ${signedError?.message ?? "unknown"}`);
	}

	const totalSize = await getObjectSize(signed.signedUrl);
	const track = await readMp4Track(signed.signedUrl, totalSize);
	const manifest = buildSegmentList(track);

	if (manifest.segments.length === 0) {
		console.warn(`[${requestId}] no segments derived for ${record.id}; skipping`);
		return;
	}

	const manifestPath = deriveManifestPath(record.storage_path);
	const body = new Blob([JSON.stringify(manifest)], { type: "application/json" });
	const { error: uploadError } = await supabase.storage
		.from(STORAGE_BUCKET)
		.upload(manifestPath, body, { contentType: "application/json", upsert: true });
	if (uploadError) {
		throw new Error(`manifest upload failed: ${uploadError.message}`);
	}

	const { error: updateError } = await supabase
		.from("media_items")
		.update({ hls_path: manifestPath })
		.eq("id", record.id);
	if (updateError) {
		throw new Error(`media_items update failed: ${updateError.message}`);
	}

	console.log(
		`[${requestId}] processed ${record.id}: ${manifest.segments.length} segments, ${manifest.duration.toFixed(1)}s`
	);
}

Deno.serve(async (req) => {
	const requestId = crypto.randomUUID().slice(0, 8);
	const webhookSecret = Deno.env.get("HLS_WEBHOOK_SECRET");
	if (webhookSecret && req.headers.get("x-webhook-secret") !== webhookSecret) {
		return jsonResponse({ success: false, error: "Unauthorized" }, 401);
	}

	let payload: WebhookPayload;
	try {
		payload = await req.json();
	} catch {
		return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
	}

	if (!payload.record || typeof payload.record.id !== "string") {
		return jsonResponse({ success: false, error: "Missing record" }, 400);
	}

	try {
		await processSingleRecord(payload.record, requestId);
		return jsonResponse({ success: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown";
		console.error(`[${requestId}] failed: ${message}`);
		return jsonResponse({ success: false, error: message }, 500);
	}
});
