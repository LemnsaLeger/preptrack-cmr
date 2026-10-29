-- PrepTrack CMR: minimal schema.
-- Guest records stay ONLY in the browser (IndexedDB), so user_id is NOT NULL here.

create table if not exists public.deadlines (
  id          uuid primary key,                       -- generated on the client => idempotent upserts
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  course      text,
  due_at      timestamptz not null,
  completed   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint deadlines_title_length  check (char_length(btrim(title)) between 1 and 100),
  constraint deadlines_course_length check (course is null or char_length(course) <= 20)
);

-- Dashboard query: "my deadlines, soonest first".
create index if not exists deadlines_user_due_idx on public.deadlines (user_id, due_at);
-- Incremental pulls by last change.
create index if not exists deadlines_user_updated_idx on public.deadlines (user_id, updated_at);

alter table public.deadlines enable row level security;
alter table public.deadlines force row level security;

-- Make sure only signed-in users can touch the table at all.
revoke all on public.deadlines from anon;
grant select, insert, update, delete on public.deadlines to authenticated;

drop policy if exists "deadlines_select_own" on public.deadlines;
drop policy if exists "deadlines_insert_own" on public.deadlines;
drop policy if exists "deadlines_update_own" on public.deadlines;
drop policy if exists "deadlines_delete_own" on public.deadlines;

create policy "deadlines_select_own" on public.deadlines
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "deadlines_insert_own" on public.deadlines
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- WITH CHECK stops a user from re-assigning a row to someone else.
create policy "deadlines_update_own" on public.deadlines
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "deadlines_delete_own" on public.deadlines
  for delete to authenticated
  using (user_id = (select auth.uid()));
