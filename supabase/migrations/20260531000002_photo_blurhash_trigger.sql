create extension if not exists pg_net;

create or replace function public.trigger_photo_blurhash()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  function_url text;
  anon_key text;
begin
  if new.blurhash is not null then
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

  function_url := 'https://zfrpwfuihfpoqyexbwng.supabase.co/functions/v1/generate-photo-blurhash';

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce(anon_key, ''),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'table', 'media_items',
      'record', jsonb_build_object(
        'id', new.id,
        'storage_path', new.storage_path,
        'thumbnail_path', new.thumbnail_path,
        'media_type', new.media_type,
        'blurhash', new.blurhash
      )
    )
  );

  return new;
exception when others then
  raise warning 'trigger_photo_blurhash failed for media %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists media_items_photo_blurhash on public.media_items;
create trigger media_items_photo_blurhash
  after insert on public.media_items
  for each row
  execute function public.trigger_photo_blurhash();

comment on function public.trigger_photo_blurhash() is
  'Fires after a new media_item is inserted. Calls the generate-photo-blurhash edge function via pg_net to compute a blurhash placeholder. Failures are logged as warnings to avoid blocking inserts.';
