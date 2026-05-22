-- Add a remotely configurable subscription catalog
-- Keeps users.subscription_tier as the active plan id while moving plan metadata into catalog tables.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'subscription_unlock_scope'
  ) THEN
    CREATE TYPE subscription_unlock_scope AS ENUM ('none', 'self', 'event', 'both');
  END IF;
END $$;

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
  ALTER COLUMN subscription_tier SET DEFAULT 'free';

UPDATE users
SET subscription_tier = 'free'
WHERE subscription_tier IS NULL
  OR subscription_tier NOT IN ('free', 'pro');

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_subscription_tier_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_subscription_tier_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_subscription_tier_fkey
      FOREIGN KEY (subscription_tier)
      REFERENCES subscription_plans(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active subscription plans" ON subscription_plans;
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
