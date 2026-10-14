-- Private per-user storage for NetraOS browser records. Run this in the Supabase SQL Editor.
create table if not exists public.netraos_user_data (
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_key text not null check (storage_key like 'netraos-%'),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, storage_key)
);

alter table public.netraos_user_data enable row level security;

revoke all on table public.netraos_user_data from anon, public;
grant select, insert, update, delete on table public.netraos_user_data to authenticated;

drop policy if exists "Users can read their own NetraOS data" on public.netraos_user_data;
create policy "Users can read their own NetraOS data"
  on public.netraos_user_data for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own NetraOS data" on public.netraos_user_data;
create policy "Users can insert their own NetraOS data"
  on public.netraos_user_data for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own NetraOS data" on public.netraos_user_data;
create policy "Users can update their own NetraOS data"
  on public.netraos_user_data for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own NetraOS data" on public.netraos_user_data;
create policy "Users can delete their own NetraOS data"
  on public.netraos_user_data for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.set_netraos_user_data_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists netraos_user_data_updated_at on public.netraos_user_data;
create trigger netraos_user_data_updated_at
  before update on public.netraos_user_data
  for each row execute function public.set_netraos_user_data_updated_at();
