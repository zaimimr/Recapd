import { spawn } from "node:child_process";
import { createHash, timingSafeEqual } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import express from "express";

const {
	SUPABASE_URL,
	SUPABASE_SERVICE_ROLE_KEY,
	WORKER_SECRET,
	PORT = "8080",
	SOURCE_BUCKET = "event-photos",
	RENDITIONS_BUCKET = "video-renditions",
	THUMBS_BUCKET = "thumbnails",
	MAX_CONCURRENCY = "2",
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !WORKER_SECRET) {
	console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or WORKER_SECRET");
	process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { autoRefreshToken: false, persistSession: false },
});

const maxConcurrency = Math.max(1, Number.parseInt(MAX_CONCURRENCY, 10) || 2);
let active = 0;
const queue = [];
const inFlight = new Set();

function secretMatches(provided) {
	if (!provided) return false;
	const a = createHash("sha256").update(provided).digest();
	const b = createHash("sha256").update(WORKER_SECRET).digest();
	return timingSafeEqual(a, b);
}

function stripExtension(path) {
	return path.replace(/\.[^./]+$/, "");
}

function runFfmpeg(args) {
	return new Promise((resolve, reject) => {
		const proc = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
		let stderr = "";
		proc.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		proc.on("error", reject);
		proc.on("close", (code) => {
			if (code === 0) resolve();
			else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
		});
	});
}

async function transcodeTo720p(inputPath, outputPath) {
	await runFfmpeg([
		"-i",
		inputPath,
		"-vf",
		"scale=w=1280:h=720:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
		"-c:v",
		"libx264",
		"-preset",
		"veryfast",
		"-crf",
		"24",
		"-maxrate",
		"2500k",
		"-bufsize",
		"5000k",
		"-pix_fmt",
		"yuv420p",
		"-c:a",
		"aac",
		"-b:a",
		"128k",
		"-movflags",
		"+faststart",
		outputPath,
	]);
}

async function extractPoster(inputPath, outputPath) {
	await runFfmpeg([
		"-ss",
		"0.1",
		"-i",
		inputPath,
		"-frames:v",
		"1",
		"-vf",
		"scale=w=512:h=512:force_original_aspect_ratio=decrease",
		"-q:v",
		"4",
		outputPath,
	]);
}

async function setStatus(id, fields) {
	const { error } = await supabase.from("media_items").update(fields).eq("id", id);
	if (error) throw new Error(`media_items update failed: ${error.message}`);
}

async function needsPoster(id) {
	const { data } = await supabase
		.from("media_items")
		.select("thumbnail_path")
		.eq("id", id)
		.maybeSingle();
	return !data?.thumbnail_path;
}

async function processVideo(record) {
	const { id, storage_path: storagePath } = record;
	if (!id || !storagePath) return;
	if (inFlight.has(id)) return;
	inFlight.add(id);

	const work = join(await mkdtemp(join(tmpdir(), "recapd-")), "");
	const inputPath = join(work, "input");
	const renditionPath = join(work, "720p.mp4");
	const posterPath = join(work, "poster.jpg");

	try {
		await setStatus(id, { video_status: "processing" });

		const { data: signed, error: signErr } = await supabase.storage
			.from(SOURCE_BUCKET)
			.createSignedUrl(storagePath, 60 * 60);
		if (signErr || !signed?.signedUrl) {
			throw new Error(`signed URL failed: ${signErr?.message ?? "unknown"}`);
		}

		const res = await fetch(signed.signedUrl);
		if (!res.ok) throw new Error(`download failed: ${res.status}`);
		const buf = Buffer.from(await res.arrayBuffer());
		await writeFile(inputPath, buf);

		await transcodeTo720p(inputPath, renditionPath);

		const base = stripExtension(storagePath);
		const renditionObject = `${base}_720p.mp4`;
		const renditionBytes = await readFile(renditionPath);
		const up = await supabase.storage
			.from(RENDITIONS_BUCKET)
			.upload(renditionObject, renditionBytes, { contentType: "video/mp4", upsert: true });
		if (up.error) throw new Error(`rendition upload failed: ${up.error.message}`);

		const fields = {
			rendition_path: renditionObject,
			video_status: "ready",
			video_processed_at: new Date().toISOString(),
		};

		if (await needsPoster(id)) {
			try {
				await extractPoster(inputPath, posterPath);
				const posterObject = `${base}_thumb.jpg`;
				const posterBytes = await readFile(posterPath);
				const pUp = await supabase.storage
					.from(THUMBS_BUCKET)
					.upload(posterObject, posterBytes, { contentType: "image/jpeg", upsert: true });
				if (!pUp.error) fields.thumbnail_path = posterObject;
			} catch (posterErr) {
				console.warn(`[${id}] poster failed: ${posterErr.message}`);
			}
		}

		await setStatus(id, fields);
		const sizeMb = ((await stat(renditionPath)).size / (1024 * 1024)).toFixed(1);
		console.log(`[${id}] ready -> ${renditionObject} (${sizeMb} MB)`);
	} catch (err) {
		console.error(`[${id}] failed: ${err.message}`);
		try {
			await setStatus(id, { video_status: "failed" });
		} catch {}
	} finally {
		inFlight.delete(id);
		await rm(work, { recursive: true, force: true }).catch(() => {});
	}
}

function enqueue(record) {
	queue.push(record);
	drain();
}

function drain() {
	while (active < maxConcurrency && queue.length > 0) {
		const record = queue.shift();
		active++;
		processVideo(record).finally(() => {
			active--;
			drain();
		});
	}
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
	res.json({ ok: true, active, queued: queue.length });
});

app.post("/", (req, res) => {
	if (!secretMatches(req.header("x-worker-secret"))) {
		return res.status(401).json({ error: "unauthorized" });
	}
	const { id, storage_path, event_id } = req.body ?? {};
	if (!id || !storage_path) {
		return res.status(400).json({ error: "id and storage_path required" });
	}
	enqueue({ id, storage_path, event_id });
	res.status(202).json({ accepted: true });
});

app.post("/backfill", async (req, res) => {
	if (!secretMatches(req.header("x-worker-secret"))) {
		return res.status(401).json({ error: "unauthorized" });
	}
	const limit = Math.min(Number.parseInt(req.body?.limit, 10) || 50, 500);
	const { data, error } = await supabase
		.from("media_items")
		.select("id, storage_path, event_id")
		.eq("media_type", "video")
		.eq("video_status", "pending")
		.is("deleted_at", null)
		.limit(limit);
	if (error) return res.status(500).json({ error: error.message });
	for (const record of data ?? []) enqueue(record);
	res.json({ enqueued: data?.length ?? 0 });
});

app.listen(Number.parseInt(PORT, 10), () => {
	console.log(`recapd-transcode-worker listening on :${PORT} (concurrency ${maxConcurrency})`);
});
