create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null default 'operator' check (role in ('admin', 'operator', 'viewer')),
  active boolean not null default true,
  last_login timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loan_app_state (
  id text primary key default 'main',
  data jsonb not null default '{"clients":[],"loans":[],"payments":[],"users":[],"audit":[]}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint loan_app_state_singleton check (id = 'main')
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  detail text,
  user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role, active)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'operator',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into public.profiles (id, email, name, role, active)
select
  users.id,
  users.email,
  coalesce(users.raw_user_meta_data->>'name', split_part(users.email, '@', 1)),
  'operator',
  true
from auth.users
left join public.profiles on profiles.id = users.id
where profiles.id is null;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute procedure public.touch_updated_at();

create or replace function public.is_active_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
  );
$$;

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles
  where id = auth.uid() and active = true;
$$;

alter table public.profiles enable row level security;
alter table public.loan_app_state enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists "profiles_select_active" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;
drop policy if exists "loan_app_state_select_active" on public.loan_app_state;
drop policy if exists "loan_app_state_write_admin_operator" on public.loan_app_state;
drop policy if exists "audit_select_admin_operator" on public.audit_log;
drop policy if exists "audit_insert_active" on public.audit_log;

create policy "profiles_select_active"
on public.profiles for select
to authenticated
using (public.is_active_user() and (id = auth.uid() or public.current_user_role() = 'admin'));

create policy "profiles_admin_update"
on public.profiles for update
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "loan_app_state_select_active"
on public.loan_app_state for select
to authenticated
using (public.is_active_user());

create policy "loan_app_state_write_admin_operator"
on public.loan_app_state for all
to authenticated
using (public.current_user_role() in ('admin', 'operator'))
with check (public.current_user_role() in ('admin', 'operator'));

create policy "audit_select_admin_operator"
on public.audit_log for select
to authenticated
using (public.current_user_role() in ('admin', 'operator'));

create policy "audit_insert_active"
on public.audit_log for insert
to authenticated
with check (public.is_active_user() and user_id = auth.uid());

insert into public.loan_app_state (id)
values ('main')
on conflict (id) do nothing;

-- Despues de crear el primer usuario en Supabase Auth, convertirlo en administrador:
-- update public.profiles set role = 'admin' where email = 'gian.paredes.2023@gmail.com';
