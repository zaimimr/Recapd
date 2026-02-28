-- Migration: Add cron jobs for cleanup-expired-events and cleanup-orphaned-storage
-- Requires pg_cron, pg_net, and vault extensions (enable in Supabase Dashboard > Database > Extensions)
--
-- PREREQUISITE: Store your anon key in Vault before running this migration:
--   SELECT vault.create_secret('YOUR_ANON_JWT_KEY', 'anon_key');
-- Note: Edge Functions require JWT-based keys for auth. The function internally
-- uses SUPABASE_SERVICE_ROLE_KEY env for admin access, so anon key is sufficient here.

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
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key'),
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
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
