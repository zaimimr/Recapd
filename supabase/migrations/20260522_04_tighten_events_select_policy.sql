DROP POLICY IF EXISTS "Anyone can view events they participate in" ON events;
CREATE POLICY "Participants can view their events"
  ON events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_participants
      WHERE event_participants.event_id = events.id
    )
  );
