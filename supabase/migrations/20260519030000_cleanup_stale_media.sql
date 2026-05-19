CREATE OR REPLACE FUNCTION cleanup_stale_media_rows(
  pending_older_than INTERVAL DEFAULT INTERVAL '1 hour',
  failed_older_than INTERVAL DEFAULT INTERVAL '7 days'
)
RETURNS TABLE (deleted_pending BIGINT, deleted_failed BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pending_count BIGINT;
  failed_count BIGINT;
BEGIN
  WITH d AS (
    DELETE FROM public.media_items
    WHERE status = 'pending'
      AND created_at < NOW() - pending_older_than
    RETURNING 1
  )
  SELECT COUNT(*) INTO pending_count FROM d;

  WITH d AS (
    DELETE FROM public.media_items
    WHERE status = 'failed'
      AND created_at < NOW() - failed_older_than
    RETURNING 1
  )
  SELECT COUNT(*) INTO failed_count FROM d;

  RETURN QUERY SELECT pending_count, failed_count;
END;
$$;

REVOKE ALL ON FUNCTION cleanup_stale_media_rows(INTERVAL, INTERVAL) FROM PUBLIC, anon, authenticated;
