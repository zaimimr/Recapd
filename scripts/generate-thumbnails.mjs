#!/usr/bin/env node

/**
 * Migration Script: Generate Video Thumbnails
 *
 * This script generates thumbnails for existing videos in your Supabase storage
 * that don't have thumbnail_path set.
 *
 * Prerequisites:
 * - Node.js 18+
 * - FFmpeg installed locally (brew install ffmpeg)
 * - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 *
 * Usage:
 *   SUPABASE_URL=your_url SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/generate-thumbnails.mjs
 *
 * Or create a .env.local file with these values and use dotenv
 */

import { exec } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";

const execAsync = promisify(exec);

// Configuration
const BATCH_SIZE = 10;
const THUMBNAIL_TIME_SECONDS = 1; // Extract frame at 1 second
const THUMBNAIL_WIDTH = 480; // Thumbnail width (height auto-scaled)

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
	console.error(
		"Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required"
	);
	process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false,
	},
});

async function checkFfmpeg() {
	try {
		await execAsync("ffmpeg -version");
		return true;
	} catch {
		console.error("Error: FFmpeg is not installed. Please install it first:");
		console.error("  macOS: brew install ffmpeg");
		console.error("  Ubuntu: sudo apt install ffmpeg");
		return false;
	}
}

async function downloadVideo(signedUrl, localPath) {
	const response = await fetch(signedUrl);
	if (!response.ok) {
		throw new Error(`Failed to download video: ${response.statusText}`);
	}
	const buffer = await response.arrayBuffer();
	await fs.writeFile(localPath, Buffer.from(buffer));
}

async function generateThumbnail(videoPath, thumbnailPath) {
	// Use FFmpeg to extract a frame
	const command = `ffmpeg -i "${videoPath}" -ss ${THUMBNAIL_TIME_SECONDS} -vframes 1 -vf "scale=${THUMBNAIL_WIDTH}:-1" -q:v 2 -y "${thumbnailPath}"`;

	try {
		await execAsync(command);
		return true;
	} catch (error) {
		// If extracting at 1 second fails (video too short), try at 0 seconds
		try {
			const fallbackCommand = `ffmpeg -i "${videoPath}" -ss 0 -vframes 1 -vf "scale=${THUMBNAIL_WIDTH}:-1" -q:v 2 -y "${thumbnailPath}"`;
			await execAsync(fallbackCommand);
			return true;
		} catch {
			throw new Error(`FFmpeg failed: ${error.message}`);
		}
	}
}

function getThumbnailStoragePath(videoPath) {
	const pathParts = videoPath.split(".");
	pathParts.pop();
	return `${pathParts.join(".")}_thumb.jpg`;
}

async function processVideo(video, tempDir) {
	const videoLocalPath = path.join(tempDir, `video_${video.id}.mp4`);
	const thumbnailLocalPath = path.join(tempDir, `thumb_${video.id}.jpg`);

	try {
		// Get signed URL for the video
		const { data: signedUrlData, error: signedUrlError } = await supabase.storage
			.from("event-photos")
			.createSignedUrl(video.storage_path, 3600);

		if (signedUrlError || !signedUrlData?.signedUrl) {
			throw new Error(`Failed to get signed URL: ${signedUrlError?.message}`);
		}

		// Download video
		console.log(`  Downloading video...`);
		await downloadVideo(signedUrlData.signedUrl, videoLocalPath);

		// Generate thumbnail
		console.log(`  Generating thumbnail...`);
		await generateThumbnail(videoLocalPath, thumbnailLocalPath);

		// Read thumbnail file
		const thumbnailBuffer = await fs.readFile(thumbnailLocalPath);
		const thumbnailStoragePath = getThumbnailStoragePath(video.storage_path);

		// Upload thumbnail to Supabase
		console.log(`  Uploading thumbnail...`);
		const { data: uploadData, error: uploadError } = await supabase.storage
			.from("event-photos")
			.upload(thumbnailStoragePath, thumbnailBuffer, {
				contentType: "image/jpeg",
				upsert: true, // Overwrite if exists
			});

		if (uploadError) {
			throw new Error(`Failed to upload thumbnail: ${uploadError.message}`);
		}

		// Update database
		const finalPath = uploadData?.path || thumbnailStoragePath;
		const { error: updateError } = await supabase
			.from("media_items")
			.update({ thumbnail_path: finalPath })
			.eq("id", video.id);

		if (updateError) {
			throw new Error(`Failed to update database: ${updateError.message}`);
		}

		return { success: true, thumbnailPath: finalPath };
	} finally {
		// Cleanup temp files
		try {
			await fs.unlink(videoLocalPath).catch(() => {});
			await fs.unlink(thumbnailLocalPath).catch(() => {});
		} catch {
			// Ignore cleanup errors
		}
	}
}

async function main() {
	console.log("🎬 Video Thumbnail Generator");
	console.log("============================\n");

	// Check FFmpeg
	if (!(await checkFfmpeg())) {
		process.exit(1);
	}

	// Create temp directory
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "recapd-thumbnails-"));
	console.log(`Using temp directory: ${tempDir}\n`);

	const results = {
		total: 0,
		succeeded: 0,
		failed: 0,
		errors: [],
	};

	try {
		// Get count of videos without thumbnails
		const { count, error: countError } = await supabase
			.from("media_items")
			.select("id", { count: "exact", head: true })
			.eq("media_type", "video")
			.is("thumbnail_path", null);

		if (countError) {
			throw new Error(`Failed to count videos: ${countError.message}`);
		}

		console.log(`Found ${count} videos without thumbnails\n`);

		if (count === 0) {
			console.log("✅ All videos already have thumbnails!");
			return;
		}

		let processed = 0;

		while (processed < count) {
			// Fetch batch of videos
			const { data: videos, error: fetchError } = await supabase
				.from("media_items")
				.select("id, storage_path, event_id")
				.eq("media_type", "video")
				.is("thumbnail_path", null)
				.limit(BATCH_SIZE);

			if (fetchError) {
				throw new Error(`Failed to fetch videos: ${fetchError.message}`);
			}

			if (!videos || videos.length === 0) {
				break;
			}

			for (const video of videos) {
				results.total++;
				processed++;
				console.log(`[${processed}/${count}] Processing video ${video.id}...`);

				try {
					const result = await processVideo(video, tempDir);
					results.succeeded++;
					console.log(`  ✅ Created: ${result.thumbnailPath}\n`);
				} catch (error) {
					results.failed++;
					const errorMsg = error.message || "Unknown error";
					results.errors.push({ videoId: video.id, error: errorMsg });
					console.log(`  ❌ Failed: ${errorMsg}\n`);
				}
			}
		}

		// Print summary
		console.log("\n============================");
		console.log("📊 Summary");
		console.log("============================");
		console.log(`Total processed: ${results.total}`);
		console.log(`Succeeded: ${results.succeeded}`);
		console.log(`Failed: ${results.failed}`);

		if (results.errors.length > 0) {
			console.log("\nErrors:");
			for (const err of results.errors) {
				console.log(`  - Video ${err.videoId}: ${err.error}`);
			}
		}
	} finally {
		// Cleanup temp directory
		try {
			await fs.rm(tempDir, { recursive: true });
		} catch {
			// Ignore cleanup errors
		}
	}
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
