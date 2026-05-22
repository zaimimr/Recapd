-- Security hardening migration
-- 1. Move private user fields out of public users rows
-- 2. Bind identity and access control to auth.uid()
-- 3. Lock down storage buckets and policies

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_subscription_tier_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_subscription_tier_check
      CHECK (subscription_tier IN ('free', 'pro'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier);

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

INSERT INTO user_private_data (
  user_id,
  device_id,
  push_token,
  subscription_expires_at,
  subscription_platform,
  subscription_id
)
SELECT
  id,
  device_id,
  push_token,
  subscription_expires_at,
  subscription_platform,
  subscription_id
FROM users
ON CONFLICT (user_id) DO UPDATE SET
  device_id = COALESCE(EXCLUDED.device_id, user_private_data.device_id),
  push_token = COALESCE(EXCLUDED.push_token, user_private_data.push_token),
  subscription_expires_at = COALESCE(EXCLUDED.subscription_expires_at, user_private_data.subscription_expires_at),
  subscription_platform = COALESCE(EXCLUDED.subscription_platform, user_private_data.subscription_platform),
  subscription_id = COALESCE(EXCLUDED.subscription_id, user_private_data.subscription_id);

ALTER TABLE users
  DROP COLUMN IF EXISTS device_id,
  DROP COLUMN IF EXISTS push_token,
  DROP COLUMN IF EXISTS subscription_expires_at,
  DROP COLUMN IF EXISTS subscription_platform,
  DROP COLUMN IF EXISTS subscription_id;

ALTER TABLE event_participants
  ADD COLUMN IF NOT EXISTS no_photos_to_upload BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMPTZ;

ALTER TABLE media_items
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_event_participants_reminder
  ON event_participants (event_id, no_photos_to_upload, last_reminder_sent_at)
  WHERE no_photos_to_upload = FALSE;
CREATE INDEX IF NOT EXISTS idx_user_private_data_device_id ON user_private_data(device_id);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_private_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;

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
      role = 'guest'
      OR (
        role = 'host'
        AND EXISTS (
          SELECT 1
          FROM events e
          WHERE e.id = event_id
            AND e.created_by_user_id = current_user_profile_id()
        )
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

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('event-photos', 'event-photos', false),
  ('thumbnails', 'thumbnails', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Anyone can view event photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload event photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Participants can read event photos" ON storage.objects;
DROP POLICY IF EXISTS "Participants can upload event photos" ON storage.objects;
DROP POLICY IF EXISTS "Owners or hosts can delete event photos" ON storage.objects;
DROP POLICY IF EXISTS "Participants can read thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Participants can upload thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Owners or hosts can delete thumbnails" ON storage.objects;

CREATE POLICY "Participants can read event photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'event-photos'
    AND EXISTS (
      SELECT 1
      FROM public.event_participants ep
      WHERE ep.event_id::TEXT = (storage.foldername(name))[1]
        AND ep.user_id = public.current_user_profile_id()
    )
  );

CREATE POLICY "Participants can upload event photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-photos'
    AND (storage.foldername(name))[2] = public.current_user_profile_id()::TEXT
    AND EXISTS (
      SELECT 1
      FROM public.event_participants ep
      WHERE ep.event_id::TEXT = (storage.foldername(name))[1]
        AND ep.user_id = public.current_user_profile_id()
    )
  );

CREATE POLICY "Owners or hosts can delete event photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'event-photos'
    AND (
      (storage.foldername(name))[2] = public.current_user_profile_id()::TEXT
      OR public.is_event_host(((storage.foldername(name))[1])::UUID)
    )
  );

CREATE POLICY "Participants can read thumbnails"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'thumbnails'
    AND EXISTS (
      SELECT 1
      FROM public.event_participants ep
      WHERE ep.event_id::TEXT = (storage.foldername(name))[1]
        AND ep.user_id = public.current_user_profile_id()
    )
  );

CREATE POLICY "Participants can upload thumbnails"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'thumbnails'
    AND (storage.foldername(name))[2] = public.current_user_profile_id()::TEXT
    AND EXISTS (
      SELECT 1
      FROM public.event_participants ep
      WHERE ep.event_id::TEXT = (storage.foldername(name))[1]
        AND ep.user_id = public.current_user_profile_id()
    )
  );

CREATE POLICY "Owners or hosts can delete thumbnails"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'thumbnails'
    AND (
      (storage.foldername(name))[2] = public.current_user_profile_id()::TEXT
      OR public.is_event_host(((storage.foldername(name))[1])::UUID)
    )
  );
