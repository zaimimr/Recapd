CREATE OR REPLACE FUNCTION can_upload_video(p_event_id UUID, p_duration_seconds INT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  host_tier TEXT;
  cap_seconds INT;
BEGIN
  IF p_duration_seconds IS NULL OR p_duration_seconds <= 0 THEN
    RETURN TRUE;
  END IF;

  SELECT u.subscription_tier
    INTO host_tier
    FROM events e
    JOIN users u ON u.id = e.created_by_user_id
   WHERE e.id = p_event_id;

  IF host_tier IS NULL OR host_tier = 'free' THEN
    cap_seconds := 30;
  ELSE
    cap_seconds := 600;
  END IF;

  RETURN p_duration_seconds <= cap_seconds;
END;
$$;

GRANT EXECUTE ON FUNCTION can_upload_video(UUID, INT) TO anon, authenticated;
