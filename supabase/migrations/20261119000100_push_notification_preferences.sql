-- Stage 3B: private account-level browser push preferences.
-- Account and security alerts are intentionally not user-configurable.

create table if not exists netra_private.push_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  financial_alerts boolean not null default false,
  reminders boolean not null default false,
  product_updates boolean not null default false,
  announcements_offers boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table netra_private.push_notification_preferences enable row level security;
revoke all on table netra_private.push_notification_preferences from public, anon, authenticated, service_role;

create or replace function public.push_get_notification_preferences()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, netra_private, auth
as $$
declare
  uid uuid := auth.uid();
  prefs netra_private.push_notification_preferences%rowtype;
begin
  if uid is null then
    raise exception using errcode = '28000', message = 'AUTH_REQUIRED';
  end if;

  select * into prefs
  from netra_private.push_notification_preferences
  where user_id = uid;

  if not found then
    return jsonb_build_object(
      'ok', true,
      'account_security', true,
      'financial_alerts', false,
      'reminders', false,
      'product_updates', false,
      'announcements_offers', false
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'account_security', true,
    'financial_alerts', prefs.financial_alerts,
    'reminders', prefs.reminders,
    'product_updates', prefs.product_updates,
    'announcements_offers', prefs.announcements_offers
  );
end;
$$;

create or replace function public.push_set_notification_preference(p_category text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, netra_private, auth
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception using errcode = '28000', message = 'AUTH_REQUIRED';
  end if;
  if p_category is null or p_enabled is null then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST';
  end if;

  case p_category
    when 'financial_alerts' then
      insert into netra_private.push_notification_preferences(user_id, financial_alerts)
      values (uid, p_enabled)
      on conflict (user_id) do update
        set financial_alerts = excluded.financial_alerts, updated_at = now();
    when 'reminders' then
      insert into netra_private.push_notification_preferences(user_id, reminders)
      values (uid, p_enabled)
      on conflict (user_id) do update
        set reminders = excluded.reminders, updated_at = now();
    when 'product_updates' then
      insert into netra_private.push_notification_preferences(user_id, product_updates)
      values (uid, p_enabled)
      on conflict (user_id) do update
        set product_updates = excluded.product_updates, updated_at = now();
    when 'announcements_offers' then
      insert into netra_private.push_notification_preferences(user_id, announcements_offers)
      values (uid, p_enabled)
      on conflict (user_id) do update
        set announcements_offers = excluded.announcements_offers, updated_at = now();
    when 'account_security' then
      raise exception using errcode = '22023', message = 'ESSENTIAL_CATEGORY';
    else
      raise exception using errcode = '22023', message = 'INVALID_CATEGORY';
  end case;

  return public.push_get_notification_preferences();
end;
$$;

alter function public.push_get_notification_preferences() owner to postgres;
alter function public.push_set_notification_preference(text, boolean) owner to postgres;
revoke all on function public.push_get_notification_preferences() from public, anon, authenticated, service_role;
revoke all on function public.push_set_notification_preference(text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.push_get_notification_preferences() to authenticated;
grant execute on function public.push_set_notification_preference(text, boolean) to authenticated;
