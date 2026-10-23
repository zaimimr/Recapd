ALTER TABLE public.events ADD COLUMN IF NOT EXISTS host_invite_nudge_sent_at timestamptz;

CREATE OR REPLACE FUNCTION public.refresh_event_statuses()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.events
  SET status = CASE WHEN ends_at < now() THEN 'ended' ELSE 'live' END
  WHERE status = 'scheduled' AND starts_at <= now();

  UPDATE public.events
  SET status = 'ended'
  WHERE status = 'live' AND ends_at < now();
$$;

REVOKE ALL ON FUNCTION public.refresh_event_statuses() FROM PUBLIC, anon, authenticated;

SELECT public.refresh_event_statuses();

DO $$
DECLARE
  existing_job RECORD;
BEGIN
  FOR existing_job IN
    SELECT jobid FROM cron.job WHERE jobname IN ('refresh-event-statuses', 'host-invite-nudge')
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'refresh-event-statuses',
  '*/15 * * * *',
  $$ SELECT public.refresh_event_statuses(); $$
);

SELECT cron.schedule(
  'host-invite-nudge',
  '30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zfrpwfuihfpoqyexbwng.supabase.co/functions/v1/host-invite-nudge',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'anon_key'),
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
