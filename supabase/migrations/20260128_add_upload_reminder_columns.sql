-- Migration: Add columns for daily upload reminder feature
-- Run this in Supabase SQL Editor

-- Add columns to event_participants table
ALTER TABLE event_participants
ADD COLUMN IF NOT EXISTS no_photos_to_upload BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ DEFAULT NULL;

-- Add index for efficient querying of participants who need reminders
CREATE INDEX IF NOT EXISTS idx_event_participants_reminder
ON event_participants (event_id, no_photos_to_upload, last_reminder_sent_at)
WHERE no_photos_to_upload = FALSE;

-- Schedule the daily upload reminder cron job (runs every hour)
-- This checks which events are at 09:00 in their local timezone
SELECT cron.schedule(
  'daily-upload-reminder',
  '0 * * * *',  -- Every hour at :00
  $$
  SELECT net.http_post(
    url := 'https://zfrpwfuihfpoqyexbwng.supabase.co/functions/v1/daily-upload-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
