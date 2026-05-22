-- Storage Buckets Setup
-- Run this after applying supabase/schema.sql

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
