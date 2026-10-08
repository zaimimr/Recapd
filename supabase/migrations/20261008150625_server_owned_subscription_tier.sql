create or replace function public.enforce_server_owned_subscription_tier()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
	jwt_role text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
begin
	if jwt_role = 'service_role'
		or (jwt_role is null and current_user in ('postgres', 'service_role', 'supabase_admin')) then
		return new;
	end if;

	if tg_op = 'INSERT' then
		new.subscription_tier := 'free';
		new.subscription_synced_at := null;
	else
		new.subscription_tier := old.subscription_tier;
		new.subscription_synced_at := old.subscription_synced_at;
	end if;

	return new;
end;
$$;

drop trigger if exists enforce_server_owned_subscription_tier on public.users;

create trigger enforce_server_owned_subscription_tier
before insert or update on public.users
for each row
execute function public.enforce_server_owned_subscription_tier();
