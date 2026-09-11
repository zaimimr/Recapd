-- Self-hosted video transcode pipeline.
-- Adds rendition pointers + processing status to media_items, a private bucket
-- for transcoded outputs, and a trigger that hands new videos to the worker.

alter table public.media_items
  add column if not exists playback_hls_path text,
  add column if not exists rendition_path text,
  add column if not exists video_status text not null default 'pending'
    check (video_status in ('pending', 'processing', 'ready', 'failed')),
  add column if not exists video_processed_at timestamptz;

comment on column public.media_items.playback_hls_path is
  'Adaptive HLS master playlist (in video-renditions bucket) produced by the transcode worker. Preferred for playback.';
comment on column public.media_items.rendition_path is
  'Single progressive 720p MP4 fallback produced by the transcode worker.';
comment on column public.media_items.video_status is
  'Transcode lifecycle: pending -> processing -> ready | failed.';

-- Existing videos predate the pipeline; mark them pending so a backfill run picks them up.
update public.media_items
  set video_status = 'pending'
  where media_type = 'video' and video_status is distinct from 'ready';

create index if not exists media_items_video_status_idx
  on public.media_items (video_status)
  where media_type = 'video';

-- Private bucket for HLS segments, master playlists, and posters.
insert into storage.buckets (id, name, public)
  values ('video-renditions', 'video-renditions', false)
  on conflict (id) do nothing;

-- Read access mirrors event-photos: a participant of the event (first path segment
-- is the event_id) can read its renditions. The worker writes under <event_id>/<user_id>/.
drop policy if exists "Participants can read video renditions" on storage.objects;
create policy "Participants can read video renditions"
  on storage.objects for select
  using (
    bucket_id = 'video-renditions'
    and exists (
      select 1
      from public.event_participants ep
      where ep.event_id::text = (storage.foldername(name))[1]
        and ep.user_id = public.current_user_profile_id()
    )
  );

create or replace function public.trigger_video_transcode()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  worker_url text;
  worker_secret text;
begin
  if new.media_type <> 'video' then
    return new;
  end if;
  if new.deleted_at is not null then
    return new;
  end if;
  if new.video_status = 'ready' then
    return new;
  end if;

  begin
    select decrypted_secret into worker_url
      from vault.decrypted_secrets where name = 'transcode_worker_url';
  exception when others then
    worker_url := null;
  end;

  begin
    select decrypted_secret into worker_secret
      from vault.decrypted_secrets where name = 'transcode_worker_secret';
  exception when others then
    worker_secret := null;
  end;

  if worker_url is null or worker_url = '' then
    raise warning 'trigger_video_transcode: transcode_worker_url secret not set; skipping media %', new.id;
    return new;
  end if;

  perform net.http_post(
    url := worker_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', coalesce(worker_secret, '')
    ),
    body := jsonb_build_object(
      'id', new.id,
      'storage_path', new.storage_path,
      'event_id', new.event_id
    )
  );

  return new;
exception when others then
  raise warning 'trigger_video_transcode failed for media %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists media_items_video_transcode on public.media_items;
create trigger media_items_video_transcode
  after insert on public.media_items
  for each row
  execute function public.trigger_video_transcode();

comment on function public.trigger_video_transcode() is
  'Fires after a new video media_item is inserted. POSTs the record to the self-hosted ffmpeg transcode worker (URL/secret from vault). Failures are warnings so inserts never block.';
