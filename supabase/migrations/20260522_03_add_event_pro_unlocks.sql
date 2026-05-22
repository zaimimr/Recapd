CREATE TABLE IF NOT EXISTS event_pro_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  platform TEXT,
  transaction_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_pro_unlocks_event ON event_pro_unlocks (event_id);
CREATE INDEX IF NOT EXISTS idx_event_pro_unlocks_user ON event_pro_unlocks (user_id);

ALTER TABLE event_pro_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read event pro unlocks"
  ON event_pro_unlocks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_participants
      WHERE event_participants.event_id = event_pro_unlocks.event_id
    )
  );

CREATE POLICY "Anyone can insert event pro unlocks"
  ON event_pro_unlocks FOR INSERT
  WITH CHECK (true);
