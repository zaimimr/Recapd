ALTER TABLE event_participants
ADD COLUMN IF NOT EXISTS push_token TEXT;

CREATE INDEX IF NOT EXISTS idx_event_participants_push_token
ON event_participants (event_id)
WHERE push_token IS NOT NULL;
