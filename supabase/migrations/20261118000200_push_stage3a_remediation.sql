-- Stage 3A remediation. Forward-only; does not send notifications or alter the
-- existing service worker, account-deletion function, or offline cache.

-- Versioned FID fingerprints. HMAC keys remain only in Edge Function secrets.
create table if not exists netra_private.push_fingerprint_keyring (
  singleton boolean primary key default true check (singleton),
  current_version text not null check (current_version ~ '^[a-zA-Z0-9_-]{1,32}$'),
  accepted_versions text[] not null check (cardinality(accepted_versions) between 1 and 2),
  updated_at timestamptz not null default now(),
  check (current_version = any(accepted_versions)),
  check (array_position(accepted_versions, null) is null)
);
create table if not exists netra_private.push_fingerprint_keyring_audit (
  id bigint generated always as identity primary key,
  old_current_version text,
  new_current_version text not null,
  old_accepted_versions text[],
  new_accepted_versions text[] not null,
  changed_by text not null,
  changed_at timestamptz not null default now()
);
insert into netra_private.push_fingerprint_keyring(singleton, current_version, accepted_versions)
values (true, 'v1', array['v1']) on conflict (singleton) do nothing;

create table if not exists netra_private.push_device_fingerprints (
  user_id uuid not null,
  client_instance_id uuid not null,
  key_version text not null check (key_version ~ '^[a-zA-Z0-9_-]{1,32}$'),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, client_instance_id, key_version),
  unique (key_version, fingerprint),
  foreign key (user_id, client_instance_id)
    references netra_private.push_devices(user_id, client_instance_id)
    on update cascade on delete cascade
);
alter table netra_private.push_device_consents
  drop constraint if exists push_device_consents_user_id_client_instance_id_fkey;
alter table netra_private.push_device_consents
  add constraint push_device_consents_device_fk foreign key (user_id, client_instance_id)
    references netra_private.push_devices(user_id, client_instance_id)
    on update cascade on delete cascade;
alter table netra_private.push_device_operations
  add constraint push_device_operations_device_fk foreign key (user_id, client_instance_id)
    references netra_private.push_devices(user_id, client_instance_id)
    on update cascade on delete cascade;

-- The exact generated FID grammar in the pinned Firebase 13.3.0 source could
-- not be independently verified. Use a conservative 1-128 character bound
-- that rejects ASCII spaces and controls, without assuming a precise SDK pattern
-- that could block updates to
-- existing rows. This is shape validation only, not proof of FID ownership.
create or replace function netra_private.is_valid_fid(p_fid text)
returns boolean
language sql immutable strict
set search_path = pg_catalog
as $$
  select length(p_fid) between 1 and 128
     and position(' ' in p_fid) = 0
     and p_fid !~ '[[:cntrl:]]'
$$;
alter function netra_private.is_valid_fid(text) owner to postgres;
revoke all on function netra_private.is_valid_fid(text) from public, anon, authenticated, service_role;

alter table netra_private.push_devices
  drop constraint if exists push_devices_fid_format_check;
alter table netra_private.push_devices
  drop constraint if exists push_device_fid_length;
-- Validate only when a new identity is written. An unrelated pause/update to a
-- legacy row must not be rejected because its historical FID has another
-- format. The registration Edge/RPC path applies the same validator.
create or replace function netra_private.validate_changed_push_fid()
returns trigger
language plpgsql
set search_path = pg_catalog, netra_private
as $$
begin
  if new.fid is not null
     and (tg_op = 'INSERT' or new.fid is distinct from old.fid)
     and not netra_private.is_valid_fid(new.fid) then
    raise exception using errcode = '22023', message = 'invalid push FID';
  end if;
  return new;
end;
$$;
alter function netra_private.validate_changed_push_fid() owner to postgres;
revoke all on function netra_private.validate_changed_push_fid() from public, anon, authenticated, service_role;
drop trigger if exists push_devices_validate_fid on netra_private.push_devices;
create trigger push_devices_validate_fid
  before insert or update of fid on netra_private.push_devices
  for each row execute function netra_private.validate_changed_push_fid();

alter table netra_private.push_device_operations
  drop constraint if exists push_device_operations_operation_type_check;
alter table netra_private.push_device_operations
  add constraint push_device_operations_operation_type_check
  check (operation_type in ('opt_in','register','pause','resume','revoke','recover'));

create table if not exists netra_private.push_rate_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  action text not null check (action in ('opt_in','resume','changed_fid')),
  occurred_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);
create index if not exists push_rate_events_window_idx
  on netra_private.push_rate_events (user_id, action, occurred_at desc);

alter table netra_private.push_fingerprint_keyring enable row level security;
alter table netra_private.push_device_fingerprints enable row level security;
alter table netra_private.push_rate_events enable row level security;
alter table netra_private.push_fingerprint_keyring_audit enable row level security;
revoke all on all tables in schema netra_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema netra_private from public, anon, authenticated, service_role;

-- The keyring contains version identifiers only, never HMAC key material.
create or replace function netra_private.provision_push_fingerprint_keyring(
  p_current_version text, p_accepted_versions text[]
) returns void
language plpgsql
set search_path = pg_catalog, netra_private
as $$
begin
  if current_user <> 'postgres' then raise exception using errcode = '42501'; end if;
  if p_current_version is null or p_current_version !~ '^[a-zA-Z0-9_-]{1,32}$'
     or p_accepted_versions is null or cardinality(p_accepted_versions) not between 1 and 2
     or p_current_version <> all(p_accepted_versions)
     or array_position(p_accepted_versions, null) is not null
     or exists (select 1 from unnest(p_accepted_versions) v where v !~ '^[a-zA-Z0-9_-]{1,32}$')
     or cardinality(p_accepted_versions) <> (select count(distinct v) from unnest(p_accepted_versions) v) then
    raise exception using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('netra-push-keyring', 0));
  insert into netra_private.push_fingerprint_keyring_audit(old_current_version,new_current_version,old_accepted_versions,new_accepted_versions,changed_by)
    select current_version,p_current_version,accepted_versions,p_accepted_versions,session_user from netra_private.push_fingerprint_keyring where singleton;
  update netra_private.push_fingerprint_keyring
     set current_version = p_current_version, accepted_versions = p_accepted_versions, updated_at = now()
   where singleton = true;
