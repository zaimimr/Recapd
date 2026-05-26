create extension if not exists pg_net;

create or replace function public.trigger_hls_processing()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  function_url text;
  webhook_secret text;
  anon_key text;
begin
  if new.media_type <> 'video' then
    return new;
  end if;
  if new.hls_path is not null then
    return new;
  end if;
  if new.deleted_at is not null then
    return new;
  end if;

  begin
    select decrypted_secret into anon_key
      from vault.decrypted_secrets
      where name = 'anon_key';
  exception when others then
    anon_key := null;
  end;

  begin
    select decrypted_secret into webhook_secret
      from vault.decrypted_secrets
      where name = 'hls_webhook_secret';
  exception when others then
    webhook_secret := null;
  end;

  function_url := 'https://zfrpwfuihfpoqyexbwng.supabase.co/functions/v1/process-video-hls';

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce(anon_key, ''),
      'x-webhook-secret', coalesce(webhook_secret, ''),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'table', 'media_items',
      'record', jsonb_build_object(
        'id', new.id,
        'storage_path', new.storage_path,
        'media_type', new.media_type,
        'hls_path', new.hls_path
      )
    )
  );

  return new;
exception when others then
  raise warning 'trigger_hls_processing failed for media %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists media_items_hls_processing on public.media_items;
create trigger media_items_hls_processing
  after insert on public.media_items
  for each row
  execute function public.trigger_hls_processing();

comment on function public.trigger_hls_processing() is
  'Fires after a new video media_item is inserted. Calls the process-video-hls edge function via pg_net to generate an HLS byte-range manifest. Failures are logged as warnings to avoid blocking inserts.';
