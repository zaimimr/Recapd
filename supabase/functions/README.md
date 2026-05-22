# Supabase Edge Functions

## Functions

### 1. `cleanup-orphaned-storage`
Checks if storage bucket folders belong to existing events. Deletes orphaned folders that don't have a corresponding event.

**What it does:**
- Lists all folders in `event-photos` and `thumbnails` buckets
- Compares folder names (event IDs) against the `events` table
- Deletes all files in folders that don't belong to any event

### 2. `cleanup-expired-events`
Processes events that have passed their `expires_at` date.

**What it does:**
- Finds all events where `expires_at < now()` and status is not 'expired'
- Deletes all photos from `event-photos` bucket
- Deletes all thumbnails from `thumbnails` bucket  
- Deletes `media_items` records
- Deletes `event_participants` records
- Marks event status as 'expired' (preserves event record)

## Deployment

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref zfrpwfuihfpoqyexbwng

# Deploy functions
supabase functions deploy cleanup-orphaned-storage
supabase functions deploy cleanup-expired-events
```

## Setting up Cron Jobs

In your Supabase dashboard, go to **Database > Extensions** and enable `pg_cron`.

Then run the latest secure cron migration. It expects two Vault secrets:

```sql
SELECT vault.create_secret('YOUR_ANON_JWT_KEY', 'anon_key');
SELECT vault.create_secret('YOUR_RANDOM_CRON_SECRET', 'cron_secret');
```

After that, apply [`supabase/migrations/20260327_rotate_cron_jobs_to_secret_header.sql`](../migrations/20260327_rotate_cron_jobs_to_secret_header.sql).

## Manual Invocation

You can also invoke the functions manually:

```bash
# Via Supabase CLI
supabase functions invoke cleanup-expired-events
supabase functions invoke cleanup-orphaned-storage

# Via curl
curl -X POST 'https://zfrpwfuihfpoqyexbwng.supabase.co/functions/v1/cleanup-expired-events' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'x-cron-secret: YOUR_CRON_SECRET' \
  -H 'Content-Type: application/json'
```

## Response Format

Both functions return JSON with this structure:

```json
{
  "success": true,
  "message": "...",
  "results": {
    // Function-specific results
  }
}
```
