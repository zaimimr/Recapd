// Supabase Edge Function: cleanup-expired-events
// Checks all events past expires_at and cleans up their data
// Run via cron job (recommended: daily)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
	// Handle CORS preflight
	if (req.method === "OPTIONS") {
		return new Response("ok", { headers: corsHeaders });
	}

	try {
		// Create Supabase client with service role key for admin access
		const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
		const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

		const supabase = createClient(supabaseUrl, supabaseServiceKey, {
			auth: {
				autoRefreshToken: false,
				persistSession: false,
			},
		});

		const results = {
			expiredEvents: [] as { id: string; title: string; expires_at: string }[],
			deletedPhotos: 0,
			deletedThumbnails: 0,
			deletedMediaItems: 0,
			deletedParticipants: 0,
			updatedEvents: 0,
			errors: [] as string[],
		};

		// Find all events that have expired
		const { data: expiredEvents, error: eventsError } = await supabase
			.from("events")
			.select("id, title, expires_at, status")
			.lt("expires_at", new Date().toISOString())
			.neq("status", "expired"); // Don't process already expired events

		if (eventsError) {
			throw new Error(`Failed to fetch expired events: ${eventsError.message}`);
		}

		if (!expiredEvents || expiredEvents.length === 0) {
			return new Response(
				JSON.stringify({
					success: true,
					message: "No expired events found",
					results,
				}),
				{
					headers: { ...corsHeaders, "Content-Type": "application/json" },
					status: 200,
				}
			);
		}

		console.log(`Found ${expiredEvents.length} expired events to clean up`);

		for (const event of expiredEvents) {
			console.log(`Processing expired event: ${event.title} (${event.id})`);

			results.expiredEvents.push({
				id: event.id,
				title: event.title,
				expires_at: event.expires_at,
			});

			// 1. Get all media items for this event
			const { data: mediaItems, error: mediaError } = await supabase
				.from("media_items")
				.select("id, storage_path, thumbnail_path")
				.eq("event_id", event.id);

			if (mediaError) {
				results.errors.push(`Failed to fetch media for event ${event.id}: ${mediaError.message}`);
				continue;
			}

			// 2. Delete photos from storage bucket
			if (mediaItems && mediaItems.length > 0) {
				const photoPaths = mediaItems.map((m) => m.storage_path).filter((p): p is string => !!p);

				if (photoPaths.length > 0) {
					const { error: photoDeleteError } = await supabase.storage
						.from("event-photos")
						.remove(photoPaths);

					if (photoDeleteError) {
						results.errors.push(
							`Failed to delete photos for event ${event.id}: ${photoDeleteError.message}`
						);
					} else {
						results.deletedPhotos += photoPaths.length;
						console.log(`Deleted ${photoPaths.length} photos for event ${event.id}`);
					}
				}

				// 3. Delete thumbnails from storage bucket
				const thumbnailPaths = mediaItems
					.map((m) => m.thumbnail_path)
					.filter((p): p is string => !!p);

				if (thumbnailPaths.length > 0) {
					const { error: thumbDeleteError } = await supabase.storage
						.from("thumbnails")
						.remove(thumbnailPaths);

					if (thumbDeleteError) {
						results.errors.push(
							`Failed to delete thumbnails for event ${event.id}: ${thumbDeleteError.message}`
						);
					} else {
						results.deletedThumbnails += thumbnailPaths.length;
					}
				}

				// 4. Delete media_items records
				const { error: mediaItemsDeleteError } = await supabase
					.from("media_items")
					.delete()
					.eq("event_id", event.id)
					.select("*", { count: "exact", head: true });

				if (mediaItemsDeleteError) {
					results.errors.push(
						`Failed to delete media_items for event ${event.id}: ${mediaItemsDeleteError.message}`
					);
				} else {
					results.deletedMediaItems += mediaItems.length;
				}
			}

			// 5. Delete event participants
			const { error: participantsDeleteError } = await supabase
				.from("event_participants")
				.delete()
				.eq("event_id", event.id);

			if (participantsDeleteError) {
				results.errors.push(
					`Failed to delete participants for event ${event.id}: ${participantsDeleteError.message}`
				);
			} else {
				results.deletedParticipants++;
			}

			// 6. Update event status to 'expired' (keep event record for reference)
			const { error: updateError } = await supabase
				.from("events")
				.update({ status: "expired" })
				.eq("id", event.id);

			if (updateError) {
				results.errors.push(
					`Failed to update event status for ${event.id}: ${updateError.message}`
				);
			} else {
				results.updatedEvents++;
				console.log(`Marked event ${event.id} as expired`);
			}
		}

		console.log(`Cleanup complete. Processed ${results.expiredEvents.length} expired events`);

		return new Response(
			JSON.stringify({
				success: true,
				message: `Processed ${results.expiredEvents.length} expired events`,
				results,
			}),
			{
				headers: { ...corsHeaders, "Content-Type": "application/json" },
				status: 200,
			}
		);
	} catch (error) {
		console.error("Cleanup error:", error);

		return new Response(
			JSON.stringify({
				success: false,
				error: error.message,
			}),
			{
				headers: { ...corsHeaders, "Content-Type": "application/json" },
				status: 500,
			}
		);
	}
});
