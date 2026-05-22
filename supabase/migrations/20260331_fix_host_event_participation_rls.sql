-- Allow event creators to insert their own host participant row even before
-- standard event SELECT policies would make the event visible to them.

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

DROP POLICY IF EXISTS "Users can join events as themselves" ON event_participants;

CREATE POLICY "Users can join events as themselves"
  ON event_participants FOR INSERT
  WITH CHECK (
    user_id = current_user_profile_id()
    AND (
      role = 'guest'
      OR (
        role = 'host'
        AND can_create_host_participation(event_id)
      )
    )
  );
