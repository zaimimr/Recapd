create or replace function public.can_join_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select
		case
			when exists (
				select 1
				from public.event_participants ep
				where ep.event_id = target_event_id
					and ep.user_id = public.current_user_profile_id()
			) then true
			when lim.expires_at < now() then false
			when lim.max_participants is null then true
			else (
				select count(*)
				from public.event_participants ep
				where ep.event_id = target_event_id
			) < lim.max_participants
		end
	from (
		select
			e.expires_at,
			public.get_event_participant_limit(target_event_id) as max_participants
		from public.events e
		where e.id = target_event_id
	) lim;
$$;

revoke execute on function public.can_join_event(uuid) from public, anon;
revoke execute on function public.get_event_participant_limit(uuid) from public, anon;
grant execute on function public.can_join_event(uuid) to authenticated;
grant execute on function public.get_event_participant_limit(uuid) to authenticated;
