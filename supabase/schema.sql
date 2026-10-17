-- NetraOS Supabase schema. Run once in Supabase Dashboard > SQL Editor.
-- Passwords and login sessions are owned by Supabase Auth; never copy password
-- hashes, PIN hashes, or Supabase access tokens into these application tables.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null,
  username text not null default '',
  phone_number text,
  sex text,
  date_of_birth date,
  avatar_data text,
  terms_version text,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists user_profiles_email_lower_unique on public.user_profiles (lower(email));

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.entries (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('asset','liability')),
  name text not null default '',
  category text not null default '',
  amount numeric(20,2) not null default 0 check (amount >= 0),
  notes text not null default '',
  mobile_money_type text,
  mobile_money_reference text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id,id)
);

create table if not exists public.incomes (
  id text not null, user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '', amount numeric(20,2) not null default 0 check (amount >= 0),
  category text not null default '', month text not null default '',
  notes text not null default '', details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  primary key (user_id,id)
);

create table if not exists public.budget_lines (
  id text not null, user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '', amount numeric(20,2) not null default 0 check (amount >= 0),
  category text not null default '', month text not null default '', notes text not null default '', details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  primary key (user_id,id)
);

create table if not exists public.spending (
  id text not null, user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '', amount numeric(20,2) not null default 0 check (amount >= 0),
  category text not null default '', month text not null default '', notes text not null default '', details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  primary key (user_id,id)
);

create table if not exists public.goals (
  id text not null, user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '', current_amount numeric(20,2) not null default 0 check (current_amount >= 0),
  target_amount numeric(20,2) not null default 0 check (target_amount >= 0),
  category text, tier smallint, deadline date, start_amount numeric(20,2) not null default 0,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  primary key (user_id,id)
);

create table if not exists public.achievements (
  user_id uuid not null references auth.users(id) on delete cascade, badge_id text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  primary key (user_id,badge_id)
);

create table if not exists public.currency_rates (
  user_id uuid not null references auth.users(id) on delete cascade, currency_code text not null,
  rate_value numeric(24,10) not null check (rate_value > 0), is_active boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  primary key (user_id,currency_code)
);

create table if not exists public.tax_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mode text not null default 'gross' check (mode in ('gross','net')),
  value numeric(20,2) not null default 0 check (value >= 0),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table if not exists public.audit_log (
  id text not null, user_id uuid not null references auth.users(id) on delete cascade,
  action text not null, occurred_at timestamptz not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  primary key (user_id,id)
);

create table if not exists public.consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  necessary boolean not null default true, analytics boolean not null default false, saved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

-- Device-lock PINs are stored separately from user settings. Clients cannot
-- read or write this table directly; the narrowly scoped RPCs below handle it.
create table if not exists public.user_pins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

-- Enable and enforce owner-only row access across all client-exposed tables.
do $$
declare t text;
begin
  foreach t in array array['user_profiles','user_settings','entries','incomes','budget_lines','spending','goals','achievements','currency_rates','tax_profile','audit_log','consents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists owner_access on public.%I', t);
    execute format('create policy owner_access on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

alter table public.user_pins enable row level security;
revoke all on public.user_pins from public, anon, authenticated;

create or replace function public.set_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, auth
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'PIN must be four digits'; end if;
  insert into public.user_pins (user_id, pin_hash, failed_attempts, locked_until, updated_at)
  values (auth.uid(), extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), 0, null, now())
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
  insert into public.user_settings as current_settings (user_id, settings)
  values (auth.uid(), jsonb_build_object('accountPinEnabled', true))
  on conflict (user_id) do update
    set settings = current_settings.settings || jsonb_build_object('accountPinEnabled', true), updated_at = now();
end;
$$;

create or replace function public.clear_pin()
returns void
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, auth
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.user_pins where user_id = auth.uid();
  insert into public.user_settings as current_settings (user_id, settings)
  values (auth.uid(), jsonb_build_object('accountPinEnabled', false))
  on conflict (user_id) do update
    set settings = current_settings.settings || jsonb_build_object('accountPinEnabled', false), updated_at = now();
end;
$$;

create or replace function public.verify_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, auth
as $$
declare
  pin_row public.user_pins%rowtype;
  next_attempt integer;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'reason', 'wrong');
  end if;
  select * into pin_row from public.user_pins where user_id = auth.uid() for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_pin'); end if;
  if pin_row.locked_until is not null and pin_row.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', pin_row.locked_until);
  end if;
  if pin_row.pin_hash = extensions.crypt(p_pin, pin_row.pin_hash) then
    update public.user_pins set failed_attempts = 0, locked_until = null, updated_at = now()
      where user_id = auth.uid();
    return jsonb_build_object('ok', true);
  end if;
  next_attempt := pin_row.failed_attempts + 1;
  update public.user_pins
    set failed_attempts = case when next_attempt >= 5 then 0 else next_attempt end,
        locked_until = case when next_attempt >= 5 then now() + interval '5 minutes' else null end,
        updated_at = now()
    where user_id = auth.uid();
  return jsonb_build_object(
    'ok', false,
    'reason', case when next_attempt >= 5 then 'locked' else 'wrong' end,
    'attempts_left', greatest(0, 5 - next_attempt),
    'locked_until', case when next_attempt >= 5 then now() + interval '5 minutes' else null end
  );
end;
$$;

create or replace function public.wipe_my_data()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  table_name text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  foreach table_name in array array[
    'user_profiles','user_settings','entries','incomes','budget_lines','spending',
    'goals','achievements','currency_rates','tax_profile','audit_log','consents','user_pins'
  ] loop
    execute format('delete from public.%I where user_id = $1', table_name) using auth.uid();
  end loop;
end;
$$;

revoke all on function public.set_pin(text), public.clear_pin(), public.verify_pin(text), public.wipe_my_data()
  from public, anon;
grant execute on function public.set_pin(text), public.clear_pin(), public.verify_pin(text), public.wipe_my_data()
  to authenticated;

-- Auth is managed by Supabase Auth. It owns server sessions, passwords,
-- confirmation challenges, and password recovery.
