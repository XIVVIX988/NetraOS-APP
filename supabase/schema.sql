-- NetraOS Supabase schema. Run once in Supabase Dashboard > SQL Editor.
-- Passwords and login sessions are owned by Supabase Auth; never copy password
-- hashes, PIN hashes, or Supabase access tokens into these application tables.

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null,
  username text not null default '',
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
  notes text not null default '', details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  primary key (user_id,id)
);

create table if not exists public.budget_lines (
  id text not null, user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '', amount numeric(20,2) not null default 0 check (amount >= 0),
  category text not null default '', notes text not null default '', details jsonb not null default '{}'::jsonb,
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

-- Auth is managed by Supabase Auth. It owns server sessions, passwords,
-- confirmation challenges, and password recovery.