end;
$$;
alter function netra_private.provision_push_fingerprint_keyring(text, text[]) owner to postgres;
revoke all on function netra_private.provision_push_fingerprint_keyring(text, text[])
  from public, anon, authenticated, service_role;

create or replace function public.read_push_runtime_config()
returns table(firebase_app_id text, enabled boolean, current_fingerprint_version text, accepted_fingerprint_versions text[])
language plpgsql security definer
set search_path = pg_catalog, netra_private, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode = '42501'; end if;
  return query
    select c.firebase_app_id, c.enabled, k.current_version, k.accepted_versions
      from netra_private.push_firebase_config c
      cross join netra_private.push_fingerprint_keyring k
     where c.singleton and k.singleton;
end;
$$;
alter function public.read_push_runtime_config() owner to postgres;
revoke all on function public.read_push_runtime_config() from public, anon, authenticated, service_role;
grant execute on function public.read_push_runtime_config() to service_role;

-- Old authenticated entry points are closed. Edge-only replacements below
-- verify auth.role() from the signed service-role JWT and accept a user ID only
-- from the independently authenticated Edge Function.
revoke all on function public.push_begin_opt_in(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.push_register_device(uuid, bigint, text) from public, anon, authenticated, service_role;
revoke all on function public.push_resume_device(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.push_get_device_state(p_client_instance_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, netra_private, auth
as $$
declare uid uuid := auth.uid(); d netra_private.push_devices%rowtype;
begin
  if uid is null or p_client_instance_id is null then raise exception using errcode = '28000'; end if;
  select * into d from netra_private.push_devices
   where user_id = uid and client_instance_id = p_client_instance_id;
  if not found then return jsonb_build_object('ok', true, 'state', 'not_registered'); end if;
  return jsonb_build_object('ok', true, 'state', d.status, 'app_consent', d.app_consent,
    'generation', d.registration_generation, 'consent_version', d.consent_version,
    'last_seen_at', d.last_seen_at, 'last_registered_at', d.last_registered_at);
end;
$$;
alter function public.push_get_device_state(uuid) owner to postgres;
revoke all on function public.push_get_device_state(uuid) from public, anon, service_role;
grant execute on function public.push_get_device_state(uuid) to authenticated;

create or replace function public.push_list_devices()
returns jsonb language plpgsql security definer
set search_path = pg_catalog, netra_private, auth
as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception using errcode = '28000'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'client_instance_id', d.client_instance_id, 'state', d.status,
    'generation', d.registration_generation, 'app_consent', d.app_consent,
    'created_at', d.created_at, 'last_seen_at', d.last_seen_at,
    'last_registered_at', d.last_registered_at
  ) order by d.last_seen_at desc nulls last, d.created_at desc), '[]'::jsonb)
  into result from netra_private.push_devices d where d.user_id = uid;
  return result;
end;
$$;
alter function public.push_list_devices() owner to postgres;
revoke all on function public.push_list_devices() from public, anon, service_role;
grant execute on function public.push_list_devices() to authenticated;

create or replace function netra_private.push_store_operation(
  p_user_id uuid, p_operation_id uuid, p_client_instance_id uuid,
  p_operation_type text, p_request_fingerprint text, p_result jsonb
) returns void language sql set search_path = pg_catalog, netra_private as $$
  insert into netra_private.push_device_operations(user_id, operation_id, client_instance_id,
    operation_type, request_fingerprint, result)
  values (p_user_id, p_operation_id, p_client_instance_id, p_operation_type, p_request_fingerprint, p_result)
