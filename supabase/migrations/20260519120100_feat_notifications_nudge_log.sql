create table if not exists public.nudge_log (
	id uuid primary key default gen_random_uuid(),
	event_id uuid not null,
	host_id uuid not null references auth.users(id) on delete cascade,
	kind text not null check (kind in ('host_broadcast', 'day_after_auto')),
	sent_at timestamptz not null default now(),
	recipient_count int not null default 0,
	created_at timestamptz not null default now()
);

create index if not exists nudge_log_event_kind_sent_idx
	on public.nudge_log (event_id, kind, sent_at desc);

alter table public.nudge_log enable row level security;

drop policy if exists "nudge_log_select_host" on public.nudge_log;
create policy "nudge_log_select_host"
	on public.nudge_log
	for select
	using (auth.uid() = host_id);

drop policy if exists "nudge_log_insert_host" on public.nudge_log;
create policy "nudge_log_insert_host"
	on public.nudge_log
	for insert
	with check (auth.uid() = host_id);
