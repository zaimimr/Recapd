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

ALTER TABLE event_pro_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_pro_unlocks_select_self_or_host ON event_pro_unlocks;
CREATE POLICY event_pro_unlocks_select_self_or_host ON event_pro_unlocks FOR SELECT
  USING (user_id = auth.uid() OR is_event_host(event_id));

DROP POLICY IF EXISTS event_pro_unlocks_insert_self ON event_pro_unlocks;
CREATE POLICY event_pro_unlocks_insert_self ON event_pro_unlocks FOR INSERT
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT ON event_pro_unlocks TO authenticated;

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

GRANT EXECUTE ON FUNCTION event_is_pro(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION can_download_full_resolution(target_event_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.event_is_pro(target_event_id), FALSE);
$$;