$$;
alter function netra_private.push_store_operation(uuid, uuid, uuid, text, text, jsonb) owner to postgres;
revoke all on function netra_private.push_store_operation(uuid, uuid, uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.push_edge_opt_in(
  p_user_id uuid, p_client_instance_id uuid, p_consent_version text,
  p_operation_id uuid, p_expected_app_id text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, netra_private, auth, extensions
as $$
declare uid uuid := p_user_id; account_id uuid; candidate_fid text; d netra_private.push_devices%rowtype; device_exists boolean;
  cfg netra_private.push_firebase_config%rowtype; kr netra_private.push_fingerprint_keyring%rowtype;
  old_op netra_private.push_device_operations%rowtype; slots integer; n integer; fp text; result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode = '42501'; end if;
  if uid is null or p_client_instance_id is null or p_operation_id is null or p_expected_app_id is null
     or p_consent_version is null or p_consent_version <> btrim(p_consent_version)
     or length(p_consent_version) not between 1 and 64 then raise exception using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('netra-push-user:' || uid::text, 0));
  select u.id into account_id from auth.users u where u.id = uid for key share;
  if account_id is null then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('netra-push-keyring', 0));
  select fid into candidate_fid from netra_private.push_devices
   where user_id = uid and client_instance_id = p_client_instance_id;
  if candidate_fid is not null then perform pg_advisory_xact_lock(hashtextextended('netra-push-fid:' || candidate_fid, 0)); end if;
  select * into d from netra_private.push_devices
   where user_id = uid and client_instance_id = p_client_instance_id for update;
  device_exists := found;
  if device_exists and d.fid is distinct from candidate_fid then return jsonb_build_object('ok', false, 'code', 'RETRY_STATE_CHANGED'); end if;
  fp := encode(extensions.digest('opt_in|' || p_client_instance_id::text || '|' || p_consent_version || '|' || p_expected_app_id, 'sha256'), 'hex');
  select * into old_op from netra_private.push_device_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if old_op.operation_type <> 'opt_in' or old_op.client_instance_id <> p_client_instance_id or old_op.request_fingerprint <> fp then
      return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
    end if;
    return old_op.result;
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('netra-push-config', 0));
  select * into cfg from netra_private.push_firebase_config where singleton = true;
  if not found or not cfg.enabled or cfg.firebase_app_id is distinct from p_expected_app_id then
    return jsonb_build_object('ok', false, 'code', 'PUSH_NOT_CONFIGURED');
  end if;
  if device_exists and d.app_consent then
    result := jsonb_build_object('ok', true, 'state', d.status, 'generation', d.registration_generation, 'consent_recorded', false);
    perform netra_private.push_store_operation(uid, p_operation_id, p_client_instance_id, 'opt_in', fp, result);
    return result;
  end if;
  select count(*) into slots from netra_private.push_devices where user_id = uid and status in ('pending','active','paused');
  if slots >= 3 and (not device_exists or d.status = 'revoked') then
    result := jsonb_build_object('ok', false, 'code', 'DEVICE_LIMIT');
    perform netra_private.push_store_operation(uid, p_operation_id, p_client_instance_id, 'opt_in', fp, result);
    return result;
  end if;
  select count(*) into n from netra_private.push_rate_events where user_id = uid and action = 'opt_in' and occurred_at > now() - interval '1 hour';
  if n >= 5 then
    select greatest(1, ceil(extract(epoch from (min(occurred_at) + interval '1 hour' - now())))::integer)
      into n from netra_private.push_rate_events where user_id = uid and action = 'opt_in' and occurred_at > now() - interval '1 hour';
    result := jsonb_build_object('ok', false, 'code', 'RATE_LIMITED', 'retry_after_seconds', n);
    perform netra_private.push_store_operation(uid, p_operation_id, p_client_instance_id, 'opt_in', fp, result);
    return result;
  end if;
  if d.user_id is not null then
    delete from netra_private.push_device_fingerprints where user_id = uid and client_instance_id = p_client_instance_id;
    update netra_private.push_devices set registration_generation = registration_generation + 1,
      status = 'pending', app_consent = true, consent_version = p_consent_version,
      consented_at = now(), revoked_at = null, fid = null, updated_at = now()
    where user_id = uid and client_instance_id = p_client_instance_id returning * into d;
  else
    insert into netra_private.push_devices(user_id, client_instance_id, registration_generation, status,
      app_consent, consent_version, consented_at)
    values(uid, p_client_instance_id, 1, 'pending', true, p_consent_version, now()) returning * into d;
  end if;
  insert into netra_private.push_device_consents(user_id, client_instance_id, generation, action, consent_version)
    values(uid, p_client_instance_id, d.registration_generation, 'opt_in', p_consent_version);
  insert into netra_private.push_rate_events(user_id, operation_id, action) values(uid, p_operation_id, 'opt_in');
  result := jsonb_build_object('ok', true, 'state', 'pending', 'generation', d.registration_generation, 'consent_recorded', true);
  perform netra_private.push_store_operation(uid, p_operation_id, p_client_instance_id, 'opt_in', fp, result);
  return result;
end;
$$;

