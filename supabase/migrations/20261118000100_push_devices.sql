-- NetraOS Stage 3A: private FID registration, consent and device lifecycle.
-- Apply only after review. This migration does not send push messages.

create schema if not exists netra_private;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
revoke all on schema netra_private from public, anon, authenticated, service_role;

create table if not exists netra_private.push_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_instance_id uuid not null,
  registration_generation bigint not null default 0 check (registration_generation >= 0),
  status text not null check (status in ('pending','active','paused','revoked')),
  app_consent boolean not null default false,
  consent_version text,
  consented_at timestamptz,
  revoked_at timestamptz,
  fid text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  last_registered_at timestamptz,
  primary key (user_id, client_instance_id),
  constraint push_device_consent_fields check (
    (app_consent and consent_version is not null and length(btrim(consent_version)) between 1 and 64 and consented_at is not null and revoked_at is null)
    or (not app_consent and revoked_at is not null)
  ),
  constraint push_device_fid_state check (
    (status = 'active' and fid is not null)
    or status = 'paused'
    or (status in ('pending','revoked') and fid is null)
  ),
  constraint push_device_consent_state check (
    (status in ('pending','active','paused') and app_consent)
    or (status = 'revoked' and not app_consent)
  ),
  constraint push_device_fid_length check (fid is null or (length(fid) between 1 and 128 and fid = btrim(fid) and fid !~ '[[:cntrl:]]'))
);

create unique index if not exists push_devices_fid_unique
  on netra_private.push_devices (fid) where fid is not null;
create index if not exists push_devices_user_slot_idx
  on netra_private.push_devices (user_id, status);
create index if not exists push_devices_user_activity_idx
  on netra_private.push_devices (user_id, last_seen_at desc);

create table if not exists netra_private.push_device_consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  client_instance_id uuid not null,
  generation bigint not null check (generation > 0),
  action text not null check (action in ('opt_in','revoke')),
  consent_version text not null check (length(btrim(consent_version)) between 1 and 64),
  occurred_at timestamptz not null default now(),
  foreign key (user_id, client_instance_id)
    references netra_private.push_devices(user_id, client_instance_id) on delete cascade,
  unique (user_id, client_instance_id, generation, action)
);
create index if not exists push_device_consents_user_time_idx
  on netra_private.push_device_consents (user_id, occurred_at desc);

-- Idempotency records are deliberately retained: deleting an old operation
-- could turn a delayed retry into a new state transition.
create table if not exists netra_private.push_device_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  client_instance_id uuid not null,
  operation_type text not null check (operation_type in ('pause','resume','revoke')),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);
create index if not exists push_device_operations_instance_idx
  on netra_private.push_device_operations (user_id, client_instance_id, created_at desc);

create table if not exists netra_private.push_firebase_config (
  singleton boolean primary key default true check (singleton),
  firebase_app_id text,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  check (firebase_app_id is null or (length(btrim(firebase_app_id)) between 1 and 128 and firebase_app_id = btrim(firebase_app_id))),
  check (not enabled or firebase_app_id is not null)
);
insert into netra_private.push_firebase_config(singleton, firebase_app_id, enabled)
values (true, null, false) on conflict (singleton) do nothing;

create table if not exists netra_private.push_firebase_config_audit (
  id bigint generated always as identity primary key,
  changed_by text not null,
  old_app_id text,
  new_app_id text,
  old_enabled boolean,
  new_enabled boolean,
  changed_at timestamptz not null default now()
);

alter table netra_private.push_devices enable row level security;
alter table netra_private.push_device_consents enable row level security;
alter table netra_private.push_device_operations enable row level security;
alter table netra_private.push_firebase_config enable row level security;
alter table netra_private.push_firebase_config_audit enable row level security;
revoke all on all tables in schema netra_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema netra_private from public, anon, authenticated, service_role;

