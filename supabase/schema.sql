-- Recapd App Database Schema
-- Run this in Supabase SQL Editor

-- Users (lightweight, anonymous-first)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  device_id TEXT UNIQUE,
  push_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

-- Events
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  join_code TEXT UNIQUE NOT NULL,
  created_by_user_id UUID REFERENCES users(id),
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event Participants
CREATE TABLE event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'guest' CHECK (role IN ('host', 'guest')),
  nickname TEXT,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  push_token TEXT,
  UNIQUE(event_id, user_id)
);

-- Media Items (photos/videos)
CREATE TABLE media_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  uploaded_by_user_id UUID REFERENCES users(id),
  captured_at TIMESTAMPTZ NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  media_type TEXT DEFAULT 'photo' CHECK (media_type IN ('photo', 'video')),
  width INT,
  height INT,
  duration_milliseconds INT,
  file_size_bytes BIGINT,
  storage_path TEXT NOT NULL,
  thumbnail_path TEXT,
  dominant_color TEXT,
  visibility TEXT DEFAULT 'shared' CHECK (visibility IN ('shared', 'hidden', 'deleted')),
  deleted_at TIMESTAMPTZ
);

-- Event Pro Unlocks (per-event consumable purchases)
CREATE TABLE event_pro_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  platform TEXT,
  transaction_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

-- Indexes
CREATE INDEX idx_events_join_code ON events(join_code);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_media_items_event_captured ON media_items(event_id, captured_at);
CREATE INDEX idx_event_participants_event ON event_participants(event_id);
CREATE INDEX idx_event_participants_user ON event_participants(user_id);
CREATE INDEX idx_users_device_id ON users(device_id);
CREATE INDEX idx_event_pro_unlocks_event ON event_pro_unlocks(event_id);
CREATE INDEX idx_event_pro_unlocks_user ON event_pro_unlocks(user_id);

-- Row Level Security Policies

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_pro_unlocks ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view their own profile"
  ON users FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON users FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (true);

-- Events policies
CREATE POLICY "Participants can view their events"
  ON events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_participants
      WHERE event_participants.event_id = events.id
    )
  );

CREATE POLICY "Anyone can create events"
  ON events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Event creators can update their events"
  ON events FOR UPDATE
  USING (true);

-- Event participants policies
CREATE POLICY "Anyone can view participants of their events"
  ON event_participants FOR SELECT
  USING (true);

CREATE POLICY "Anyone can join events"
  ON event_participants FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Participants can leave events"
  ON event_participants FOR DELETE
  USING (true);

-- Media items policies
CREATE POLICY "Participants can view media from their events"
  ON media_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_participants
      WHERE event_participants.event_id = media_items.event_id
    )
  );

CREATE POLICY "Participants can upload media to their events"
  ON media_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_participants
      WHERE event_participants.event_id = media_items.event_id
    )
  );

CREATE POLICY "Users can update their own media"
  ON media_items FOR UPDATE
  USING (true);

CREATE POLICY "Users can delete their own media"
  ON media_items FOR DELETE
  USING (uploaded_by_user_id = auth.uid() OR uploaded_by_user_id IN (
    SELECT id FROM users WHERE device_id IS NOT NULL
  ));

-- Event Pro Unlock policies
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

-- Storage bucket policies (run after creating buckets)
-- Create buckets: 'event-photos' and 'thumbnails'

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for events updated_at
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to update event status based on time
CREATE OR REPLACE FUNCTION update_event_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ends_at < NOW() AND NEW.status != 'expired' AND NEW.status != 'ended' THEN
    NEW.status = 'ended';
  ELSIF NEW.starts_at <= NOW() AND NEW.ends_at > NOW() AND NEW.status = 'scheduled' THEN
    NEW.status = 'live';
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER check_event_status
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_event_status();