create or replace function public.push_edge_register(
  p_user_id uuid, p_client_instance_id uuid, p_generation bigint, p_fid text,
  p_fingerprints jsonb, p_operation_id uuid, p_expected_app_id text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, netra_private, auth, extensions
as $$
declare uid uuid := p_user_id; account_id uuid; candidate_fid text; d netra_private.push_devices%rowtype;
  cfg netra_private.push_firebase_config%rowtype; kr netra_private.push_fingerprint_keyring%rowtype;
  old_op netra_private.push_device_operations%rowtype; other_owner uuid; slots integer; n integer;
  reqfp text; versions text[]; item jsonb; v text; h text; fid_changed boolean; result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode = '42501'; end if;
  if uid is null or p_client_instance_id is null or p_generation is null or p_generation < 1 or p_operation_id is null
     or p_expected_app_id is null or p_fid is null or not netra_private.is_valid_fid(p_fid)
     or jsonb_typeof(p_fingerprints) is distinct from 'array' then
    raise exception using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('netra-push-user:' || uid::text, 0));
  select u.id into account_id from auth.users u where u.id = uid for key share;
  if account_id is null then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('netra-push-keyring', 0));
  select accepted_versions into versions from netra_private.push_fingerprint_keyring where singleton;
  if not found or jsonb_typeof(p_fingerprints) is distinct from 'array' or jsonb_array_length(p_fingerprints) <> cardinality(versions) then return jsonb_build_object('ok', false, 'code', 'PUSH_NOT_CONFIGURED'); end if;
  for item in select value from jsonb_array_elements(p_fingerprints) loop
    v := item->>'version'; h := item->>'fingerprint';
    if v is null or h is null or v <> all(versions) or h !~ '^[0-9a-f]{64}$'
       or (select count(*) from jsonb_array_elements(p_fingerprints) x where x->>'version' = v) <> 1 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_FINGERPRINTS');
    end if;
  end loop;
  select fid into candidate_fid from netra_private.push_devices where user_id = uid and client_instance_id = p_client_instance_id;
  if candidate_fid is not null and candidate_fid <> p_fid then
    if candidate_fid < p_fid then
      perform pg_advisory_xact_lock(hashtextextended('netra-push-fid:' || candidate_fid, 0));
      perform pg_advisory_xact_lock(hashtextextended('netra-push-fid:' || p_fid, 0));
    else
      perform pg_advisory_xact_lock(hashtextextended('netra-push-fid:' || p_fid, 0));
      perform pg_advisory_xact_lock(hashtextextended('netra-push-fid:' || candidate_fid, 0));
    end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('netra-push-fid:' || p_fid, 0));
  end if;
  select * into d from netra_private.push_devices where user_id = uid and client_instance_id = p_client_instance_id for update;
  if d.user_id is not null and d.fid is distinct from candidate_fid then return jsonb_build_object('ok', false, 'code', 'RETRY_STATE_CHANGED'); end if;
  reqfp := encode(extensions.digest('register|' || uid::text || '|' || p_client_instance_id::text || '|' || p_generation::text || '|' || p_expected_app_id || '|' || p_fingerprints::text, 'sha256'), 'hex');
  select * into old_op from netra_private.push_device_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if old_op.operation_type <> 'register' or old_op.client_instance_id <> p_client_instance_id or old_op.request_fingerprint <> reqfp then return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT'); end if;
    return old_op.result;
  end if;
  if d.user_id is null or not d.app_consent or d.registration_generation <> p_generation or d.status not in ('pending','active','paused') then
    result := jsonb_build_object('ok', false, 'code', 'STALE_GENERATION');
    perform netra_private.push_store_operation(uid, p_operation_id, p_client_instance_id, 'register', reqfp, result);
    return result;
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('netra-push-config', 0));
  select * into cfg from netra_private.push_firebase_config where singleton = true;
  if not found or not cfg.enabled or cfg.firebase_app_id is distinct from p_expected_app_id then
    return jsonb_build_object('ok', false, 'code', 'PUSH_NOT_CONFIGURED');
  end if;
  select user_id into other_owner from netra_private.push_devices where fid = p_fid
    and not (user_id = uid and client_instance_id = p_client_instance_id) limit 1;
  if found then
    result := jsonb_build_object('ok', false, 'code', 'FID_ALREADY_CLAIMED');
    perform netra_private.push_store_operation(uid, p_operation_id, p_client_instance_id, 'register', reqfp, result);
    return result;
  end if;
  select count(*) into slots from netra_private.push_devices where user_id = uid and status in ('pending','active','paused');
  if slots > 3 then
    result := jsonb_build_object('ok', false, 'code', 'DEVICE_LIMIT');
    perform netra_private.push_store_operation(uid, p_operation_id, p_client_instance_id, 'register', reqfp, result);
    return result;
  end if;
  fid_changed := d.fid is not null and d.fid <> p_fid;
  if fid_changed then
    select count(*) into n from netra_private.push_rate_events where user_id = uid and action = 'changed_fid' and occurred_at > now() - interval '1 hour';
    if n >= 10 then
      select greatest(1, ceil(extract(epoch from (min(occurred_at) + interval '1 hour' - now())))::integer) into n
        from netra_private.push_rate_events where user_id = uid and action = 'changed_fid' and occurred_at > now() - interval '1 hour';
      result := jsonb_build_object('ok', false, 'code', 'RATE_LIMITED', 'retry_after_seconds', n);
      perform netra_private.push_store_operation(uid, p_operation_id, p_client_instance_id, 'register', reqfp, result);
      return result;
    end if;
  end if;
  delete from netra_private.push_device_fingerprints where user_id = uid and client_instance_id = p_client_instance_id;
  for item in select value from jsonb_array_elements(p_fingerprints) loop
    insert into netra_private.push_device_fingerprints(user_id, client_instance_id, key_version, fingerprint)
    values(uid, p_client_instance_id, item->>'version', item->>'fingerprint');
  end loop;
  update netra_private.push_devices set fid = p_fid, status = 'active',
    registration_generation = registration_generation + case when fid_changed then 1 else 0 end,
    updated_at = now(), last_seen_at = now(), last_registered_at = now()
  where user_id = uid and client_instance_id = p_client_instance_id returning * into d;
  if fid_changed then insert into netra_private.push_rate_events(user_id, operation_id, action) values(uid, p_operation_id, 'changed_fid'); end if;
  result := jsonb_build_object('ok', true, 'state', 'active', 'generation', d.registration_generation);
  perform netra_private.push_store_operation(uid, p_operation_id, p_client_instance_id, 'register', reqfp, result);
  return result;
end;
$$;