create or replace function netra_private.provision_push_firebase_app(p_app_id text, p_enabled boolean)
returns void
language plpgsql
set search_path = pg_catalog, netra_private
as $$
declare old_config netra_private.push_firebase_config%rowtype;
begin
  if current_user <> 'postgres' then raise exception using errcode = '42501'; end if;
  if p_enabled is null or (p_enabled and (p_app_id is null or length(btrim(p_app_id)) not between 1 and 128)) then
    raise exception using errcode = '22023';
  end if;
  if p_app_id is not null and (p_app_id <> btrim(p_app_id) or length(p_app_id) > 128) then
    raise exception using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('netra-push-config', 0));
  select * into old_config from netra_private.push_firebase_config where singleton = true for update;
  if old_config.enabled and old_config.firebase_app_id is distinct from p_app_id then
    raise exception using errcode = '55000';
  end if;
  if p_enabled and old_config.firebase_app_id is distinct from p_app_id then
    raise exception using errcode = '55000';
  end if;
  update netra_private.push_firebase_config
     set firebase_app_id = p_app_id, enabled = p_enabled, updated_at = now()
   where singleton = true;
  insert into netra_private.push_firebase_config_audit(changed_by, old_app_id, new_app_id, old_enabled, new_enabled)
  values (session_user, old_config.firebase_app_id, p_app_id, old_config.enabled, p_enabled);
end;
$$;
alter function netra_private.provision_push_firebase_app(text, boolean) owner to postgres;
revoke all on function netra_private.provision_push_firebase_app(text, boolean) from public, anon, authenticated, service_role;

create or replace function public.read_push_firebase_app_config()
returns table(firebase_app_id text, enabled boolean)
language plpgsql
security definer
set search_path = pg_catalog, netra_private, auth
as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode = '42501'; end if;
  return query select c.firebase_app_id, c.enabled
    from netra_private.push_firebase_config c where c.singleton = true;
end;
$$;
alter function public.read_push_firebase_app_config() owner to postgres;
revoke all on function public.read_push_firebase_app_config() from public, anon, authenticated, service_role;
grant execute on function public.read_push_firebase_app_config() to service_role;

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
    'generation', d.registration_generation, 'consent_version', d.consent_version);
end;
$$;

create or replace function public.push_begin_opt_in(p_client_instance_id uuid, p_consent_version text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, netra_private, auth
as $$
declare uid uuid := auth.uid(); candidate_fid text; d netra_private.push_devices%rowtype; cfg netra_private.push_firebase_config%rowtype; slots integer; next_generation bigint; device_exists boolean;
begin
  if uid is null then raise exception using errcode = '28000'; end if;
  if p_client_instance_id is null or p_consent_version is null or length(btrim(p_consent_version)) not between 1 and 64 or p_consent_version <> btrim(p_consent_version) then
    raise exception using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('netra-push-user:' || uid::text, 0));
  select fid into candidate_fid from netra_private.push_devices
    where user_id = uid and client_instance_id = p_client_instance_id;
  if candidate_fid is not null then perform pg_advisory_xact_lock(hashtextextended('netra-push-fid:' || candidate_fid, 0)); end if;
  select * into d from netra_private.push_devices
    where user_id = uid and client_instance_id = p_client_instance_id for update;
  device_exists := found;
  if device_exists and d.fid is distinct from candidate_fid then return jsonb_build_object('ok', false, 'code', 'RETRY_STATE_CHANGED'); end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('netra-push-config', 0));
  select * into cfg from netra_private.push_firebase_config where singleton = true;
  if not found or not cfg.enabled or cfg.firebase_app_id is null then return jsonb_build_object('ok', false, 'code', 'PUSH_NOT_CONFIGURED'); end if;
  if device_exists and d.app_consent then
    return jsonb_build_object('ok', true, 'state', d.status, 'generation', d.registration_generation, 'consent_recorded', false);
  end if;
  select count(*) into slots from netra_private.push_devices
    where user_id = uid and status in ('pending','active','paused');
  if slots >= 3 and (not device_exists or d.status = 'revoked') then
    return jsonb_build_object('ok', false, 'code', 'DEVICE_LIMIT');
  end if;
  if device_exists then
    next_generation := d.registration_generation + 1;
    update netra_private.push_devices set registration_generation = next_generation, status = 'pending',
      app_consent = true, consent_version = p_consent_version, consented_at = now(), revoked_at = null,
      fid = null, updated_at = now()
      where user_id = uid and client_instance_id = p_client_instance_id;
  else
    next_generation := 1;
    insert into netra_private.push_devices(user_id, client_instance_id, registration_generation, status,
      app_consent, consent_version, consented_at)
      values(uid, p_client_instance_id, next_generation, 'pending', true, p_consent_version, now());
  end if;
  insert into netra_private.push_device_consents(user_id, client_instance_id, generation, action, consent_version)
    values(uid, p_client_instance_id, next_generation, 'opt_in', p_consent_version);
  return jsonb_build_object('ok', true, 'state', 'pending', 'generation', next_generation, 'consent_recorded', true);
