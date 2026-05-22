// Supabase Edge Function: cleanup-orphaned-storage
// Checks if storage bucket folders belong to existing events, deletes orphaned ones
// Run via cron job or manually

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = {
	"Content-Type": "application/json",
};
const CRON_SECRET_HEADER = "x-cron-secret";

Deno.serve(async (req) => {
	const cronSecret = Deno.env.get("CRON_SECRET");
	if (!cronSecret || req.headers.get(CRON_SECRET_HEADER) !== cronSecret) {
		return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
			headers: jsonHeaders,
			status: 401,
		});
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
			checkedFolders: 0,
			deletedFolders: [] as string[],
			deletedFiles: 0,
			errors: [] as string[],
		};

		// Get all existing event IDs
		const { data: events, error: eventsError } = await supabase.from("events").select("id");

		if (eventsError) {
			throw new Error(`Failed to fetch events: ${eventsError.message}`);
		}

		const existingEventIds = new Set(events?.map((e) => e.id) || []);
		console.log(`Found ${existingEventIds.size} existing events`);

		// List all folders in event-photos bucket
		// Storage structure: event-photos/{eventId}/{filename}
		const { data: folders, error: listError } = await supabase.storage
			.from("event-photos")
			.list("", {
				limit: 1000,
				offset: 0,
			});

		if (listError) {
			throw new Error(`Failed to list storage folders: ${listError.message}`);
		}

		// Check each folder (eventId) against existing events
		for (const folder of folders || []) {
			// Skip if it's a file, not a folder (folders have no metadata)
			if (folder.metadata) continue;

			results.checkedFolders++;
			const eventId = folder.name;

			// If this folder doesn't correspond to an existing event, delete it
			if (!existingEventIds.has(eventId)) {
				console.log(`Orphaned folder found: ${eventId}`);

				// List all files in the orphaned folder
				const { data: files, error: filesError } = await supabase.storage
					.from("event-photos")
					.list(eventId, { limit: 1000 });

				if (filesError) {
					results.errors.push(`Failed to list files in ${eventId}: ${filesError.message}`);
					continue;
				}

				// Delete all files in the folder
				if (files && files.length > 0) {
					const filePaths = files.map((f) => `${eventId}/${f.name}`);

					const { error: deleteError } = await supabase.storage
						.from("event-photos")
						.remove(filePaths);

					if (deleteError) {
						results.errors.push(`Failed to delete files in ${eventId}: ${deleteError.message}`);
					} else {
						results.deletedFiles += filePaths.length;
						results.deletedFolders.push(eventId);
						console.log(`Deleted ${filePaths.length} files from orphaned folder: ${eventId}`);
					}
				} else {
					results.deletedFolders.push(eventId);
				}
			}
		}

		// Also check thumbnails bucket
		const { data: thumbFolders, error: thumbListError } = await supabase.storage
			.from("thumbnails")
			.list("", { limit: 1000, offset: 0 });

		if (!thumbListError && thumbFolders) {
			for (const folder of thumbFolders) {
				if (folder.metadata) continue;

				const eventId = folder.name;

				if (!existingEventIds.has(eventId)) {
					const { data: files } = await supabase.storage
						.from("thumbnails")
						.list(eventId, { limit: 1000 });

					if (files && files.length > 0) {
						const filePaths = files.map((f) => `${eventId}/${f.name}`);

						const { error: deleteError } = await supabase.storage
							.from("thumbnails")
							.remove(filePaths);

						if (!deleteError) {
							results.deletedFiles += filePaths.length;
							console.log(
								`Deleted ${filePaths.length} thumbnails from orphaned folder: ${eventId}`
							);
						}
					}
				}
			}
		}

		console.log(
			`Cleanup complete. Checked ${results.checkedFolders} folders, deleted ${results.deletedFolders.length} orphaned folders with ${results.deletedFiles} files`
		);

		return new Response(
			JSON.stringify({
				success: true,
				message: "Storage cleanup completed",
				results,
			}),
			{
				headers: jsonHeaders,
				status: 200,
			}
		);
	} catch (error) {
		console.error("Cleanup error", error);

		return new Response(
			JSON.stringify({
				success: false,
				error: "Internal server error",
			}),
			{
				headers: jsonHeaders,
				status: 500,
			}
		);
	}
});
