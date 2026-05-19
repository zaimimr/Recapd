ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

CREATE OR REPLACE FUNCTION event_preview_by_code(p_code TEXT)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  timezone TEXT,
  cover_image_url TEXT,
  host_display_name TEXT,
  guest_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    e.id,
    e.title,
    e.description,
    e.starts_at,
    e.ends_at,
    e.timezone,
    e.cover_image_url,
    p.display_name AS host_display_name,
    (SELECT COUNT(*) FROM public.event_members em WHERE em.event_id = e.id AND em.role = 'guest') AS guest_count
  FROM public.events e
  JOIN public.profiles p ON p.id = e.host_id
  WHERE e.join_code = UPPER(p_code)
    AND e.archived_at IS NULL
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION event_preview_by_code(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION rpc_join_event(p_code TEXT, p_display_name TEXT)
RETURNS public.events
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_event public.events;
  trimmed_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  trimmed_name := NULLIF(BTRIM(COALESCE(p_display_name, '')), '');
  IF trimmed_name IS NULL THEN
    RAISE EXCEPTION 'display_name required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF char_length(trimmed_name) > 60 THEN
    trimmed_name := LEFT(trimmed_name, 60);
  END IF;

  SELECT * INTO target_event
  FROM public.events
  WHERE join_code = UPPER(p_code)
    AND archived_at IS NULL
  LIMIT 1;

  IF target_event.id IS NULL THEN
    RAISE EXCEPTION 'event not found for code %', p_code USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.event_members (event_id, user_id, role, display_name)
  VALUES (target_event.id, auth.uid(), 'guest', trimmed_name)
  ON CONFLICT (event_id, user_id) DO UPDATE
    SET display_name = EXCLUDED.display_name;

  RETURN target_event;
END;
$$;

GRANT EXECUTE ON FUNCTION rpc_join_event(TEXT, TEXT) TO authenticated;
