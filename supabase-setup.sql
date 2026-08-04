-- Run this file once in Supabase SQL Editor.
-- Before running the last INSERT block, replace emails with real user emails.

create table if not exists public.dashboard_allowed_users (
  email text primary key,
  role text not null default 'editor',
  created_at timestamptz not null default now()
);

alter table public.dashboard_allowed_users enable row level security;

create table if not exists public.dashboard_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

alter table public.dashboard_state enable row level security;

create or replace function public.is_dashboard_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.dashboard_allowed_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

drop policy if exists dashboard_state_select on public.dashboard_state;
drop policy if exists dashboard_state_insert on public.dashboard_state;
drop policy if exists dashboard_state_update on public.dashboard_state;
drop policy if exists dashboard_state_delete on public.dashboard_state;

create policy dashboard_state_select
on public.dashboard_state
for select
to authenticated
using (
  id = 'studio-main'
  and public.is_dashboard_allowed()
);

create policy dashboard_state_insert
on public.dashboard_state
for insert
to authenticated
with check (
  id = 'studio-main'
  and public.is_dashboard_allowed()
);

create policy dashboard_state_update
on public.dashboard_state
for update
to authenticated
using (
  id = 'studio-main'
  and public.is_dashboard_allowed()
)
with check (
  id = 'studio-main'
  and public.is_dashboard_allowed()
);

create policy dashboard_state_delete
on public.dashboard_state
for delete
to authenticated
using (
  id = 'studio-main'
  and public.is_dashboard_allowed()
);

insert into public.dashboard_state (id, data)
values ('studio-main', '{}'::jsonb)
on conflict (id) do nothing;

-- Replace these two emails before running this block.
-- If you have not created users yet, first add them in Authentication -> Users.
insert into public.dashboard_allowed_users (email, role)
values
  ('YOUR_EMAIL@example.com', 'owner'),
  ('ANYA_EMAIL@example.com', 'editor')
on conflict (email) do update
set role = excluded.role;
