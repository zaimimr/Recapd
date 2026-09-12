create or replace function public.event_media_summaries(p_event_ids uuid[])
returns table (
	event_id uuid,
	cover_path text,
	photo_count integer,
	video_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
	select
		m.event_id,
		(
			array_agg(
				coalesce(m.thumbnail_path, m.storage_path)
				order by m.captured_at desc nulls last, m.uploaded_at desc
			) filter (where coalesce(m.thumbnail_path, m.storage_path) is not null)
		)[1] as cover_path,
		count(*) filter (where m.media_type <> 'video')::integer as photo_count,
		count(*) filter (where m.media_type = 'video')::integer as video_count
	from public.media_items m
	where m.event_id = any(p_event_ids)
		and m.deleted_at is null
		and m.visibility = 'shared'
	group by m.event_id;
$$;

grant execute on function public.event_media_summaries(uuid[]) to anon, authenticated;
