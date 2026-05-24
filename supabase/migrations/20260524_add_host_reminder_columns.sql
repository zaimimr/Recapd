-- Migration: support host-triggered reminder notifications
-- Adds cooldown timestamp on events. Updated only via service role from
-- the send-host-reminder edge function, so no new RLS policy is required.

ALTER TABLE events
ADD COLUMN IF NOT EXISTS last_host_reminder_at TIMESTAMPTZ DEFAULT NULL;

-- Keep get_event_preview output in sync so the client can read the new field.
DROP FUNCTION IF EXISTS get_event_preview(TEXT);
CREATE OR REPLACE FUNCTION get_event_preview(join_code_input TEXT)
RETURNS TABLE (
  id UUID,
  title TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  timezone TEXT,
  join_code TEXT,
  created_by_user_id UUID,
  status TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  last_host_reminder_at TIMESTAMPTZ,
  participant_count BIGINT,
  host_plan_id TEXT,
  host_is_pro BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id,
    e.title,
    e.starts_at,
    e.ends_at,
    e.timezone,
    e.join_code,
    e.created_by_user_id,
    e.status,
    e.expires_at,
    e.created_at,
    e.updated_at,
    e.last_host_reminder_at,
    COUNT(ep.id) AS participant_count,
    COALESCE(MAX(CASE WHEN ep.role = 'host' THEN u.subscription_tier END), 'free') AS host_plan_id,
    COALESCE(BOOL_OR(u.subscription_tier = 'pro' AND ep.role = 'host'), FALSE) AS host_is_pro
  FROM public.events e
  LEFT JOIN public.event_participants ep
    ON ep.event_id = e.id
  LEFT JOIN public.users u
    ON u.id = ep.user_id
  WHERE e.join_code = UPPER(join_code_input)
  GROUP BY e.id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_event_preview(TEXT) TO anon, authenticated;
