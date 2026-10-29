create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  email text not null,
  reminder_opt_in boolean not null default true,
  reminder_time time without time zone not null default '09:00:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (char_length(btrim(username)) between 2 and 24),
  constraint profiles_email_valid check (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$')
);

create index if not exists profiles_reminder_opt_in_idx on public.profiles (reminder_opt_in, reminder_time);

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do update set
    username = excluded.username,
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.reminder_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deadline_id text not null,
  deadline_title text not null,
  due_at timestamptz not null,
  reminder_type text not null default 'daily',
  status text not null default 'pending',
  scheduled_for timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reminder_events_user_pending_idx on public.reminder_events (user_id, status, scheduled_for);

alter table public.reminder_events enable row level security;
alter table public.reminder_events force row level security;

revoke all on public.reminder_events from anon;
grant select, insert, update on public.reminder_events to authenticated;

drop policy if exists "reminder_events_select_own" on public.reminder_events;
drop policy if exists "reminder_events_insert_own" on public.reminder_events;
drop policy if exists "reminder_events_update_own" on public.reminder_events;

create policy "reminder_events_select_own" on public.reminder_events
  for select to authenticated
  using (user_id = auth.uid());

create policy "reminder_events_insert_own" on public.reminder_events
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "reminder_events_update_own" on public.reminder_events
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