end;
$$;

create or replace function public.push_register_device(p_client_instance_id uuid, p_generation bigint, p_fid text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, netra_private, auth
as $$
declare uid uuid := auth.uid(); candidate_fid text; d netra_private.push_devices%rowtype; other_owner uuid; cfg netra_private.push_firebase_config%rowtype; slots integer;
begin
  if uid is null then raise exception using errcode = '28000'; end if;
  if p_client_instance_id is null or p_generation is null or p_generation < 1 or p_fid is null or length(p_fid) not between 1 and 128 or p_fid <> btrim(p_fid) then
    raise exception using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('netra-push-user:' || uid::text, 0));
  select fid into candidate_fid from netra_private.push_devices
    where user_id = uid and client_instance_id = p_client_instance_id;
  -- Domain-separated advisory keys; sort FID strings before acquiring both locks.
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
  select * into d from netra_private.push_devices
    where user_id = uid and client_instance_id = p_client_instance_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'CONSENT_REQUIRED'); end if;
  if d.fid is distinct from candidate_fid then return jsonb_build_object('ok', false, 'code', 'RETRY_STATE_CHANGED'); end if;
  if not d.app_consent or d.registration_generation <> p_generation or d.status not in ('pending','active','paused') then
    return jsonb_build_object('ok', false, 'code', 'STALE_GENERATION');
  end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('netra-push-config', 0));
  select * into cfg from netra_private.push_firebase_config where singleton = true;
  if not found or not cfg.enabled or cfg.firebase_app_id is null then return jsonb_build_object('ok', false, 'code', 'PUSH_NOT_CONFIGURED'); end if;
  select user_id into other_owner from netra_private.push_devices
    where fid = p_fid and not (user_id = uid and client_instance_id = p_client_instance_id) limit 1;
  if found then return jsonb_build_object('ok', false, 'code', 'FID_ALREADY_CLAIMED'); end if;
  select count(*) into slots from netra_private.push_devices
    where user_id = uid and status in ('pending','active','paused');
  if slots > 3 then return jsonb_build_object('ok', false, 'code', 'DEVICE_LIMIT'); end if;
  update netra_private.push_devices set fid = p_fid, status = 'active', updated_at = now(),
    last_seen_at = now(), last_registered_at = now()
    where user_id = uid and client_instance_id = p_client_instance_id;
  return jsonb_build_object('ok', true, 'state', 'active', 'generation', d.registration_generation);
end;
$$;

