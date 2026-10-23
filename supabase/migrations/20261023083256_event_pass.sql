alter table public.events
	add column if not exists event_pass_at timestamptz,
	add column if not exists event_pass_transaction_id text unique;

create or replace function public.enforce_server_owned_event_pass()
returns trigger
language plpgsql
set search_path = public
as $$
declare
	jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
begin
	if jwt_role = 'service_role'
		or (jwt_role is null and current_user in ('postgres', 'service_role', 'supabase_admin')) then
		return new;
	end if;

	if tg_op = 'INSERT' then
		new.event_pass_at := null;
		new.event_pass_transaction_id := null;
	else
		new.event_pass_at := old.event_pass_at;
		new.event_pass_transaction_id := old.event_pass_transaction_id;
	end if;

	return new;
end;
$$;

drop trigger if exists enforce_server_owned_event_pass on public.events;
create trigger enforce_server_owned_event_pass
	before insert or update on public.events
	for each row execute function public.enforce_server_owned_event_pass();

create or replace function public.event_host_plan_id(p_event_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
	select case
		when e.event_pass_at is not null then 'pro'
		else coalesce(hu.subscription_tier, 'free')
	end
	from public.events e
	left join public.users hu on hu.id = e.created_by_user_id
	where e.id = p_event_id;
$$;

revoke execute on function public.event_host_plan_id(uuid) from public, anon, authenticated;

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
	left join public.subscription_plans hp on hp.id = public.event_host_plan_id(e.id)
	left join public.subscription_plans fp on fp.id = 'free'
	where e.id = target_event_id;
$$;

create or replace function public.media_duration_limit_ms(p_event_id uuid, p_uploader uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
	select greatest(
		coalesce((hp.capabilities->>'maxSingleVideoDurationMs')::bigint, 30000),
		coalesce((up.capabilities->>'maxSingleVideoDurationMs')::bigint, 30000)
	)
	from public.events e
	join public.subscription_plans hp on hp.id = public.event_host_plan_id(e.id)
	left join public.users uu on uu.id = p_uploader
	left join public.subscription_plans up on up.id = uu.subscription_tier
	where e.id = p_event_id;
$$;

create or replace function public.media_size_limit_bytes(p_event_id uuid, p_uploader uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
	select greatest(
		coalesce((hp.capabilities->>'maxSingleFileSizeBytes')::bigint, 524288000),
		coalesce((up.capabilities->>'maxSingleFileSizeBytes')::bigint, 524288000)
	)
	from public.events e
	join public.subscription_plans hp on hp.id = public.event_host_plan_id(e.id)
	left join public.users uu on uu.id = p_uploader
	left join public.subscription_plans up on up.id = uu.subscription_tier
	where e.id = p_event_id;
$$;

create or replace function public.get_event_preview(join_code_input text)
returns table(id uuid, title text, starts_at timestamptz, ends_at timestamptz, timezone text, join_code text, created_by_user_id uuid, status text, expires_at timestamptz, created_at timestamptz, updated_at timestamptz, last_host_reminder_at timestamptz, deletion_delayed_at timestamptz, participant_count bigint, host_plan_id text, host_is_pro boolean, location text, dress_code text, details text, schedule jsonb)
language sql
stable
security definer
set search_path = public
as $$
	select
		e.id,
		e.title,
		e.starts_at,
		e.ends_at,
		e.timezone,
		e.join_code,
		e.created_by_user_id,
		e.status,
		e.expires_at,
		e.created_at,
		e.updated_at,
		e.last_host_reminder_at,
		e.deletion_delayed_at,
		count(ep.id) as participant_count,
		public.event_host_plan_id(e.id) as host_plan_id,
		public.event_host_plan_id(e.id) = 'pro' as host_is_pro,
		e.location,
		e.dress_code,
		e.details,
		e.schedule
	from public.events e
	left join public.event_participants ep on ep.event_id = e.id
	where e.join_code = upper(join_code_input)
	group by e.id
	limit 1;
$$;
