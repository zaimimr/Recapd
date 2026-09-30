create table if not exists public.guest_view_rate_limits (
	bucket text primary key,
	window_start timestamptz not null,
	hits integer not null
);

alter table public.guest_view_rate_limits enable row level security;

revoke all on table public.guest_view_rate_limits from anon, authenticated;

create or replace function public.guest_view_rate_limit_hit(
	p_bucket text,
	p_limit integer,
	p_window_seconds integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
	window_length interval := make_interval(secs => p_window_seconds);
	v_start timestamptz;
	v_hits integer;
begin
	insert into public.guest_view_rate_limits as r (bucket, window_start, hits)
	values (p_bucket, now(), 1)
	on conflict (bucket) do update set
		window_start = case when r.window_start <= now() - window_length then now() else r.window_start end,
		hits = case when r.window_start <= now() - window_length then 1 else r.hits + 1 end
	returning r.window_start, r.hits into v_start, v_hits;

	if random() < 0.01 then
		delete from public.guest_view_rate_limits where window_start < now() - interval '1 hour';
	end if;

	if v_hits <= p_limit then
		return 0;
	end if;
	return greatest(1, ceil(extract(epoch from (v_start + window_length - now())))::integer);
end;
$$;

revoke execute on function public.guest_view_rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.guest_view_rate_limit_hit(text, integer, integer) to service_role;