create or replace function public.push_pause_device(p_client_instance_id uuid, p_expected_generation bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, netra_private, auth, extensions
as $$
declare uid uuid := auth.uid(); candidate_fid text; d netra_private.push_devices%rowtype; old_op netra_private.push_device_operations%rowtype; fp text; result jsonb;
begin
  if uid is null then raise exception using errcode = '28000'; end if;
  if p_client_instance_id is null or p_expected_generation is null or p_expected_generation < 0 or p_operation_id is null then raise exception using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('netra-push-user:' || uid::text, 0));
  -- The operation ID identifies the pause intent. Excluding expected_generation
  -- lets a retry after a lost successful response replay the stored result even
  -- though the device generation advanced during that first success.
  fp := encode(extensions.digest('pause|' || p_client_instance_id::text, 'sha256'), 'hex');
  select * into old_op from netra_private.push_device_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if old_op.operation_type <> 'pause' or old_op.client_instance_id <> p_client_instance_id or old_op.request_fingerprint <> fp then
      return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
    end if;
    return old_op.result;
  end if;
  select fid into candidate_fid from netra_private.push_devices where user_id = uid and client_instance_id = p_client_instance_id;
  if candidate_fid is not null then perform pg_advisory_xact_lock(hashtextextended('netra-push-fid:' || candidate_fid, 0)); end if;
  select * into d from netra_private.push_devices where user_id = uid and client_instance_id = p_client_instance_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'DEVICE_NOT_FOUND'); end if;
  if d.fid is distinct from candidate_fid then return jsonb_build_object('ok', false, 'code', 'RETRY_STATE_CHANGED'); end if;
  if d.registration_generation <> p_expected_generation then return jsonb_build_object('ok', false, 'code', 'STALE_GENERATION'); end if;
  if d.status = 'revoked' then return jsonb_build_object('ok', false, 'code', 'CONSENT_REVOKED'); end if;
  -- A new pause intent always advances the generation, including when the row
  -- was already paused by a resume attempt. Only a matching operation retry
  -- returns above without mutation.
  update netra_private.push_devices set status = 'paused', registration_generation = registration_generation + 1, updated_at = now()
    where user_id = uid and client_instance_id = p_client_instance_id returning * into d;
  result := jsonb_build_object('ok', true, 'state', 'paused', 'generation', d.registration_generation);
  insert into netra_private.push_device_operations values(uid, p_operation_id, p_client_instance_id, 'pause', fp, result, now());
  return result;
end;
$$;

create or replace function public.push_resume_device(p_client_instance_id uuid, p_operation_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, netra_private, auth, extensions
as $$
declare uid uuid := auth.uid(); candidate_fid text; d netra_private.push_devices%rowtype; cfg netra_private.push_firebase_config%rowtype; old_op netra_private.push_device_operations%rowtype; fp text; result jsonb; slots integer;
begin
  if uid is null then raise exception using errcode = '28000'; end if;
  if p_client_instance_id is null or p_operation_id is null then raise exception using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('netra-push-user:' || uid::text, 0));
  fp := encode(extensions.digest('resume|' || p_client_instance_id::text, 'sha256'), 'hex');
  select * into old_op from netra_private.push_device_operations where user_id = uid and operation_id = p_operation_id;
  if found then
    if old_op.operation_type <> 'resume' or old_op.client_instance_id <> p_client_instance_id or old_op.request_fingerprint <> fp then return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT'); end if;
    return old_op.result;
  end if;
  select fid into candidate_fid from netra_private.push_devices where user_id = uid and client_instance_id = p_client_instance_id;
  if candidate_fid is not null then perform pg_advisory_xact_lock(hashtextextended('netra-push-fid:' || candidate_fid, 0)); end if;
  select * into d from netra_private.push_devices where user_id = uid and client_instance_id = p_client_instance_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'DEVICE_NOT_FOUND'); end if;
  if d.fid is distinct from candidate_fid then return jsonb_build_object('ok', false, 'code', 'RETRY_STATE_CHANGED'); end if;
  if not d.app_consent or d.status = 'revoked' then return jsonb_build_object('ok', false, 'code', 'CONSENT_REVOKED'); end if;
  perform pg_advisory_xact_lock_shared(hashtextextended('netra-push-config', 0));
  select * into cfg from netra_private.push_firebase_config where singleton = true;
  if not found or not cfg.enabled or cfg.firebase_app_id is null then return jsonb_build_object('ok', false, 'code', 'PUSH_NOT_CONFIGURED'); end if;
  if d.status = 'active' then result := jsonb_build_object('ok', true, 'state', 'active', 'generation', d.registration_generation);
  elsif d.status = 'pending' then result := jsonb_build_object('ok', true, 'state', 'pending', 'generation', d.registration_generation);
  else
    -- The existing paused row already occupies a slot; exclude it from the
    -- capacity count so a full account can resume its own reserved device.
    select count(*) into slots from netra_private.push_devices
      where user_id = uid and status in ('pending','active','paused') and client_instance_id <> p_client_instance_id;
    if slots >= 3 then
      result := jsonb_build_object('ok', false, 'code', 'DEVICE_LIMIT');
    else
      update netra_private.push_devices set registration_generation = registration_generation + 1, updated_at = now()
        where user_id = uid and client_instance_id = p_client_instance_id returning * into d;
      result := jsonb_build_object('ok', true, 'state', 'paused', 'registration_required', true, 'generation', d.registration_generation);
    end if;
  end if;
  insert into netra_private.push_device_operations values(uid, p_operation_id, p_client_instance_id, 'resume', fp, result, now());
  return result;
