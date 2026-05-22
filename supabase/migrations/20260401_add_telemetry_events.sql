-- Add append-only telemetry for app errors and traces.
-- Inserts are authenticated-user only; reads are available to service-role callers and admin JWTs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'telemetry_event_kind'
  ) THEN
    CREATE TYPE telemetry_event_kind AS ENUM ('error', 'trace');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'telemetry_severity'
  ) THEN
    CREATE TYPE telemetry_severity AS ENUM ('debug', 'info', 'warn', 'error', 'fatal');
  END IF;
END $$;

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

CREATE INDEX IF NOT EXISTS idx_telemetry_events_occurred_at
  ON telemetry_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_actor_user_id
  ON telemetry_events(actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_event_kind
  ON telemetry_events(event_kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_trace_id
  ON telemetry_events(trace_id);

ALTER TABLE telemetry_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_telemetry_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', FALSE);
$$;

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

COMMENT ON TABLE telemetry_events IS 'Append-only telemetry for app errors and traces.';
COMMENT ON COLUMN telemetry_events.metadata IS 'Opaque JSON payload for app-specific telemetry attributes.';
