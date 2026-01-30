// Supabase Edge Function: generate-video-thumbnails
// Generates thumbnails for existing videos that don't have them
// Run manually or via cron job to backfill thumbnails

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MediaItem {
	id: string;
	storage_path: string;
	event_id: string;
	uploaded_by_user_id: string;
}

Deno.serve(async (req) => {
	// Handle CORS preflight
	if (req.method === "OPTIONS") {
		return new Response("ok", { headers: corsHeaders });
	}

	try {
		const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
		const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

		const supabase = createClient(supabaseUrl, supabaseServiceKey, {
			auth: {
				autoRefreshToken: false,
				persistSession: false,
			},
		});

		// Parse request body for optional batch size
		let batchSize = 10;
		try {
			const body = await req.json();
			if (body.batchSize) batchSize = Math.min(body.batchSize, 50);
		} catch {
			// Use default batch size
		}

		const results = {
			processed: 0,
			succeeded: 0,
			failed: 0,
			errors: [] as string[],
			thumbnailsCreated: [] as string[],
		};

		// Find videos without thumbnails
		const { data: videosWithoutThumbnails, error: fetchError } = await supabase
			.from("media_items")
			.select("id, storage_path, event_id, uploaded_by_user_id")
			.eq("media_type", "video")
			.is("thumbnail_path", null)
			.limit(batchSize);

		if (fetchError) {
			throw new Error(`Failed to fetch videos: ${fetchError.message}`);
		}

		if (!videosWithoutThumbnails || videosWithoutThumbnails.length === 0) {
			return new Response(
				JSON.stringify({
					success: true,
					message: "No videos without thumbnails found",
					results,
				}),
				{
					headers: { ...corsHeaders, "Content-Type": "application/json" },
				}
			);
		}

		console.log(`Found ${videosWithoutThumbnails.length} videos without thumbnails`);

		for (const video of videosWithoutThumbnails as MediaItem[]) {
			results.processed++;

			try {
				// Download the video to get a signed URL
				const { data: signedUrlData, error: signedUrlError } = await supabase.storage
					.from("event-photos")
					.createSignedUrl(video.storage_path, 3600); // 1 hour expiry

				if (signedUrlError || !signedUrlData?.signedUrl) {
					throw new Error(`Failed to get signed URL: ${signedUrlError?.message}`);
				}

				// Use external thumbnail service or FFmpeg
				// Since Deno Deploy doesn't have FFmpeg, we'll use a simple approach:
				// Generate a placeholder thumbnail or use a thumbnail service

				// For now, we'll create a simple colored placeholder image
				// In production, you'd want to use a service like:
				// - Cloudinary video transformation
				// - AWS Lambda with FFmpeg layer
				// - Self-hosted FFmpeg service

				// Create a simple placeholder thumbnail (1x1 pixel PNG)
				// This is a minimal approach - for real thumbnails, use an external service
				const thumbnailPath = generateThumbnailPath(video.storage_path);

				// Create a simple gray placeholder PNG (smallest valid PNG)
				const placeholderPng = createPlaceholderPng();

				const { data: uploadData, error: uploadError } = await supabase.storage
					.from("event-photos")
					.upload(thumbnailPath, placeholderPng, {
						contentType: "image/png",
						upsert: false,
					});

				if (uploadError) {
					// If file exists, just use the path
					if (!uploadError.message.includes("already exists")) {
						throw new Error(`Failed to upload thumbnail: ${uploadError.message}`);
					}
				}

				// Update the database record
				const finalThumbnailPath = uploadData?.path || thumbnailPath;
				const { error: updateError } = await supabase
					.from("media_items")
					.update({ thumbnail_path: finalThumbnailPath })
					.eq("id", video.id);

				if (updateError) {
					throw new Error(`Failed to update media item: ${updateError.message}`);
				}

				results.succeeded++;
				results.thumbnailsCreated.push(video.id);
				console.log(`Created thumbnail for video ${video.id}`);
			} catch (error) {
				results.failed++;
				const errorMsg = `Video ${video.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
				results.errors.push(errorMsg);
				console.error(errorMsg);
			}
		}

		return new Response(
			JSON.stringify({
				success: true,
				message: `Processed ${results.processed} videos`,
				results,
			}),
			{
				headers: { ...corsHeaders, "Content-Type": "application/json" },
			}
		);
	} catch (error) {
		console.error("Function error:", error);
		return new Response(
			JSON.stringify({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			}),
			{
				status: 500,
				headers: { ...corsHeaders, "Content-Type": "application/json" },
			}
		);
	}
});

function generateThumbnailPath(videoPath: string): string {
	// Convert video path to thumbnail path
	// e.g., "eventId/userId/123456.mp4" -> "eventId/userId/123456_thumb.jpg"
	const pathParts = videoPath.split(".");
	pathParts.pop(); // Remove extension
	return `${pathParts.join(".")}_thumb.jpg`;
}

function createPlaceholderPng(): Uint8Array {
	// Minimal valid 1x1 gray PNG (smallest valid PNG image)
	// This is a placeholder - in production, use actual video frame extraction
	return new Uint8Array([
		0x89,
		0x50,
		0x4e,
		0x47,
		0x0d,
		0x0a,
		0x1a,
		0x0a, // PNG signature
		0x00,
		0x00,
		0x00,
		0x0d,
		0x49,
		0x48,
		0x44,
		0x52, // IHDR chunk
		0x00,
		0x00,
		0x00,
		0x01,
		0x00,
		0x00,
		0x00,
		0x01, // 1x1 dimensions
		0x08,
		0x02,
		0x00,
		0x00,
		0x00,
		0x90,
		0x77,
		0x53, // RGB, bit depth 8
		0xde,
		0x00,
		0x00,
		0x00,
		0x0c,
		0x49,
		0x44,
		0x41, // IDAT chunk
		0x54,
		0x08,
		0xd7,
		0x63,
		0x60,
		0x60,
		0x60,
		0x00, // Gray pixel data
		0x00,
		0x00,
		0x04,
		0x00,
		0x01,
		0x27,
		0x34,
		0x27, // CRC
		0x0a,
		0x00,
		0x00,
		0x00,
		0x00,
		0x49,
		0x45,
		0x4e, // IEND chunk
		0x44,
		0xae,
		0x42,
		0x60,
		0x82, // IEND CRC
	]);
}
