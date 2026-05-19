CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$ BEGIN
  CREATE TYPE event_member_role AS ENUM ('host', 'guest');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE media_kind AS ENUM ('photo', 'video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE media_status AS ENUM ('pending', 'ready', 'failed', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_entitlement AS ENUM ('free', 'pro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE subscription_billing_period AS ENUM ('per_event', 'monthly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reminder_kind AS ENUM ('host_nudge', 'day_after_auto', 'event_expiry_warning');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  avatar_color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  entitlement subscription_entitlement NOT NULL DEFAULT 'free',
  billing_period subscription_billing_period,
  expires_at TIMESTAMPTZ,
  revenuecat_app_user_id TEXT,
  revenuecat_entitlement_id TEXT,
  platform TEXT CHECK (platform IN ('ios', 'android', 'web')),
  product_id TEXT,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_limits (
  entitlement subscription_entitlement PRIMARY KEY,
  max_guests INTEGER,
  max_event_window_hours INTEGER,
  max_video_duration_ms INTEGER,
  max_active_events INTEGER,
  media_ttl_days INTEGER,
  allows_full_resolution_download BOOLEAN NOT NULL DEFAULT FALSE,
  allows_multi_host BOOLEAN NOT NULL DEFAULT FALSE,
  allows_custom_branding BOOLEAN NOT NULL DEFAULT FALSE,
  allows_live_slideshow BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO subscription_limits (
  entitlement, max_guests, max_event_window_hours, max_video_duration_ms,
  max_active_events, media_ttl_days, allows_full_resolution_download,
  allows_multi_host, allows_custom_branding, allows_live_slideshow
) VALUES
  ('free', 20, 48, 30000, 1, 60, FALSE, FALSE, FALSE, FALSE),
  ('pro', NULL, 720, 240000, NULL, NULL, TRUE, TRUE, TRUE, TRUE)
ON CONFLICT (entitlement) DO UPDATE SET
  max_guests = EXCLUDED.max_guests,
  max_event_window_hours = EXCLUDED.max_event_window_hours,
  max_video_duration_ms = EXCLUDED.max_video_duration_ms,
  max_active_events = EXCLUDED.max_active_events,
  media_ttl_days = EXCLUDED.media_ttl_days,
  allows_full_resolution_download = EXCLUDED.allows_full_resolution_download,
  allows_multi_host = EXCLUDED.allows_multi_host,
  allows_custom_branding = EXCLUDED.allows_custom_branding,
  allows_live_slideshow = EXCLUDED.allows_live_slideshow,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  join_code TEXT NOT NULL UNIQUE,
  allow_outside_window BOOLEAN NOT NULL DEFAULT FALSE,
  cover_image_url TEXT,
  cover_media_id UUID,
  archived_at TIMESTAMPTZ,
  media_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT events_window_valid CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_events_host ON events(host_id);
CREATE INDEX IF NOT EXISTS idx_events_active_window ON events(starts_at, ends_at) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_events_media_expires_at ON events(media_expires_at) WHERE media_expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS event_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role event_member_role NOT NULL DEFAULT 'guest',
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_uploaded_at TIMESTAMPTZ,
  no_photos_to_upload BOOLEAN NOT NULL DEFAULT FALSE,
  notifications_opt_in BOOLEAN NOT NULL DEFAULT TRUE,
  push_token TEXT,
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_members_event ON event_members(event_id);
CREATE INDEX IF NOT EXISTS idx_event_members_user ON event_members(user_id);
CREATE INDEX IF NOT EXISTS idx_event_members_host ON event_members(event_id) WHERE role = 'host';

CREATE TABLE IF NOT EXISTS media_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  capture_time TIMESTAMPTZ NOT NULL,
  upload_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_video BOOLEAN NOT NULL DEFAULT FALSE,
  kind media_kind GENERATED ALWAYS AS (CASE WHEN is_video THEN 'video'::media_kind ELSE 'photo'::media_kind END) STORED,
  duration_ms INTEGER,
  width INTEGER,
  height INTEGER,
  storage_path TEXT NOT NULL,
  thumb_path TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  thumb_size_bytes BIGINT NOT NULL DEFAULT 0,
  content_type TEXT,
  status media_status NOT NULL DEFAULT 'pending',
  hidden_by_host_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  outside_window BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT media_items_video_duration_required CHECK (
    is_video = FALSE OR duration_ms IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_media_items_event_capture ON media_items(event_id, capture_time DESC);
CREATE INDEX IF NOT EXISTS idx_media_items_owner ON media_items(owner_id);
CREATE INDEX IF NOT EXISTS idx_media_items_status ON media_items(status);
CREATE INDEX IF NOT EXISTS idx_media_items_event_visible
  ON media_items(event_id, capture_time DESC)
  WHERE hidden_by_host_at IS NULL AND deleted_at IS NULL;

DO $$ BEGIN
  ALTER TABLE events
    ADD CONSTRAINT events_cover_media_fkey
    FOREIGN KEY (cover_media_id) REFERENCES media_items(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS event_pro_unlocks (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rc_transaction_id TEXT,
  rc_product_id TEXT,
  platform TEXT CHECK (platform IN ('ios', 'android', 'web')),
  PRIMARY KEY (user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_event_pro_unlocks_event ON event_pro_unlocks(event_id);

CREATE TABLE IF NOT EXISTS nudges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  sent_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message TEXT,
  recipient_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_nudges_event_sent_at ON nudges(event_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS reminders_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  kind reminder_kind NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  channel TEXT NOT NULL DEFAULT 'push' CHECK (channel IN ('push', 'email', 'sms')),
  delivered BOOLEAN NOT NULL DEFAULT TRUE,
  error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_reminders_log_event ON reminders_log(event_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_reminders_log_user ON reminders_log(user_id, sent_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_events_updated_at ON events;
CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_media_items_updated_at ON media_items;
CREATE TRIGGER trg_media_items_updated_at BEFORE UPDATE ON media_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION current_entitlement(target_user_id UUID)
RETURNS subscription_entitlement
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN s.entitlement = 'pro' AND (s.expires_at IS NULL OR s.expires_at > NOW())
      THEN 'pro'::subscription_entitlement
    ELSE 'free'::subscription_entitlement
  END
  FROM public.profiles p
  LEFT JOIN public.subscriptions s ON s.user_id = p.id
  WHERE p.id = target_user_id;
$$;

CREATE OR REPLACE FUNCTION limits_for(target_user_id UUID)
RETURNS subscription_limits
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT sl.*
  FROM public.subscription_limits sl
  WHERE sl.entitlement = public.current_entitlement(target_user_id);
$$;

CREATE OR REPLACE FUNCTION is_event_member(target_event_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_members em
    WHERE em.event_id = target_event_id AND em.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_event_host(target_event_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = target_event_id AND e.host_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION enforce_event_limits()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  host_limits public.subscription_limits;
  window_hours NUMERIC;
  active_event_count INTEGER;
BEGIN
  IF NEW.host_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO host_limits FROM public.limits_for(NEW.host_id);

  IF host_limits.max_event_window_hours IS NOT NULL THEN
    window_hours := EXTRACT(EPOCH FROM (NEW.ends_at - NEW.starts_at)) / 3600.0;
    IF window_hours > host_limits.max_event_window_hours THEN
      RAISE EXCEPTION 'event window exceeds plan limit of % hours', host_limits.max_event_window_hours
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' AND host_limits.max_active_events IS NOT NULL THEN
    SELECT COUNT(*) INTO active_event_count
    FROM public.events
    WHERE host_id = NEW.host_id
      AND archived_at IS NULL
      AND ends_at > NOW();
    IF active_event_count >= host_limits.max_active_events THEN
      RAISE EXCEPTION 'host already has % active event(s) on current plan', host_limits.max_active_events
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF host_limits.media_ttl_days IS NOT NULL THEN
    NEW.media_expires_at := NEW.ends_at + (host_limits.media_ttl_days || ' days')::INTERVAL;
  ELSE
    NEW.media_expires_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_enforce_limits ON events;
CREATE TRIGGER trg_events_enforce_limits
  BEFORE INSERT OR UPDATE OF starts_at, ends_at, host_id ON events
  FOR EACH ROW EXECUTE FUNCTION enforce_event_limits();

CREATE OR REPLACE FUNCTION enforce_guest_cap()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  host_id_var UUID;
  host_limits public.subscription_limits;
  guest_count INTEGER;
BEGIN
  IF NEW.role = 'host' THEN
    RETURN NEW;
  END IF;

  SELECT host_id INTO host_id_var FROM public.events WHERE id = NEW.event_id;
  IF host_id_var IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO host_limits FROM public.limits_for(host_id_var);

  IF host_limits.max_guests IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO guest_count
  FROM public.event_members
  WHERE event_id = NEW.event_id AND role = 'guest';

  IF guest_count >= host_limits.max_guests THEN
    RAISE EXCEPTION 'event has reached guest cap of % on host plan', host_limits.max_guests
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_members_enforce_guest_cap ON event_members;
CREATE TRIGGER trg_event_members_enforce_guest_cap
  BEFORE INSERT ON event_members
  FOR EACH ROW EXECUTE FUNCTION enforce_guest_cap();

CREATE OR REPLACE FUNCTION enforce_media_limits()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  owner_limits public.subscription_limits;
  host_id_var UUID;
  host_limits public.subscription_limits;
  effective_max_duration INTEGER;
BEGIN
  IF NEW.is_video THEN
    SELECT * INTO owner_limits FROM public.limits_for(NEW.owner_id);
    SELECT host_id INTO host_id_var FROM public.events WHERE id = NEW.event_id;
    SELECT * INTO host_limits FROM public.limits_for(host_id_var);
    effective_max_duration := GREATEST(
      COALESCE(owner_limits.max_video_duration_ms, 0),
      COALESCE(host_limits.max_video_duration_ms, 0)
    );
    IF effective_max_duration > 0 AND NEW.duration_ms IS NOT NULL
       AND NEW.duration_ms > effective_max_duration THEN
      RAISE EXCEPTION 'video duration % ms exceeds plan limit %', NEW.duration_ms, effective_max_duration
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_media_items_enforce_limits ON media_items;
CREATE TRIGGER trg_media_items_enforce_limits
  BEFORE INSERT OR UPDATE OF duration_ms, is_video ON media_items
  FOR EACH ROW EXECUTE FUNCTION enforce_media_limits();

CREATE OR REPLACE FUNCTION ensure_host_membership()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  host_display TEXT;
BEGIN
  SELECT display_name INTO host_display FROM public.profiles WHERE id = NEW.host_id;
  INSERT INTO public.event_members (event_id, user_id, role, display_name)
  VALUES (NEW.id, NEW.host_id, 'host', COALESCE(host_display, 'Host'))
  ON CONFLICT (event_id, user_id) DO UPDATE SET role = 'host';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_ensure_host_member ON events;
CREATE TRIGGER trg_events_ensure_host_member
  AFTER INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION ensure_host_membership();

CREATE OR REPLACE FUNCTION sync_profile_from_auth()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name', ''), split_part(NEW.email, '@', 1), 'Guest')
  )
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.subscriptions (user_id, entitlement) VALUES (NEW.id, 'free')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_user_to_profile ON auth.users;
CREATE TRIGGER trg_auth_user_to_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_profile_from_auth();

CREATE OR REPLACE FUNCTION event_storage_usage(target_event_id UUID)
RETURNS TABLE (
  event_id UUID,
  total_bytes BIGINT,
  total_originals_bytes BIGINT,
  total_thumbs_bytes BIGINT,
  item_count BIGINT,
  photo_count BIGINT,
  video_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    target_event_id,
    COALESCE(SUM(size_bytes + thumb_size_bytes), 0)::BIGINT,
    COALESCE(SUM(size_bytes), 0)::BIGINT,
    COALESCE(SUM(thumb_size_bytes), 0)::BIGINT,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE is_video = FALSE)::BIGINT,
    COUNT(*) FILTER (WHERE is_video = TRUE)::BIGINT
  FROM public.media_items
  WHERE event_id = target_event_id
    AND deleted_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION event_storage_usage(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION cleanup_stale_media_rows(
  pending_older_than INTERVAL DEFAULT INTERVAL '1 hour',
  failed_older_than INTERVAL DEFAULT INTERVAL '7 days'
)
RETURNS TABLE (deleted_pending BIGINT, deleted_failed BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pending_count BIGINT;
  failed_count BIGINT;
BEGIN
  WITH d AS (
    DELETE FROM public.media_items
    WHERE status = 'pending'
      AND created_at < NOW() - pending_older_than
    RETURNING 1
  )
  SELECT COUNT(*) INTO pending_count FROM d;

  WITH d AS (
    DELETE FROM public.media_items
    WHERE status = 'failed'
      AND created_at < NOW() - failed_older_than
    RETURNING 1
  )
  SELECT COUNT(*) INTO failed_count FROM d;

  RETURN QUERY SELECT pending_count, failed_count;
END;
$$;

REVOKE ALL ON FUNCTION cleanup_stale_media_rows(INTERVAL, INTERVAL) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION event_is_pro(target_event_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.current_entitlement(e.host_id) = 'pro'
    OR EXISTS (
      SELECT 1 FROM public.event_pro_unlocks u
      WHERE u.event_id = e.id AND u.user_id = e.host_id
    )
  FROM public.events e
  WHERE e.id = target_event_id;
$$;

CREATE OR REPLACE FUNCTION can_download_full_resolution(target_event_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.event_is_pro(target_event_id), FALSE);
$$;

GRANT EXECUTE ON FUNCTION can_download_full_resolution(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION event_is_pro(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION current_entitlement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION limits_for(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_event_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_event_host(UUID) TO authenticated;

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

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE nudges ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_pro_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_self_or_co_member ON profiles;
CREATE POLICY profiles_select_self_or_co_member ON profiles FOR SELECT
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.event_members mine
      JOIN public.event_members theirs ON theirs.event_id = mine.event_id
      WHERE mine.user_id = auth.uid() AND theirs.user_id = profiles.id
    )
  );

DROP POLICY IF EXISTS profiles_insert_self ON profiles;
CREATE POLICY profiles_insert_self ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_self ON profiles;
CREATE POLICY profiles_update_self ON profiles FOR UPDATE
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS subscriptions_select_self ON subscriptions;
CREATE POLICY subscriptions_select_self ON subscriptions FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS subscriptions_upsert_self ON subscriptions;
CREATE POLICY subscriptions_upsert_self ON subscriptions FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS subscriptions_update_self ON subscriptions;
CREATE POLICY subscriptions_update_self ON subscriptions FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS subscription_limits_read_all ON subscription_limits;
CREATE POLICY subscription_limits_read_all ON subscription_limits FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS events_select_member ON events;
CREATE POLICY events_select_member ON events FOR SELECT
  USING (is_event_member(id));

DROP POLICY IF EXISTS events_insert_host ON events;
CREATE POLICY events_insert_host ON events FOR INSERT
  WITH CHECK (host_id = auth.uid());

DROP POLICY IF EXISTS events_update_host ON events;
CREATE POLICY events_update_host ON events FOR UPDATE
  USING (host_id = auth.uid()) WITH CHECK (host_id = auth.uid());

DROP POLICY IF EXISTS events_delete_host ON events;
CREATE POLICY events_delete_host ON events FOR DELETE
  USING (host_id = auth.uid());

DROP POLICY IF EXISTS event_members_select_co_member ON event_members;
CREATE POLICY event_members_select_co_member ON event_members FOR SELECT
  USING (is_event_member(event_id));

DROP POLICY IF EXISTS event_members_insert_self_or_host ON event_members;
CREATE POLICY event_members_insert_self_or_host ON event_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR is_event_host(event_id)
  );

DROP POLICY IF EXISTS event_members_update_self_or_host ON event_members;
CREATE POLICY event_members_update_self_or_host ON event_members FOR UPDATE
  USING (user_id = auth.uid() OR is_event_host(event_id))
  WITH CHECK (user_id = auth.uid() OR is_event_host(event_id));

DROP POLICY IF EXISTS event_members_delete_self_or_host ON event_members;
CREATE POLICY event_members_delete_self_or_host ON event_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR (is_event_host(event_id) AND role <> 'host')
  );

DROP POLICY IF EXISTS media_items_select_member ON media_items;
CREATE POLICY media_items_select_member ON media_items FOR SELECT
  USING (
    is_event_member(event_id)
    AND deleted_at IS NULL
    AND (hidden_by_host_at IS NULL OR is_event_host(event_id) OR owner_id = auth.uid())
  );

DROP POLICY IF EXISTS media_items_insert_member ON media_items;
CREATE POLICY media_items_insert_member ON media_items FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
    AND is_event_member(event_id)
    AND storage_path LIKE event_id::TEXT || '/' || auth.uid()::TEXT || '/%'
    AND (thumb_path IS NULL OR thumb_path LIKE event_id::TEXT || '/' || auth.uid()::TEXT || '/%')
  );

DROP POLICY IF EXISTS media_items_update_owner_or_host ON media_items;
CREATE POLICY media_items_update_owner_or_host ON media_items FOR UPDATE
  USING (owner_id = auth.uid() OR is_event_host(event_id))
  WITH CHECK (owner_id = auth.uid() OR is_event_host(event_id));

DROP POLICY IF EXISTS media_items_delete_owner_or_host ON media_items;
CREATE POLICY media_items_delete_owner_or_host ON media_items FOR DELETE
  USING (owner_id = auth.uid() OR is_event_host(event_id));

DROP POLICY IF EXISTS nudges_select_member ON nudges;
CREATE POLICY nudges_select_member ON nudges FOR SELECT
  USING (is_event_member(event_id));

DROP POLICY IF EXISTS nudges_insert_host ON nudges;
CREATE POLICY nudges_insert_host ON nudges FOR INSERT
  WITH CHECK (sent_by = auth.uid() AND is_event_host(event_id));

DROP POLICY IF EXISTS reminders_log_select_self_or_host ON reminders_log;
CREATE POLICY reminders_log_select_self_or_host ON reminders_log FOR SELECT
  USING (
    user_id = auth.uid()
    OR (event_id IS NOT NULL AND is_event_host(event_id))
  );

DROP POLICY IF EXISTS event_pro_unlocks_select_self_or_host ON event_pro_unlocks;
CREATE POLICY event_pro_unlocks_select_self_or_host ON event_pro_unlocks FOR SELECT
  USING (user_id = auth.uid() OR is_event_host(event_id));

DROP POLICY IF EXISTS event_pro_unlocks_insert_self ON event_pro_unlocks;
CREATE POLICY event_pro_unlocks_insert_self ON event_pro_unlocks FOR INSERT
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON subscriptions TO authenticated;
GRANT SELECT ON subscription_limits TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON event_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON media_items TO authenticated;
GRANT SELECT, INSERT ON nudges TO authenticated;
GRANT SELECT ON reminders_log TO authenticated;
GRANT SELECT, INSERT ON event_pro_unlocks TO authenticated;
