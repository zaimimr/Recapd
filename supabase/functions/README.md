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
- Updates event status to 'expired'

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

Then run these SQL commands to schedule the functions:

```sql
-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule cleanup-expired-events to run daily at 3:00 AM UTC
SELECT cron.schedule(
  'cleanup-expired-events',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://zfrpwfuihfpoqyexbwng.supabase.co/functions/v1/cleanup-expired-events',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Schedule cleanup-orphaned-storage to run weekly on Sundays at 4:00 AM UTC
SELECT cron.schedule(
  'cleanup-orphaned-storage',
  '0 4 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://zfrpwfuihfpoqyexbwng.supabase.co/functions/v1/cleanup-orphaned-storage',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- View scheduled jobs
SELECT * FROM cron.job;

-- To remove a scheduled job
-- SELECT cron.unschedule('cleanup-expired-events');
```

## Manual Invocation

You can also invoke the functions manually:

```bash
# Via Supabase CLI
supabase functions invoke cleanup-expired-events
supabase functions invoke cleanup-orphaned-storage

# Via curl
curl -X POST 'https://zfrpwfuihfpoqyexbwng.supabase.co/functions/v1/cleanup-expired-events' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
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