create or replace function public.push_edge_resume(
  p_user_id uuid, p_client_instance_id uuid, p_expected_generation bigint,
  p_operation_id uuid, p_expected_app_id text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, netra_private, auth, extensions
as $$
declare uid uuid := p_user_id; account_id uuid; candidate_fid text; d netra_private.push_devices%rowtype;
  cfg netra_private.push_firebase_config%rowtype; old_op netra_private.push_device_operations%rowtype;
  slots integer; n integer; fp text; result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode = '42501'; end if;
  if uid is null or p_client_instance_id is null or p_operation_id is null or p_expected_app_id is null
     or p_expected_generation is null or p_expected_generation < 1 then raise exception using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('netra-push-user:' || uid::text, 0));
  select u.id into account_id from auth.users u where u.id = uid for key share;
  if account_id is null then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('netra-push-keyring', 0));
  select fid into candidate_fid from netra_private.push_devices where user_id = uid and client_instance_id = p_client_instance_id;
  if candidate_fid is not null then perform pg_advisory_xact_lock(hashtextextended('netra-push-fid:' || candidate_fid, 0)); end if;
  select * into d from netra_private.push_devices where user_id = uid and client_instance_id = p_client_instance_id for update;
  fp := encode(extensions.digest('resume|' || p_client_instance_id::text || '|' || p_expected_generation::text || '|' || p_expected_app_id, 'sha256'), 'hex');
  select * into old_op from netra_private.push_device_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if old_op.operation_type <> 'resume' or old_op.client_instance_id <> p_client_instance_id or old_op.request_fingerprint <> fp then return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT'); end if;
    return old_op.result;
  end if;
  if d.user_id is null or d.registration_generation <> p_expected_generation or not d.app_consent or d.status = 'revoked' then
    result := jsonb_build_object('ok', false, 'code', 'STALE_GENERATION');
    perform netra_private.push_store_operation(uid, p_operation_id, p_client_instance_id, 'resume', fp, result);
    return result;
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('netra-push-config', 0));
  select * into cfg from netra_private.push_firebase_config where singleton;
  if not found or not cfg.enabled or cfg.firebase_app_id is distinct from p_expected_app_id then return jsonb_build_object('ok', false, 'code', 'PUSH_NOT_CONFIGURED'); end if;
  if d.status = 'paused' then
    select count(*) into slots from netra_private.push_devices where user_id = uid and status in ('pending','active','paused') and client_instance_id <> p_client_instance_id;
    if slots >= 3 then result := jsonb_build_object('ok', false, 'code', 'DEVICE_LIMIT');
    else
      select count(*) into n from netra_private.push_rate_events where user_id = uid and action = 'resume' and occurred_at > now() - interval '1 hour';
      if n >= 10 then
        select greatest(1, ceil(extract(epoch from (min(occurred_at) + interval '1 hour' - now())))::integer) into n
          from netra_private.push_rate_events where user_id = uid and action = 'resume' and occurred_at > now() - interval '1 hour';
        result := jsonb_build_object('ok', false, 'code', 'RATE_LIMITED', 'retry_after_seconds', n);
      else
        update netra_private.push_devices set registration_generation = registration_generation + 1, updated_at = now()
         where user_id = uid and client_instance_id = p_client_instance_id returning * into d;
        insert into netra_private.push_rate_events(user_id, operation_id, action) values(uid, p_operation_id, 'resume');
        result := jsonb_build_object('ok', true, 'state', 'paused', 'registration_required', true, 'generation', d.registration_generation);
      end if;
    end if;
  else
    result := jsonb_build_object('ok', true, 'state', d.status, 'generation', d.registration_generation, 'registration_required', d.status = 'pending');
  end if;
  perform netra_private.push_store_operation(uid, p_operation_id, p_client_instance_id, 'resume', fp, result);
  return result;
end;
$$;

create or replace function public.push_edge_recovery_candidate(
  p_user_id uuid, p_fid text, p_fingerprints jsonb, p_expected_app_id text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, netra_private, auth
as $$
declare uid uuid := p_user_id; account_id uuid; candidate_id uuid; d netra_private.push_devices%rowtype;
  versions text[]; item jsonb; v text; h text; cfg netra_private.push_firebase_config%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode = '42501'; end if;
  if uid is null or p_fid is null or not netra_private.is_valid_fid(p_fid)
    or p_expected_app_id is null or jsonb_typeof(p_fingerprints) is distinct from 'array' then raise exception using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('netra-push-user:' || uid::text, 0));
  select u.id into account_id from auth.users u where u.id = uid for key share;
  if account_id is null then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('netra-push-keyring', 0));
  select accepted_versions into versions from netra_private.push_fingerprint_keyring where singleton;
  if not found or jsonb_typeof(p_fingerprints) is distinct from 'array' or jsonb_array_length(p_fingerprints) <> cardinality(versions) then return jsonb_build_object('ok', false, 'code', 'RECOVERY_UNAVAILABLE'); end if;
  for item in select value from jsonb_array_elements(p_fingerprints) loop
    v := item->>'version'; h := item->>'fingerprint';
    if v is null or h is null or v <> all(versions) or h !~ '^[0-9a-f]{64}$'
       or (select count(*) from jsonb_array_elements(p_fingerprints) x where x->>'version' = v) <> 1 then return jsonb_build_object('ok', false, 'code', 'RECOVERY_UNAVAILABLE'); end if;
  end loop;
  perform pg_advisory_xact_lock(hashtextextended('netra-push-fid:' || p_fid, 0));
  select d.client_instance_id into candidate_id
    from netra_private.push_device_fingerprints f join netra_private.push_devices d using (user_id, client_instance_id)
    join jsonb_array_elements(p_fingerprints) x on f.key_version = x->>'version' and f.fingerprint = x->>'fingerprint'
   where d.user_id = uid and d.fid = p_fid
   group by d.client_instance_id having count(distinct f.key_version) = cardinality(versions)
   order by d.client_instance_id limit 1;
  if candidate_id is null then return jsonb_build_object('ok', false, 'code', 'RECOVERY_UNAVAILABLE'); end if;
  select * into d from netra_private.push_devices where user_id = uid and client_instance_id = candidate_id for update;
  if not found or d.fid is distinct from p_fid or not d.app_consent or d.status = 'revoked' then return jsonb_build_object('ok', false, 'code', 'RECOVERY_UNAVAILABLE'); end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('netra-push-config', 0));
  select * into cfg from netra_private.push_firebase_config where singleton;
  if not found or not cfg.enabled or cfg.firebase_app_id is distinct from p_expected_app_id then return jsonb_build_object('ok', false, 'code', 'PUSH_NOT_CONFIGURED'); end if;
  return jsonb_build_object('ok', true, 'client_instance_id', d.client_instance_id,
    'generation', d.registration_generation, 'state', d.status, 'app_consent', d.app_consent);
end;
$$;

