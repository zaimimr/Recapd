alter table public.media_items
  add column if not exists hls_path text;

comment on column public.media_items.hls_path is
  'Storage path to the HLS byte-range manifest (.m3u8) for this video. When non-null, clients should prefer this for playback over storage_path. The original storage_path file is still the underlying source bytes referenced by the manifest.';

create index if not exists media_items_pending_hls_idx
  on public.media_items (id)
  where media_type = 'video' and hls_path is null and deleted_at is null;
