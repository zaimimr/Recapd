create table if not exists public.push_tokens (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users(id) on delete cascade,
	expo_token text not null,
	device_id text,
	platform text check (platform in ('ios', 'android', 'web')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create unique index if not exists push_tokens_user_token_idx
	on public.push_tokens (user_id, expo_token);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own"
	on public.push_tokens
	for select
	using (auth.uid() = user_id);

drop policy if exists "push_tokens_insert_own" on public.push_tokens;
create policy "push_tokens_insert_own"
	on public.push_tokens
	for insert
	with check (auth.uid() = user_id);

drop policy if exists "push_tokens_update_own" on public.push_tokens;
create policy "push_tokens_update_own"
	on public.push_tokens
	for update
	using (auth.uid() = user_id)
	with check (auth.uid() = user_id);

drop policy if exists "push_tokens_delete_own" on public.push_tokens;
create policy "push_tokens_delete_own"
	on public.push_tokens
	for delete
	using (auth.uid() = user_id);

create or replace function public.touch_push_tokens_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at := now();
	return new;
end;
$$;

drop trigger if exists push_tokens_set_updated_at on public.push_tokens;
create trigger push_tokens_set_updated_at
	before update on public.push_tokens
	for each row
	execute function public.touch_push_tokens_updated_at();
