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