create or replace function public.push_edge_recover(
  p_user_id uuid, p_new_client_instance_id uuid, p_previous_client_instance_id uuid,
  p_expected_generation bigint, p_fid text, p_fingerprints jsonb,
  p_operation_id uuid, p_expected_app_id text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, netra_private, auth, extensions
as $$
declare uid uuid := p_user_id; account_id uuid; candidate_id uuid; d netra_private.push_devices%rowtype;
  cfg netra_private.push_firebase_config%rowtype; old_op netra_private.push_device_operations%rowtype;
  item jsonb; v text; h text; versions text[]; fp text; result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode = '42501'; end if;
  if uid is null or p_new_client_instance_id is null or p_previous_client_instance_id is null
    or p_new_client_instance_id = p_previous_client_instance_id or p_expected_generation is null
    or p_expected_generation < 1 or p_operation_id is null or p_expected_app_id is null
    or p_fid is null or not netra_private.is_valid_fid(p_fid)
    or jsonb_typeof(p_fingerprints) is distinct from 'array' then raise exception using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('netra-push-user:' || uid::text, 0));
  select u.id into account_id from auth.users u where u.id = uid for key share;
  if account_id is null then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  fp := encode(extensions.digest('recover|' || p_new_client_instance_id::text || '|' || p_previous_client_instance_id::text || '|' || p_expected_generation::text || '|' || p_expected_app_id || '|' || p_fingerprints::text, 'sha256'), 'hex');
  select * into old_op from netra_private.push_device_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if old_op.operation_type <> 'recover' or old_op.client_instance_id <> p_new_client_instance_id or old_op.request_fingerprint <> fp then return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT'); end if;
    return old_op.result;
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('netra-push-keyring', 0));
  select accepted_versions into versions from netra_private.push_fingerprint_keyring where singleton;
  if not found or jsonb_typeof(p_fingerprints) is distinct from 'array' or jsonb_array_length(p_fingerprints) <> cardinality(versions) then return jsonb_build_object('ok', false, 'code', 'PUSH_NOT_CONFIGURED'); end if;
  for item in select value from jsonb_array_elements(p_fingerprints) loop
    v := item->>'version'; h := item->>'fingerprint';
    if v is null or h is null or v <> all(versions) or h !~ '^[0-9a-f]{64}$'
       or (select count(*) from jsonb_array_elements(p_fingerprints) x where x->>'version' = v) <> 1 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_FINGERPRINTS');
    end if;
  end loop;
  -- The supplied FID lock is acquired before looking up any candidate device.
  -- Fingerprint rows can only be created or changed while holding this same
  -- ownership lock, so a matching row identifies the candidate safely.
  perform pg_advisory_xact_lock(hashtextextended('netra-push-fid:' || p_fid, 0));
  select d.client_instance_id into candidate_id
    from netra_private.push_device_fingerprints f join netra_private.push_devices d using (user_id, client_instance_id)
    join jsonb_array_elements(p_fingerprints) x on f.key_version = x->>'version' and f.fingerprint = x->>'fingerprint'
   where d.user_id = uid and d.fid = p_fid
   group by d.client_instance_id
   having count(distinct f.key_version) = cardinality(versions)
   order by d.client_instance_id limit 1;
  if candidate_id is null or candidate_id <> p_previous_client_instance_id then return jsonb_build_object('ok', false, 'code', 'RECOVERY_UNAVAILABLE'); end if;
  select * into d from netra_private.push_devices where user_id = uid and client_instance_id = candidate_id for update;
  if not found or d.fid is distinct from p_fid or d.registration_generation <> p_expected_generation
    or not d.app_consent or d.status = 'revoked' then return jsonb_build_object('ok', false, 'code', 'RECOVERY_STATE_CHANGED'); end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('netra-push-config', 0));
  select * into cfg from netra_private.push_firebase_config where singleton;
  if not found or not cfg.enabled or cfg.firebase_app_id is distinct from p_expected_app_id then return jsonb_build_object('ok', false, 'code', 'PUSH_NOT_CONFIGURED'); end if;
  if exists (select 1 from netra_private.push_devices where user_id = uid and client_instance_id = p_new_client_instance_id) then return jsonb_build_object('ok', false, 'code', 'DEVICE_ALREADY_EXISTS'); end if;
  update netra_private.push_devices set client_instance_id = p_new_client_instance_id,
    registration_generation = registration_generation + 1, updated_at = now(), last_seen_at = now()
   where user_id = uid and client_instance_id = candidate_id returning * into d;
  result := jsonb_build_object('ok', true, 'state', d.status, 'generation', d.registration_generation, 'recovered', true);
  perform netra_private.push_store_operation(uid, p_operation_id, p_new_client_instance_id, 'recover', fp, result);
  return result;
end;
$$;

-- Restricted re-key maintenance. Raw FIDs are returned only to the trusted
-- Edge worker, never to browser roles or logs.
create or replace function public.push_edge_rekey_batch(p_from_version text, p_to_version text, p_limit integer default 100)
returns table(user_id uuid, client_instance_id uuid, fid text, registration_generation bigint)
language plpgsql security definer
set search_path = pg_catalog, netra_private, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode = '42501'; end if;
  if p_from_version is null or p_to_version is null or p_from_version = p_to_version or p_limit not between 1 and 500 then raise exception using errcode = '22023'; end if;
  return query select d.user_id, d.client_instance_id, d.fid, d.registration_generation from netra_private.push_devices d
   where d.fid is not null
     and exists (select 1 from netra_private.push_device_fingerprints f where f.user_id = d.user_id and f.client_instance_id = d.client_instance_id and f.key_version = p_from_version)
     and not exists (select 1 from netra_private.push_device_fingerprints f where f.user_id = d.user_id and f.client_instance_id = d.client_instance_id and f.key_version = p_to_version)
   order by d.user_id, d.client_instance_id limit p_limit;
end;
$$;

