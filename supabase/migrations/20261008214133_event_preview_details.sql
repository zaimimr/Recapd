DROP FUNCTION IF EXISTS public.get_event_preview(text);

CREATE FUNCTION public.get_event_preview(join_code_input text)
RETURNS TABLE(id uuid, title text, starts_at timestamp with time zone, ends_at timestamp with time zone, timezone text, join_code text, created_by_user_id uuid, status text, expires_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, last_host_reminder_at timestamp with time zone, deletion_delayed_at timestamp with time zone, participant_count bigint, host_plan_id text, host_is_pro boolean, location text, dress_code text, details text, schedule jsonb)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    e.deletion_delayed_at,
    COUNT(ep.id) AS participant_count,
    COALESCE(MAX(CASE WHEN ep.role = 'host' THEN u.subscription_tier END), 'free') AS host_plan_id,
    COALESCE(BOOL_OR(u.subscription_tier = 'pro' AND ep.role = 'host'), FALSE) AS host_is_pro,
    e.location,
    e.dress_code,
    e.details,
    e.schedule
  FROM public.events e
  LEFT JOIN public.event_participants ep
    ON ep.event_id = e.id
  LEFT JOIN public.users u
    ON u.id = ep.user_id
  WHERE e.join_code = UPPER(join_code_input)
  GROUP BY e.id
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_event_preview(text) TO anon, authenticated, service_role;
