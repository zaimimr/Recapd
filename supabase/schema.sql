-- Recapd App Database Schema
-- Secure baseline for fresh Supabase projects

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE subscription_unlock_scope AS ENUM ('none', 'self', 'event', 'both');
CREATE TYPE telemetry_event_kind AS ENUM ('error', 'trace');
CREATE TYPE telemetry_severity AS ENUM ('debug', 'info', 'warn', 'error', 'fatal');

-- Users visible to event participants
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  subscription_tier TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  unlock_scope subscription_unlock_scope NOT NULL DEFAULT 'none',
  revenuecat_entitlement_identifier TEXT,
  revenuecat_offering_identifier TEXT,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO subscription_plans (
  id,
  display_name,
  description,
  is_active,
  sort_order,
  unlock_scope,
  revenuecat_entitlement_identifier,
  revenuecat_offering_identifier,
  capabilities
)
VALUES
  (
    'free',
    'Free',
    'Baseline plan for small events and limited uploads.',
    TRUE,
    0,
    'none',
    NULL,
    NULL,
    jsonb_build_object(
      'maxParticipants',
      12,
      'participantWarningThreshold',
      10,
      'maxSingleVideoDurationMs',
      30000,
      'canUploadVideos',
      TRUE
    )
  ),
  (
    'pro',
    'Pro',
    'Paid plan for unlocked events and longer uploads.',
    TRUE,
    1,
    'both',
    'Recapd Pro',
    NULL,
    jsonb_build_object(
      'maxParticipants',
      NULL,
      'participantWarningThreshold',
      NULL,
      'maxSingleVideoDurationMs',
      300000,
      'canUploadVideos',
      TRUE
    )
  )
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  unlock_scope = EXCLUDED.unlock_scope,
  revenuecat_entitlement_identifier = EXCLUDED.revenuecat_entitlement_identifier,
  revenuecat_offering_identifier = EXCLUDED.revenuecat_offering_identifier,
  capabilities = EXCLUDED.capabilities,
  updated_at = NOW();

ALTER TABLE users
  ADD CONSTRAINT users_subscription_tier_fkey
  FOREIGN KEY (subscription_tier)
  REFERENCES subscription_plans(id)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active subscription plans"
  ON subscription_plans FOR SELECT
  USING (is_active);

