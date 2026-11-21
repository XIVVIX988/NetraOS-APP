-- Run only after the Stage 3A migrations against a disposable local database.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, netra_private, auth;
select plan(20);

insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'authenticated', 'authenticated', 'push-3b-a@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'authenticated', 'authenticated', 'push-3b-b@example.invalid', '', '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
select is(public.push_get_notification_preferences()->>'account_security', 'true', 'account and security is always enabled');
select is(public.push_get_notification_preferences()->>'financial_alerts', 'false', 'financial alerts default off');
select is(public.push_get_notification_preferences()->>'reminders', 'false', 'push reminders default off');
select is(public.push_get_notification_preferences()->>'product_updates', 'false', 'product updates default off');
select is(public.push_get_notification_preferences()->>'announcements_offers', 'false', 'announcements and offers default off');

select is(public.push_set_notification_preference('financial_alerts', true)->>'financial_alerts', 'true', 'authenticated user can enable an optional category');
select public.push_set_notification_preference('reminders', true);
select is(public.push_get_notification_preferences()->>'financial_alerts', 'true', 'updating reminders preserves financial alerts');
select is(public.push_get_notification_preferences()->>'reminders', 'true', 'reminders preference is saved');
select throws_ok(
  $$select public.push_set_notification_preference('account_security', false)$$,
  '22023', 'ESSENTIAL_CATEGORY', 'account and security cannot be disabled'
);
select throws_ok(
  $$select public.push_set_notification_preference('unknown_category', true)$$,
  '22023', 'INVALID_CATEGORY', 'unknown preference categories are rejected'
);

select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.push_get_notification_preferences()$$,
  '28000', 'AUTH_REQUIRED', 'preference reads require an authenticated user'
);
select set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', true);
select is(public.push_get_notification_preferences()->>'financial_alerts', 'false', 'another account starts with independent defaults');
select is(public.push_set_notification_preference('product_updates', true)->>'product_updates', 'true', 'second account can update its own preferences');
select set_config('request.jwt.claim.sub', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);
select is(public.push_get_notification_preferences()->>'product_updates', 'false', 'one account cannot read another account preferences');
select set_config('request.jwt.claim.sub', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', true);
select is(public.push_get_notification_preferences()->>'product_updates', 'true', 'second account retains its own preference');

select ok(not has_table_privilege('authenticated', 'netra_private.push_notification_preferences', 'SELECT'), 'authenticated role has no direct preference table read');
select ok(not has_table_privilege('anon', 'netra_private.push_notification_preferences', 'SELECT'), 'anonymous role has no direct preference table read');
select ok(has_function_privilege('authenticated', 'public.push_get_notification_preferences()', 'EXECUTE'), 'authenticated role can call the scoped read RPC');
select ok(not has_function_privilege('anon', 'public.push_get_notification_preferences()', 'EXECUTE'), 'anonymous role cannot call the scoped read RPC');

delete from auth.users where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
select ok(not exists (select 1 from netra_private.push_notification_preferences where user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 'account deletion cascades preference records');

select * from finish();
rollback;
