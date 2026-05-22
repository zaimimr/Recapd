-- Rotate scheduled Edge Function jobs to require an additional shared secret header.
-- Prerequisites:
--   SELECT vault.create_secret('YOUR_ANON_JWT_KEY', 'anon_key');
--   SELECT vault.create_secret('YOUR_RANDOM_CRON_SECRET', 'cron_secret');
--   Set CRON_SECRET in each protected Edge Function environment.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  existing_job RECORD;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'daily-upload-reminder',
      'cleanup-expired-events',
      'cleanup-orphaned-storage'
    )
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'daily-upload-reminder',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zfrpwfuihfpoqyexbwng.supabase.co/functions/v1/daily-upload-reminder',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key'),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'cleanup-expired-events',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://zfrpwfuihfpoqyexbwng.supabase.co/functions/v1/cleanup-expired-events',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key'),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'cleanup-orphaned-storage',
  '0 4 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://zfrpwfuihfpoqyexbwng.supabase.co/functions/v1/cleanup-orphaned-storage',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key'),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