GRANT USAGE ON TYPE subscription_unlock_scope TO anon, authenticated;
GRANT SELECT ON subscription_plans TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_subscription_plan_capabilities(plan_id_input TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(capabilities, '{}'::jsonb)
  FROM public.subscription_plans
  WHERE id = plan_id_input
    AND is_active
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION resolve_event_subscription_policy(
  host_plan_id_input TEXT,
  viewer_plan_id_input TEXT
)
RETURNS TABLE (
  host_plan_id TEXT,
  viewer_plan_id TEXT,
  host_unlock_scope subscription_unlock_scope,
  viewer_unlock_scope subscription_unlock_scope,
  event_capabilities JSONB,
  viewer_capabilities JSONB,
  event_max_participants INTEGER,
  participant_warning_threshold INTEGER,
  event_max_single_video_duration_ms INTEGER,
  viewer_max_single_video_duration_ms INTEGER,
  event_can_upload_videos BOOLEAN,
  viewer_can_upload_videos BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH host_plan AS (
    SELECT *
    FROM public.subscription_plans
    WHERE id = host_plan_id_input
      AND is_active
    LIMIT 1
  ),
  viewer_plan AS (
    SELECT *
    FROM public.subscription_plans
    WHERE id = viewer_plan_id_input
      AND is_active
    LIMIT 1
  )
  SELECT
    host_plan.id AS host_plan_id,
    viewer_plan.id AS viewer_plan_id,
    host_plan.unlock_scope AS host_unlock_scope,
    viewer_plan.unlock_scope AS viewer_unlock_scope,
    COALESCE(host_plan.capabilities, '{}'::jsonb) AS event_capabilities,
    COALESCE(viewer_plan.capabilities, '{}'::jsonb) AS viewer_capabilities,
    NULLIF(host_plan.capabilities->>'maxParticipants', '')::INTEGER AS event_max_participants,
    NULLIF(host_plan.capabilities->>'participantWarningThreshold', '')::INTEGER AS participant_warning_threshold,
    NULLIF(host_plan.capabilities->>'maxSingleVideoDurationMs', '')::INTEGER AS event_max_single_video_duration_ms,
    NULLIF(viewer_plan.capabilities->>'maxSingleVideoDurationMs', '')::INTEGER AS viewer_max_single_video_duration_ms,
    COALESCE((host_plan.capabilities->>'canUploadVideos')::BOOLEAN, FALSE) AS event_can_upload_videos,
    COALESCE((viewer_plan.capabilities->>'canUploadVideos')::BOOLEAN, FALSE) AS viewer_can_upload_videos
  FROM host_plan
  CROSS JOIN viewer_plan;
$$;

GRANT EXECUTE ON FUNCTION get_subscription_plan_capabilities(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION resolve_event_subscription_policy(TEXT, TEXT) TO anon, authenticated;

COMMENT ON COLUMN users.subscription_tier IS 'Active subscription plan id. Seeded plans are free and pro.';

-- Private user data visible only to the owning user and service-role jobs
CREATE TABLE IF NOT EXISTS user_private_data (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT UNIQUE,
  push_token TEXT,
  subscription_expires_at TIMESTAMPTZ,
  subscription_platform TEXT CHECK (subscription_platform IN ('ios', 'android', 'web')),
  subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  join_code TEXT UNIQUE NOT NULL,
  created_by_user_id UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'guest' CHECK (role IN ('host', 'guest')),
  nickname TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  no_photos_to_upload BOOLEAN NOT NULL DEFAULT FALSE,
  last_reminder_sent_at TIMESTAMPTZ,
  UNIQUE(event_id, user_id)
);

CREATE TABLE IF NOT EXISTS media_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  uploaded_by_user_id UUID REFERENCES users(id),
  captured_at TIMESTAMPTZ NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  media_type TEXT NOT NULL DEFAULT 'photo' CHECK (media_type IN ('photo', 'video')),
  width INT,
  height INT,
  duration_milliseconds INT,
  file_size_bytes BIGINT,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  visibility TEXT NOT NULL DEFAULT 'shared' CHECK (visibility IN ('shared', 'hidden', 'deleted')),
  deleted_at TIMESTAMPTZ,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS telemetry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_kind telemetry_event_kind NOT NULL,
  severity telemetry_severity NOT NULL DEFAULT 'error',
  name TEXT NOT NULL,
  message TEXT,
  stack_trace TEXT,
  source TEXT,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  app_version TEXT,
  build_number TEXT,
  session_id TEXT,
  trace_id TEXT,
  span_id TEXT,
  parent_span_id TEXT,
  route TEXT,
  screen TEXT,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_events_join_code ON events(join_code);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_media_items_event_captured ON media_items(event_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_occurred_at ON telemetry_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_actor_user_id ON telemetry_events(actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_event_kind ON telemetry_events(event_kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_trace_id ON telemetry_events(trace_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_event ON event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_user ON event_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_reminder
  ON event_participants (event_id, no_photos_to_upload, last_reminder_sent_at)
  WHERE no_photos_to_upload = FALSE;
CREATE INDEX IF NOT EXISTS idx_user_private_data_device_id ON user_private_data(device_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_private_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION current_user_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.users
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_telemetry_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', FALSE);
$$;

CREATE OR REPLACE FUNCTION is_event_participant(target_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_participants ep
    WHERE ep.event_id = target_event_id
      AND ep.user_id = public.current_user_profile_id()
  );
$$;

CREATE OR REPLACE FUNCTION is_event_host(target_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_participants ep
    WHERE ep.event_id = target_event_id
      AND ep.user_id = public.current_user_profile_id()
      AND ep.role = 'host'
  );
$$;

CREATE OR REPLACE FUNCTION can_create_host_participation(target_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = target_event_id
      AND e.created_by_user_id = public.current_user_profile_id()
  );
$$;

CREATE OR REPLACE FUNCTION can_view_user(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target_user_id = public.current_user_profile_id()
    OR EXISTS (
      SELECT 1
      FROM public.event_participants mine
      JOIN public.event_participants theirs
        ON theirs.event_id = mine.event_id
      WHERE mine.user_id = public.current_user_profile_id()
        AND theirs.user_id = target_user_id
    );
$$;

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

GRANT EXECUTE ON FUNCTION get_event_preview(TEXT) TO anon, authenticated;

DROP POLICY IF EXISTS "Users can view their own profile" ON users;
DROP POLICY IF EXISTS "Users can insert their own profile" ON users;
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Users can view allowed user profiles" ON users;
DROP POLICY IF EXISTS "Users can insert their own profile row" ON users;
DROP POLICY IF EXISTS "Users can update their own profile row" ON users;

CREATE POLICY "Users can view allowed user profiles"
  ON users FOR SELECT
  USING (can_view_user(id));

CREATE POLICY "Users can insert their own profile row"
  ON users FOR INSERT
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Users can update their own profile row"
  ON users FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can read their private data" ON user_private_data;
DROP POLICY IF EXISTS "Users can insert their private data" ON user_private_data;
DROP POLICY IF EXISTS "Users can update their private data" ON user_private_data;

CREATE POLICY "Users can read their private data"
  ON user_private_data FOR SELECT
  USING (user_id = current_user_profile_id());

CREATE POLICY "Users can insert their private data"
  ON user_private_data FOR INSERT
  WITH CHECK (user_id = current_user_profile_id());

CREATE POLICY "Users can update their private data"
  ON user_private_data FOR UPDATE
  USING (user_id = current_user_profile_id())
  WITH CHECK (user_id = current_user_profile_id());

DROP POLICY IF EXISTS "Anyone can view events they participate in" ON events;
DROP POLICY IF EXISTS "Anyone can create events" ON events;
DROP POLICY IF EXISTS "Event creators can update their events" ON events;
DROP POLICY IF EXISTS "Participants can read their events" ON events;
DROP POLICY IF EXISTS "Users can create events they own" ON events;
DROP POLICY IF EXISTS "Hosts can update their events" ON events;
DROP POLICY IF EXISTS "Hosts can delete their events" ON events;

CREATE POLICY "Participants can read their events"
  ON events FOR SELECT
  USING (is_event_participant(id));

CREATE POLICY "Users can create events they own"
  ON events FOR INSERT
  WITH CHECK (
    created_by_user_id = current_user_profile_id()
    AND created_by_user_id IS NOT NULL
  );

CREATE POLICY "Hosts can update their events"
  ON events FOR UPDATE
  USING (is_event_host(id))
  WITH CHECK (is_event_host(id));

CREATE POLICY "Hosts can delete their events"
  ON events FOR DELETE
  USING (is_event_host(id));

DROP POLICY IF EXISTS "Anyone can view participants of their events" ON event_participants;
DROP POLICY IF EXISTS "Anyone can join events" ON event_participants;
DROP POLICY IF EXISTS "Participants can leave events" ON event_participants;
DROP POLICY IF EXISTS "Participants can read event rosters" ON event_participants;
DROP POLICY IF EXISTS "Users can join events as themselves" ON event_participants;
DROP POLICY IF EXISTS "Users can update their participant preferences" ON event_participants;
DROP POLICY IF EXISTS "Users can leave or hosts can remove guests" ON event_participants;

CREATE POLICY "Participants can read event rosters"
  ON event_participants FOR SELECT
  USING (is_event_participant(event_id));

CREATE POLICY "Users can join events as themselves"
  ON event_participants FOR INSERT
  WITH CHECK (
    user_id = current_user_profile_id()
    AND (
      (role = 'guest' AND can_join_event(event_id))
      OR (
        role = 'host'
        AND can_create_host_participation(event_id)
      )
    )
  );

CREATE POLICY "Users can update their participant preferences"
  ON event_participants FOR UPDATE
  USING (user_id = current_user_profile_id())
  WITH CHECK (user_id = current_user_profile_id());

CREATE POLICY "Users can leave or hosts can remove guests"
  ON event_participants FOR DELETE
  USING (
    user_id = current_user_profile_id()
    OR (
      is_event_host(event_id)
      AND role <> 'host'
    )
  );

DROP POLICY IF EXISTS "Participants can view media from their events" ON media_items;
DROP POLICY IF EXISTS "Participants can upload media to their events" ON media_items;
DROP POLICY IF EXISTS "Users can update their own media" ON media_items;
DROP POLICY IF EXISTS "Users can delete their own media" ON media_items;
DROP POLICY IF EXISTS "Participants can read event media" ON media_items;
DROP POLICY IF EXISTS "Participants can insert their own event media" ON media_items;
DROP POLICY IF EXISTS "Owners or hosts can update event media" ON media_items;
DROP POLICY IF EXISTS "Owners or hosts can delete event media" ON media_items;

CREATE POLICY "Participants can read event media"
  ON media_items FOR SELECT
  USING (is_event_participant(event_id));

CREATE POLICY "Participants can insert their own event media"
  ON media_items FOR INSERT
  WITH CHECK (
    uploaded_by_user_id = current_user_profile_id()
    AND is_event_participant(event_id)
    AND can_insert_media_item_for_event(
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

CREATE POLICY "Owners or hosts can update event media"
  ON media_items FOR UPDATE
  USING (
    uploaded_by_user_id = current_user_profile_id()
    OR is_event_host(event_id)
  )
  WITH CHECK (
    uploaded_by_user_id = current_user_profile_id()
    OR is_event_host(event_id)
  );

CREATE POLICY "Owners or hosts can delete event media"
  ON media_items FOR DELETE
  USING (
    uploaded_by_user_id = current_user_profile_id()
    OR is_event_host(event_id)
  );

DROP POLICY IF EXISTS "Authenticated users can insert telemetry events" ON telemetry_events;
DROP POLICY IF EXISTS "Telemetry admins can read telemetry events" ON telemetry_events;

CREATE POLICY "Authenticated users can insert telemetry events"
  ON telemetry_events FOR INSERT
  WITH CHECK (actor_user_id = current_user_profile_id());

CREATE POLICY "Telemetry admins can read telemetry events"
  ON telemetry_events FOR SELECT
  USING (is_telemetry_admin());

GRANT USAGE ON TYPE telemetry_event_kind TO authenticated;
GRANT USAGE ON TYPE telemetry_severity TO authenticated;
GRANT INSERT, SELECT ON telemetry_events TO authenticated;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_events_updated_at ON events;
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_private_data_updated_at ON user_private_data;
CREATE TRIGGER update_user_private_data_updated_at
  BEFORE UPDATE ON user_private_data
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION update_event_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ends_at < NOW() AND NEW.status NOT IN ('expired', 'ended') THEN
    NEW.status = 'ended';
  ELSIF NEW.starts_at <= NOW() AND NEW.ends_at > NOW() AND NEW.status = 'scheduled' THEN
    NEW.status = 'live';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_event_status ON events;
CREATE TRIGGER check_event_status
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_event_status();

CREATE OR REPLACE FUNCTION prevent_event_participant_identity_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.event_id <> OLD.event_id OR NEW.user_id <> OLD.user_id OR NEW.role <> OLD.role THEN
    RAISE EXCEPTION 'event_id, user_id, and role are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_event_participant_identity_changes_trigger ON event_participants;
CREATE TRIGGER prevent_event_participant_identity_changes_trigger
  BEFORE UPDATE ON event_participants
  FOR EACH ROW
  EXECUTE FUNCTION prevent_event_participant_identity_changes();
