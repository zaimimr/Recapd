-- Make subscription limits server-authoritative for event joins and video uploads.

CREATE OR REPLACE FUNCTION get_event_host_plan_id(target_event_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(u.subscription_tier, 'free')
  FROM public.event_participants ep
  JOIN public.users u
    ON u.id = ep.user_id
  WHERE ep.event_id = target_event_id
    AND ep.role = 'host'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_event_participant_limit(target_event_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH free_plan AS (
    SELECT *
    FROM public.subscription_plans
    WHERE id = 'free'
      AND is_active
    LIMIT 1
  ),
  host_plan AS (
    SELECT *
    FROM public.subscription_plans
    WHERE id = public.get_event_host_plan_id(target_event_id)
      AND is_active
    LIMIT 1
  )
  SELECT
    CASE
      WHEN COALESCE(host_plan.unlock_scope, 'none') IN ('event', 'both')
        THEN NULLIF(host_plan.capabilities->>'maxParticipants', '')::INTEGER
      ELSE NULLIF(free_plan.capabilities->>'maxParticipants', '')::INTEGER
    END
  FROM free_plan
  LEFT JOIN host_plan ON TRUE;
$$;

CREATE OR REPLACE FUNCTION can_join_event(target_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH participant_limit AS (
    SELECT public.get_event_participant_limit(target_event_id) AS max_participants
  ),
  participant_count AS (
    SELECT COUNT(*)::INTEGER AS total
    FROM public.event_participants ep
    WHERE ep.event_id = target_event_id
  )
  SELECT
    CASE
      WHEN participant_limit.max_participants IS NULL THEN TRUE
      ELSE participant_count.total < participant_limit.max_participants
    END
  FROM participant_limit
  CROSS JOIN participant_count;
$$;

CREATE OR REPLACE FUNCTION get_effective_video_duration_limit(
  target_event_id UUID,
  target_user_id UUID
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH free_plan AS (
    SELECT *
    FROM public.subscription_plans
    WHERE id = 'free'
      AND is_active
    LIMIT 1
  ),
  host_plan AS (
    SELECT *
    FROM public.subscription_plans
    WHERE id = public.get_event_host_plan_id(target_event_id)
      AND is_active
    LIMIT 1
  ),
  viewer_plan AS (
    SELECT sp.*
    FROM public.users u
    JOIN public.subscription_plans sp
      ON sp.id = u.subscription_tier
    WHERE u.id = target_user_id
      AND sp.is_active
    LIMIT 1
  )
  SELECT GREATEST(
    CASE
      WHEN COALESCE(host_plan.unlock_scope, 'none') IN ('event', 'both')
        THEN COALESCE(
          NULLIF(host_plan.capabilities->>'maxSingleVideoDurationMs', '')::INTEGER,
          NULLIF(free_plan.capabilities->>'maxSingleVideoDurationMs', '')::INTEGER,
          0
        )
      ELSE COALESCE(NULLIF(free_plan.capabilities->>'maxSingleVideoDurationMs', '')::INTEGER, 0)
    END,
    CASE
      WHEN COALESCE(viewer_plan.unlock_scope, 'none') IN ('self', 'both')
        THEN COALESCE(
          NULLIF(viewer_plan.capabilities->>'maxSingleVideoDurationMs', '')::INTEGER,
          NULLIF(free_plan.capabilities->>'maxSingleVideoDurationMs', '')::INTEGER,
          0
        )
      ELSE COALESCE(NULLIF(free_plan.capabilities->>'maxSingleVideoDurationMs', '')::INTEGER, 0)
    END
  )
  FROM free_plan
  LEFT JOIN host_plan ON TRUE
  LEFT JOIN viewer_plan ON TRUE;
$$;

CREATE OR REPLACE FUNCTION can_insert_media_item_for_event(
  target_event_id UUID,
  target_user_id UUID,
  target_media_type TEXT,
  target_duration_milliseconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH free_plan AS (
    SELECT *
    FROM public.subscription_plans
    WHERE id = 'free'
      AND is_active
    LIMIT 1
  ),
  host_plan AS (
    SELECT *
    FROM public.subscription_plans
    WHERE id = public.get_event_host_plan_id(target_event_id)
      AND is_active
    LIMIT 1
  ),
  viewer_plan AS (
    SELECT sp.*
    FROM public.users u
    JOIN public.subscription_plans sp
      ON sp.id = u.subscription_tier
    WHERE u.id = target_user_id
      AND sp.is_active
    LIMIT 1
  )
  SELECT
    CASE
      WHEN target_media_type <> 'video' THEN TRUE
      ELSE
        (
          CASE
            WHEN COALESCE(host_plan.unlock_scope, 'none') IN ('event', 'both')
              THEN COALESCE(
                (host_plan.capabilities->>'canUploadVideos')::BOOLEAN,
                (free_plan.capabilities->>'canUploadVideos')::BOOLEAN,
                FALSE
              )
            ELSE COALESCE((free_plan.capabilities->>'canUploadVideos')::BOOLEAN, FALSE)
          END
          OR
          CASE
            WHEN COALESCE(viewer_plan.unlock_scope, 'none') IN ('self', 'both')
              THEN COALESCE(
                (viewer_plan.capabilities->>'canUploadVideos')::BOOLEAN,
                (free_plan.capabilities->>'canUploadVideos')::BOOLEAN,
                FALSE
              )
            ELSE COALESCE((free_plan.capabilities->>'canUploadVideos')::BOOLEAN, FALSE)
          END
        )
        AND (
          target_duration_milliseconds IS NULL
          OR target_duration_milliseconds <= public.get_effective_video_duration_limit(
            target_event_id,
            target_user_id
          )
        )
    END
  FROM free_plan
  LEFT JOIN host_plan ON TRUE
  LEFT JOIN viewer_plan ON TRUE;
$$;

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

GRANT EXECUTE ON FUNCTION get_event_host_plan_id(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_event_participant_limit(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION can_join_event(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_effective_video_duration_limit(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION can_insert_media_item_for_event(UUID, UUID, TEXT, INTEGER) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_event_preview(TEXT) TO anon, authenticated;

DROP POLICY IF EXISTS "Users can join events as themselves" ON event_participants;
CREATE POLICY "Users can join events as themselves"
  ON event_participants FOR INSERT
  WITH CHECK (
    user_id = current_user_profile_id()
    AND (
      (role = 'guest' AND public.can_join_event(event_id))
      OR (
        role = 'host'
        AND public.can_create_host_participation(event_id)
      )
    )
  );

DROP POLICY IF EXISTS "Participants can insert their own event media" ON media_items;
CREATE POLICY "Participants can insert their own event media"
  ON media_items FOR INSERT
  WITH CHECK (
    uploaded_by_user_id = current_user_profile_id()
    AND public.is_event_participant(event_id)
    AND public.can_insert_media_item_for_event(
      event_id,
      uploaded_by_user_id,
      media_type,
      duration_milliseconds
    )
    AND storage_path LIKE event_id::TEXT || '/' || current_user_profile_id()::TEXT || '/%'
    AND (
      thumbnail_path IS NULL
      OR thumbnail_path LIKE event_id::TEXT || '/' || current_user_profile_id()::TEXT || '/%'
    )
  );
