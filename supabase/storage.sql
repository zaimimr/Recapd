INSERT INTO storage.buckets (id, name, public)
VALUES
  ('media-originals', 'media-originals', FALSE),
  ('media-thumbs', 'media-thumbs', FALSE)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS media_originals_select_member ON storage.objects;
DROP POLICY IF EXISTS media_originals_insert_member ON storage.objects;
DROP POLICY IF EXISTS media_originals_delete_owner_or_host ON storage.objects;
DROP POLICY IF EXISTS media_thumbs_select_member ON storage.objects;
DROP POLICY IF EXISTS media_thumbs_insert_member ON storage.objects;
DROP POLICY IF EXISTS media_thumbs_delete_owner_or_host ON storage.objects;

CREATE POLICY media_originals_select_member
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'media-originals'
    AND public.is_event_member(((storage.foldername(name))[1])::UUID)
  );

CREATE POLICY media_originals_insert_member
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'media-originals'
    AND (storage.foldername(name))[2] = auth.uid()::TEXT
    AND public.is_event_member(((storage.foldername(name))[1])::UUID)
  );

CREATE POLICY media_originals_delete_owner_or_host
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'media-originals'
    AND (
      (storage.foldername(name))[2] = auth.uid()::TEXT
      OR public.is_event_host(((storage.foldername(name))[1])::UUID)
    )
  );

CREATE POLICY media_thumbs_select_member
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'media-thumbs'
    AND public.is_event_member(((storage.foldername(name))[1])::UUID)
  );

CREATE POLICY media_thumbs_insert_member
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'media-thumbs'
    AND (storage.foldername(name))[2] = auth.uid()::TEXT
    AND public.is_event_member(((storage.foldername(name))[1])::UUID)
  );

CREATE POLICY media_thumbs_delete_owner_or_host
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'media-thumbs'
    AND (
      (storage.foldername(name))[2] = auth.uid()::TEXT
      OR public.is_event_host(((storage.foldername(name))[1])::UUID)
    )
  );
