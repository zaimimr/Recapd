create or replace function public.get_event_participant_limit(target_event_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
	select nullif(
		coalesce(hp.capabilities, fp.capabilities)->>'maxParticipants',
		''
	)::integer
	from public.events e
	left join public.users hu on hu.id = e.created_by_user_id
	left join public.subscription_plans hp on hp.id = coalesce(hu.subscription_tier, 'free')
	left join public.subscription_plans fp on fp.id = 'free'
	where e.id = target_event_id;
$$;

create or replace function public.can_join_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
	select
		case
			when lim.max_participants is null then true
			else (
				select count(*)
				from public.event_participants ep
				where ep.event_id = target_event_id
			) < lim.max_participants
		end
	from (
		select public.get_event_participant_limit(target_event_id) as max_participants
		from public.events e
		where e.id = target_event_id
	) lim;
$$;

grant execute on function public.get_event_participant_limit(uuid) to anon, authenticated;
grant execute on function public.can_join_event(uuid) to anon, authenticated;

drop policy if exists "Users can join events as themselves" on public.event_participants;

create policy "Users can join events as themselves"
on public.event_participants
for insert
with check (
	(user_id = public.current_user_profile_id())
	and (
		((role = 'guest'::text) and public.can_join_event(event_id))
		or ((role = 'host'::text) and public.can_create_host_participation(event_id))
	)
);

create or replace function public.get_event_upload_limits(p_event_id uuid)
returns table (max_file_size_bytes bigint, max_video_duration_ms bigint)
language sql
stable
security definer
set search_path = public
as $$
	select
		coalesce(
			public.media_size_limit_bytes(p_event_id, public.current_user_profile_id()),
			524288000::bigint
		),
		coalesce(
			public.media_duration_limit_ms(p_event_id, public.current_user_profile_id()),
			30000::bigint
		)
	where public.is_event_participant(p_event_id);
$$;

revoke execute on function public.get_event_upload_limits(uuid) from public, anon;
grant execute on function public.get_event_upload_limits(uuid) to authenticated;
