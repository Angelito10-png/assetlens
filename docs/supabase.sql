-- AssetLens accounts: one row of saved settings per user.
-- Run in Supabase → SQL Editor → New query → Run. Safe to run again.
create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

-- Let signed-in users reach the table through the Data API at all
-- (newer projects don't grant this automatically). Row-level security below
-- still limits each user to their own row; visitors who aren't signed in get nothing.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.user_data to authenticated;
revoke all on public.user_data from anon;

-- Each signed-in user can see and change only their own row.
drop policy if exists "read own data" on public.user_data;
drop policy if exists "insert own data" on public.user_data;
drop policy if exists "update own data" on public.user_data;
drop policy if exists "delete own data" on public.user_data;
create policy "read own data" on public.user_data for select to authenticated using (auth.uid() = user_id);
create policy "insert own data" on public.user_data for insert to authenticated with check (auth.uid() = user_id);
create policy "update own data" on public.user_data for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own data" on public.user_data for delete to authenticated using (auth.uid() = user_id);

-- Make the Data API see the change right away.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------- help assistant (AI)
-- How many questions each user asked today, so the free AI quota isn't used up by one person.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security; -- no policies: only the function below touches it

-- Adds one question for the signed-in user and returns today's total.
create or replace function public.bump_ai_usage() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.ai_usage as u (user_id, day, count) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  returning u.count into n;
  return n;
end $$;
revoke all on function public.bump_ai_usage() from public, anon;
grant execute on function public.bump_ai_usage() to authenticated;

notify pgrst, 'reload schema';
