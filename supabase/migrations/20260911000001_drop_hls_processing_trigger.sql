-- Retires the HLS byte-range manifest pipeline.
--
-- The manifest never reduced bitrate; it segmented the original file so the client
-- could stream it via a synthesized m3u8. AVPlayer and ExoPlayer already issue HTTP
-- range requests against a signed MP4 URL, and Supabase Storage serves them, so the
-- edge function and its trigger were an extra moving part for no bandwidth win.
--
-- media_items.hls_path is left in place: existing rows still carry manifest paths and
-- dropping the column would be a destructive change for no benefit. Nothing reads it.

drop trigger if exists media_items_hls_processing on public.media_items;
drop function if exists public.trigger_hls_processing();

comment on column public.media_items.hls_path is
  'Deprecated. Byte-range manifest path from the retired process-video-hls pipeline. Unused; playback streams the original file directly.';
