-- Run only against a disposable local Supabase database with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, netra_private, auth;
select plan(22);

insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'push-a@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'push-b@example.invalid', '', '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

select netra_private.provision_push_firebase_app('test-netra-app-id', false);
select netra_private.provision_push_firebase_app('test-netra-app-id', true);
select ok((select enabled and firebase_app_id = 'test-netra-app-id' from netra_private.push_firebase_config where singleton), 'database config is enabled only after disabled provisioning');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

select is((public.push_begin_opt_in('11111111-1111-4111-8111-111111111111', 'push-consent-v1')->>'generation')::bigint, 1::bigint, 'explicit opt-in issues generation one');
select is((public.push_begin_opt_in('11111111-1111-4111-8111-111111111111', 'push-consent-v1')->>'consent_recorded')::boolean, false, 'duplicate opt-in does not create another consent event');
select is((select count(*)::integer from netra_private.push_device_consents where user_id = auth.uid()), 1, 'only explicit opt-in is recorded');
select is((public.push_register_device('11111111-1111-4111-8111-111111111111', 1, 'fid-fixture-one')->>'state'), 'active', 'valid current generation registers an FID');

select is((public.push_pause_device('11111111-1111-4111-8111-111111111111', 1, '22222222-2222-4222-8222-222222222222')->>'generation')::bigint, 2::bigint, 'pause advances the server generation');
select is((public.push_pause_device('11111111-1111-4111-8111-111111111111', 1, '22222222-2222-4222-8222-222222222222')->>'generation')::bigint, 2::bigint, 'successful pause retry returns stored result before stale-generation rejection');
select is((public.push_register_device('11111111-1111-4111-8111-111111111111', 1, 'fid-fixture-one')->>'code'), 'STALE_GENERATION', 'delayed callback cannot reactivate a paused device');

select is((public.push_begin_opt_in('33333333-3333-4333-8333-333333333333', 'push-consent-v1')->>'state'), 'pending', 'second device reserves a slot');
select is((public.push_begin_opt_in('44444444-4444-4444-8444-444444444444', 'push-consent-v1')->>'state'), 'pending', 'third device reserves the final slot');
select is((public.push_begin_opt_in('55555555-5555-4555-8555-555555555555', 'push-consent-v1')->>'code'), 'DEVICE_LIMIT', 'a fourth device cannot exceed three reserved slots');

select is((public.push_resume_device('11111111-1111-4111-8111-111111111111', '66666666-6666-4666-8666-666666666666')->>'registration_required')::boolean, true, 'resume succeeds for its already-reserved slot when all three slots are occupied');
select is((public.push_register_device('11111111-1111-4111-8111-111111111111', 3, 'fid-fixture-one')->>'state'), 'active', 'resumed registration reuses the current FID ownership');
select is((public.push_register_device('33333333-3333-4333-8333-333333333333', 1, 'fid-fixture-one')->>'code'), 'FID_ALREADY_CLAIMED', 'one FID cannot be claimed by another device');

select is((public.push_revoke_device('11111111-1111-4111-8111-111111111111', 3, '77777777-7777-4777-8777-777777777777')->>'state'), 'revoked', 'revocation clears consent and releases the slot');
select ok((select fid is null and not app_consent from netra_private.push_devices where user_id = auth.uid() and client_instance_id = '11111111-1111-4111-8111-111111111111'), 'revoked row retains no FID and no active consent');

select set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', true);
select is((public.push_begin_opt_in('88888888-8888-4888-8888-888888888888', 'push-consent-v1')->>'generation')::bigint, 1::bigint, 'second account can explicitly opt in independently');
select is((public.push_register_device('88888888-8888-4888-8888-888888888888', 1, 'fid-fixture-one')->>'state'), 'active', 'FID ownership is available after explicit revocation');

select ok(not has_table_privilege('anon', 'netra_private.push_devices', 'SELECT'), 'anonymous role cannot read device rows');
select ok(not has_table_privilege('authenticated', 'netra_private.push_devices', 'SELECT'), 'authenticated role cannot read device rows directly');
select ok(not has_function_privilege('anon', 'public.push_register_device(uuid,bigint,text)', 'EXECUTE'), 'anonymous role cannot execute registration RPC');
select ok(has_function_privilege('authenticated', 'public.push_register_device(uuid,bigint,text)', 'EXECUTE'), 'authenticated role can call its scoped registration RPC');

select * from finish();
rollback;