end;
$$;

create or replace function public.push_revoke_device(p_client_instance_id uuid, p_expected_generation bigint, p_operation_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, netra_private, auth, extensions
as $$
declare uid uuid := auth.uid(); candidate_fid text; d netra_private.push_devices%rowtype; old_op netra_private.push_device_operations%rowtype; fp text; result jsonb;
begin
  if uid is null then raise exception using errcode = '28000'; end if;
  if p_client_instance_id is null or p_expected_generation is null or p_expected_generation < 0 or p_operation_id is null then raise exception using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('netra-push-user:' || uid::text, 0));
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
  if d.fid is distinct from candidate_fid then return jsonb_build_object('ok', false, 'code', 'RETRY_STATE_CHANGED'); end if;
  if d.registration_generation <> p_expected_generation then return jsonb_build_object('ok', false, 'code', 'STALE_GENERATION'); end if;
  update netra_private.push_devices set registration_generation = registration_generation + 1,
    status = 'revoked', app_consent = false, consent_version = coalesce(consent_version, 'revoked'),
    revoked_at = now(), fid = null, updated_at = now()
    where user_id = uid and client_instance_id = p_client_instance_id returning * into d;
  insert into netra_private.push_device_consents(user_id, client_instance_id, generation, action, consent_version)
    values(uid, p_client_instance_id, d.registration_generation, 'revoke', d.consent_version);
  result := jsonb_build_object('ok', true, 'state', 'revoked', 'generation', d.registration_generation);
  insert into netra_private.push_device_operations values(uid, p_operation_id, p_client_instance_id, 'revoke', fp, result, now());
  return result;
end;
$$;

-- Explicit function ownership and least-privilege client access.
alter function public.push_get_device_state(uuid) owner to postgres;
alter function public.push_begin_opt_in(uuid, text) owner to postgres;
alter function public.push_register_device(uuid, bigint, text) owner to postgres;
alter function public.push_pause_device(uuid, bigint, uuid) owner to postgres;
alter function public.push_resume_device(uuid, uuid) owner to postgres;
alter function public.push_revoke_device(uuid, bigint, uuid) owner to postgres;
revoke all on function public.push_get_device_state(uuid), public.push_begin_opt_in(uuid, text),
  public.push_register_device(uuid, bigint, text), public.push_pause_device(uuid, bigint, uuid),
  public.push_resume_device(uuid, uuid), public.push_revoke_device(uuid, bigint, uuid)
  from public, anon, service_role;
grant execute on function public.push_get_device_state(uuid), public.push_begin_opt_in(uuid, text),
  public.push_register_device(uuid, bigint, text), public.push_pause_device(uuid, bigint, uuid),
  public.push_resume_device(uuid, uuid), public.push_revoke_device(uuid, bigint, uuid)
  to authenticated;

alter default privileges for role postgres in schema netra_private
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema netra_private
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema netra_private
  revoke execute on functions from public, anon, authenticated, service_role;
