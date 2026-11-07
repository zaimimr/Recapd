create or replace function public.extend_pro_host_events()
returns integer
language sql
security definer
set search_path = public
as $$
	with extended as (
		update public.events e
		set expires_at = now() + interval '30 days'
		from public.users u
		where u.id = e.created_by_user_id
			and u.subscription_tier = 'pro'
			and e.expires_at < now() + interval '3 days'
		returning e.id
	)
	select count(*)::integer from extended;
$$;

revoke all on function public.extend_pro_host_events() from public, anon, authenticated;
grant execute on function public.extend_pro_host_events() to service_role;