create or replace function public.push_edge_rekey_device(
  p_user_id uuid, p_client_instance_id uuid, p_expected_fid text,
  p_expected_generation bigint, p_from_version text, p_to_version text,
  p_expected_source_fingerprint text, p_new_fingerprint text
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, netra_private, auth
as $$
declare account_id uuid; candidate_fid text; d netra_private.push_devices%rowtype; versions text[]; stored_source text;
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode = '42501'; end if;
  if p_user_id is null or p_client_instance_id is null or p_expected_fid is null
    or p_expected_generation is null or p_expected_generation < 1
    or not netra_private.is_valid_fid(p_expected_fid)
    or p_from_version is null or p_to_version is null or p_from_version = p_to_version
    or p_expected_source_fingerprint !~ '^[0-9a-f]{64}$' or p_new_fingerprint !~ '^[0-9a-f]{64}$' then raise exception using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('netra-push-user:' || p_user_id::text, 0));
  select id into account_id from auth.users where id = p_user_id for key share;
  if account_id is null then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('netra-push-keyring', 0));
  select accepted_versions into versions from netra_private.push_fingerprint_keyring where singleton;
  if not found or p_from_version <> all(versions) or p_to_version <> all(versions) then return jsonb_build_object('ok', false, 'code', 'KEY_VERSION_NOT_ACCEPTED'); end if;
  select fid into candidate_fid from netra_private.push_devices where user_id = p_user_id and client_instance_id = p_client_instance_id;
  if candidate_fid is null then return jsonb_build_object('ok', true, 'changed', false); end if;
  perform pg_advisory_xact_lock(hashtextextended('netra-push-fid:' || candidate_fid, 0));
  select * into d from netra_private.push_devices where user_id = p_user_id and client_instance_id = p_client_instance_id for update;
  if d.fid is distinct from p_expected_fid or d.registration_generation <> p_expected_generation or d.status = 'revoked' then return jsonb_build_object('ok', false, 'code', 'RETRY_STATE_CHANGED'); end if;
  select fingerprint into stored_source from netra_private.push_device_fingerprints
   where user_id = p_user_id and client_instance_id = p_client_instance_id and key_version = p_from_version;
  if not found then return jsonb_build_object('ok', false, 'code', 'SOURCE_FINGERPRINT_MISSING'); end if;
  if stored_source is distinct from p_expected_source_fingerprint then return jsonb_build_object('ok', false, 'code', 'SOURCE_FINGERPRINT_MISMATCH'); end if;
  insert into netra_private.push_device_fingerprints(user_id, client_instance_id, key_version, fingerprint)
  values(p_user_id, p_client_instance_id, p_to_version, p_new_fingerprint)
  on conflict (user_id, client_instance_id, key_version) do update set fingerprint = excluded.fingerprint;
  return jsonb_build_object('ok', true, 'changed', true);
end;
$$;

create or replace function public.push_edge_finalize_fid_rotation(p_current_version text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, netra_private, auth
as $$
declare kr netra_private.push_fingerprint_keyring%rowtype; incomplete bigint;
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode = '42501'; end if;
  if p_current_version is null or p_current_version !~ '^[a-zA-Z0-9_-]{1,32}$' then raise exception using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('netra-push-keyring', 0));
  select * into kr from netra_private.push_fingerprint_keyring where singleton for update;
  if not found or not (p_current_version = any(kr.accepted_versions)) then return jsonb_build_object('ok', false, 'code', 'KEY_VERSION_NOT_ACCEPTED'); end if;
  select count(*) into incomplete from netra_private.push_devices d
   where d.fid is not null and not exists (
     select 1 from netra_private.push_device_fingerprints f where f.user_id = d.user_id
       and f.client_instance_id = d.client_instance_id and f.key_version = p_current_version);
  if incomplete <> 0 then return jsonb_build_object('ok', false, 'code', 'REKEY_INCOMPLETE', 'remaining', incomplete); end if;
  delete from netra_private.push_device_fingerprints where key_version <> p_current_version;
  update netra_private.push_fingerprint_keyring set current_version = p_current_version,
    accepted_versions = array[p_current_version], updated_at = now() where singleton;
  return jsonb_build_object('ok', true, 'current_version', p_current_version);
end;
$$;

-- Replace pause and revoke with generation-bound, idempotent implementations.
create or replace function public.push_pause_device(p_client_instance_id uuid, p_expected_generation bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, netra_private, auth, extensions
as $$
declare uid uuid := auth.uid(); account_id uuid; candidate_fid text; d netra_private.push_devices%rowtype;
  old_op netra_private.push_device_operations%rowtype; fp text; result jsonb;
begin
  if uid is null or p_client_instance_id is null or p_expected_generation is null or p_expected_generation < 0 or p_operation_id is null then raise exception using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('netra-push-user:' || uid::text, 0));
  select id into account_id from auth.users where id = uid for key share;
  if account_id is null then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('netra-push-keyring', 0));
  fp := encode(extensions.digest('pause|' || p_client_instance_id::text || '|' || p_expected_generation::text, 'sha256'), 'hex');
  select * into old_op from netra_private.push_device_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if old_op.operation_type <> 'pause' or old_op.client_instance_id <> p_client_instance_id or old_op.request_fingerprint <> fp then return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT'); end if;
    return old_op.result;
  end if;
  select fid into candidate_fid from netra_private.push_devices where user_id = uid and client_instance_id = p_client_instance_id;
  if candidate_fid is not null then perform pg_advisory_xact_lock(hashtextextended('netra-push-fid:' || candidate_fid, 0)); end if;
  select * into d from netra_private.push_devices where user_id = uid and client_instance_id = p_client_instance_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'DEVICE_NOT_FOUND'); end if;
  if d.fid is distinct from candidate_fid then return jsonb_build_object('ok', false, 'code', 'RETRY_STATE_CHANGED'); end if;
  if d.registration_generation <> p_expected_generation then
    result := jsonb_build_object('ok', false, 'code', 'STALE_GENERATION');
  elsif d.status = 'revoked' then result := jsonb_build_object('ok', false, 'code', 'CONSENT_REVOKED');
  elsif d.status = 'paused' then
    result := jsonb_build_object('ok', true, 'state', 'paused', 'generation', d.registration_generation, 'already_paused', true);
  else
    update netra_private.push_devices set status = 'paused', registration_generation = registration_generation + 1, updated_at = now()
      where user_id = uid and client_instance_id = p_client_instance_id returning * into d;
    result := jsonb_build_object('ok', true, 'state', 'paused', 'generation', d.registration_generation);
  end if;
  perform netra_private.push_store_operation(uid, p_operation_id, p_client_instance_id, 'pause', fp, result);
  return result;
