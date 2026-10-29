-- Schedules table: stores study schedules tied to a deadline.
create table if not exists public.schedules (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  deadline_id uuid not null references public.deadlines (id) on delete cascade,
  start_date  date not null,
  days        int not null,
  minutes_per_day int not null,
  active      boolean not null default true,
  last_alert_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists schedules_user_updated_idx on public.schedules (user_id, updated_at);

alter table public.schedules enable row level security;
alter table public.schedules force row level security;

revoke all on public.schedules from anon;
grant select, insert, update, delete on public.schedules to authenticated;

drop policy if exists "schedules_select_own" on public.schedules;
drop policy if exists "schedules_insert_own" on public.schedules;
drop policy if exists "schedules_update_own" on public.schedules;
drop policy if exists "schedules_delete_own" on public.schedules;

create policy "schedules_select_own" on public.schedules
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "schedules_insert_own" on public.schedules
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "schedules_update_own" on public.schedules
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "schedules_delete_own" on public.schedules
  for delete to authenticated
  using (user_id = (select auth.uid()));
