-- Run only on a disposable local Supabase database after both Stage 3A migrations.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, netra_private, auth;
select plan(23);

insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'push-a@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'push-b@example.invalid', '', '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;
select netra_private.provision_push_firebase_app('test-netra-app-id', false);
select netra_private.provision_push_firebase_app('test-netra-app-id', true);
select is((select enabled from netra_private.push_firebase_config where singleton), true, 'private Firebase app configuration can be owner-provisioned');
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);

select is((public.push_edge_opt_in('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','push-consent-v1','21111111-1111-4111-8111-111111111111','test-netra-app-id')->>'generation')::bigint,1::bigint,'explicit Edge opt-in creates generation one');
select is((public.push_edge_opt_in('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','push-consent-v1','21111111-1111-4111-8111-111111111111','test-netra-app-id')->>'generation')::bigint,1::bigint,'matching opt-in operation retry returns original result');
select is((select count(*)::integer from netra_private.push_device_consents where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),1,'opt-in retry does not duplicate consent history');
select is((public.push_edge_register('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',1,'cAAAAAAAAAAAAAAAAAAAAA','[{"version":"v1","fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb,'31111111-1111-4111-8111-111111111111','test-netra-app-id')->>'state'),'active','trusted registration activates current consent generation');
select is((public.push_pause_device('11111111-1111-4111-8111-111111111111',1,'41111111-1111-4111-8111-111111111111')->>'generation')::bigint,2::bigint,'pause increments generation');
select is((public.push_pause_device('11111111-1111-4111-8111-111111111111',1,'41111111-1111-4111-8111-111111111111')->>'generation')::bigint,2::bigint,'matching pause retry replays before stale generation check');
select is((public.push_pause_device('11111111-1111-4111-8111-111111111111',2,'51111111-1111-4111-8111-111111111111')->>'generation')::bigint,2::bigint,'already-paused device does not advance generation again');
select is((public.push_edge_register('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',1,'cAAAAAAAAAAAAAAAAAAAAA','[{"version":"v1","fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb,'61111111-1111-4111-8111-111111111111','test-netra-app-id')->>'code'),'STALE_GENERATION','delayed registration cannot reactivate after pause');
select is((public.push_edge_opt_in('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','push-consent-v1','71111111-1111-4111-8111-111111111111','test-netra-app-id')->>'state'),'pending','second device reserves slot');
select is((public.push_edge_opt_in('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','push-consent-v1','81111111-1111-4111-8111-111111111111','test-netra-app-id')->>'state'),'pending','third device reserves final slot');
select is((public.push_edge_opt_in('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','55555555-5555-4555-8555-555555555555','push-consent-v1','91111111-1111-4111-8111-111111111111','test-netra-app-id')->>'code'),'DEVICE_LIMIT','fourth device is refused');
select is((public.push_edge_resume('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',2,'a1111111-1111-4111-8111-111111111111','test-netra-app-id')->>'registration_required')::boolean,true,'resume reuses its paused slot while three slots are occupied');
select is((public.push_edge_resume('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',2,'b1111111-1111-4111-8111-111111111111','test-netra-app-id')->>'code'),'STALE_GENERATION','delayed resume is rejected after the first resume advanced generation');
select is((public.push_edge_register('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333',1,'cAAAAAAAAAAAAAAAAAAAAA','[{"version":"v1","fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb,'c1111111-1111-4111-8111-111111111111','test-netra-app-id')->>'code'),'FID_ALREADY_CLAIMED','an FID cannot be claimed by a second device');
select is((public.push_revoke_device('11111111-1111-4111-8111-111111111111',3,'d1111111-1111-4111-8111-111111111111')->>'state'),'revoked','revoke releases FID and app consent');
select is((public.push_edge_opt_in('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','88888888-8888-4888-8888-888888888888','push-consent-v1','e1111111-1111-4111-8111-111111111111','test-netra-app-id')->>'state'),'pending','other account can independently opt in');
select is((public.push_edge_register('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','88888888-8888-4888-8888-888888888888',1,'cAAAAAAAAAAAAAAAAAAAAA','[{"version":"v1","fingerprint":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]'::jsonb,'f1111111-1111-4111-8111-111111111111','test-netra-app-id')->>'state'),'active','released FID can be registered by a different account');

-- Simulate a pre-existing identity outside the final no-whitespace registration
-- shape. Disable only this validation trigger for the fixture insert, then
-- restore it before exercising ordinary lifecycle updates.
alter table netra_private.push_devices disable trigger push_devices_validate_fid;
insert into netra_private.push_devices(
  user_id, client_instance_id, registration_generation, status, app_consent,
  consent_version, consented_at, fid
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '99999999-9999-4999-8999-999999999999',
  1, 'active', true, 'legacy-consent-v1', now(), 'legacy fid'
);
alter table netra_private.push_devices enable trigger push_devices_validate_fid;
select is((public.push_pause_device('99999999-9999-4999-8999-999999999999',1,'01111111-1111-4111-8111-111111111111')->>'state'),'paused','legacy FID device can be paused');
select is((select fid from netra_private.push_devices where client_instance_id='99999999-9999-4999-8999-999999999999'),'legacy fid','pause preserves the legacy FID unchanged');
select is((public.push_revoke_device('99999999-9999-4999-8999-999999999999',2,'02111111-1111-4111-8111-111111111111')->>'state'),'revoked','legacy FID device can be permanently revoked');
select is((select fid from netra_private.push_devices where client_instance_id='99999999-9999-4999-8999-999999999999'),null,'revocation clears the legacy FID');

select set_config('request.jwt.claim.role','authenticated',true);
select ok(not has_function_privilege('authenticated','public.push_edge_register(uuid,uuid,bigint,text,jsonb,uuid,text)','EXECUTE'),'authenticated role cannot execute server registration RPC');
select * from finish();
rollback;