end;
$$;

create or replace function public.push_revoke_device(p_client_instance_id uuid, p_expected_generation bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, netra_private, auth, extensions
as $$
declare uid uuid := auth.uid(); account_id uuid; candidate_fid text; d netra_private.push_devices%rowtype;
  old_op netra_private.push_device_operations%rowtype; fp text; result jsonb;
begin
  if uid is null or p_client_instance_id is null or p_expected_generation is null or p_expected_generation < 0 or p_operation_id is null then raise exception using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('netra-push-user:' || uid::text, 0));
  select id into account_id from auth.users where id = uid for key share;
  if account_id is null then return jsonb_build_object('ok', false, 'code', 'AUTH_REQUIRED'); end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('netra-push-keyring', 0));
  fp := encode(extensions.digest('revoke|' || p_client_instance_id::text || '|' || p_expected_generation::text, 'sha256'), 'hex');
  select * into old_op from netra_private.push_device_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if old_op.operation_type <> 'revoke' or old_op.client_instance_id <> p_client_instance_id or old_op.request_fingerprint <> fp then return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT'); end if;
    return old_op.result;
  end if;
  select fid into candidate_fid from netra_private.push_devices where user_id = uid and client_instance_id = p_client_instance_id;
  if candidate_fid is not null then perform pg_advisory_xact_lock(hashtextextended('netra-push-fid:' || candidate_fid, 0)); end if;
  select * into d from netra_private.push_devices where user_id = uid and client_instance_id = p_client_instance_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'DEVICE_NOT_FOUND'); end if;
  if d.registration_generation <> p_expected_generation then result := jsonb_build_object('ok', false, 'code', 'STALE_GENERATION');
  elsif d.status = 'revoked' then result := jsonb_build_object('ok', true, 'state', 'revoked', 'generation', d.registration_generation, 'already_revoked', true);
  else
    update netra_private.push_devices set registration_generation = registration_generation + 1, status = 'revoked',
      app_consent = false, consent_version = coalesce(consent_version, 'revoked'), revoked_at = now(), fid = null, updated_at = now()
    where user_id = uid and client_instance_id = p_client_instance_id returning * into d;
    delete from netra_private.push_device_fingerprints where user_id = uid and client_instance_id = p_client_instance_id;
    insert into netra_private.push_device_consents(user_id, client_instance_id, generation, action, consent_version)
      values(uid, p_client_instance_id, d.registration_generation, 'revoke', d.consent_version);
    result := jsonb_build_object('ok', true, 'state', 'revoked', 'generation', d.registration_generation);
  end if;
  perform netra_private.push_store_operation(uid, p_operation_id, p_client_instance_id, 'revoke', fp, result);
  return result;
end;
$$;

-- Edge-only SECURITY DEFINER mutation RPCs. All identify the caller from the
-- signed service_role JWT; p_user_id is supplied only by independently verified Edge code.
alter function public.push_edge_opt_in(uuid, uuid, text, uuid, text) owner to postgres;
alter function public.push_edge_register(uuid, uuid, bigint, text, jsonb, uuid, text) owner to postgres;
alter function public.push_edge_resume(uuid, uuid, bigint, uuid, text) owner to postgres;
alter function public.push_edge_recovery_candidate(uuid, text, jsonb, text) owner to postgres;
alter function public.push_edge_recover(uuid, uuid, uuid, bigint, text, jsonb, uuid, text) owner to postgres;
alter function public.push_edge_rekey_batch(text, text, integer) owner to postgres;
alter function public.push_edge_rekey_device(uuid, uuid, text, bigint, text, text, text, text) owner to postgres;
alter function public.push_edge_finalize_fid_rotation(text) owner to postgres;
revoke all on function public.push_edge_opt_in(uuid, uuid, text, uuid, text),
 public.push_edge_register(uuid, uuid, bigint, text, jsonb, uuid, text),
 public.push_edge_resume(uuid, uuid, bigint, uuid, text),
 public.push_edge_recovery_candidate(uuid, text, jsonb, text),
 public.push_edge_recover(uuid, uuid, uuid, bigint, text, jsonb, uuid, text),
 public.push_edge_rekey_batch(text, text, integer),
 public.push_edge_rekey_device(uuid, uuid, text, bigint, text, text, text, text),
 public.push_edge_finalize_fid_rotation(text)
 from public, anon, authenticated, service_role;
grant execute on function public.push_edge_opt_in(uuid, uuid, text, uuid, text),
 public.push_edge_register(uuid, uuid, bigint, text, jsonb, uuid, text),
 public.push_edge_resume(uuid, uuid, bigint, uuid, text),
 public.push_edge_recovery_candidate(uuid, text, jsonb, text),
 public.push_edge_recover(uuid, uuid, uuid, bigint, text, jsonb, uuid, text),
 public.push_edge_rekey_batch(text, text, integer),
 public.push_edge_rekey_device(uuid, uuid, text, bigint, text, text, text, text),
 public.push_edge_finalize_fid_rotation(text)
 to service_role;

-- User functions use auth.uid(); rate events and all identifying rows cascade.
alter function public.push_pause_device(uuid, bigint, uuid) owner to postgres;
alter function public.push_revoke_device(uuid, bigint, uuid) owner to postgres;
revoke all on function public.push_pause_device(uuid, bigint, uuid), public.push_revoke_device(uuid, bigint, uuid)
 from public, anon, service_role;
grant execute on function public.push_pause_device(uuid, bigint, uuid), public.push_revoke_device(uuid, bigint, uuid)
 to authenticated;

alter default privileges for role postgres in schema netra_private
 revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema netra_private
 revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema netra_private
 revoke execute on functions from public, anon, authenticated, service_role;
