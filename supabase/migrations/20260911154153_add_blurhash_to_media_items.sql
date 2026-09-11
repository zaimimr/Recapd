alter table public.media_items
  add column if not exists blurhash text;

comment on column public.media_items.blurhash is
  'Compact blurhash string used as an instant placeholder while the thumbnail loads. Null for legacy rows that have not been backfilled.';
