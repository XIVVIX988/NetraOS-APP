import { createHash, randomUUID } from "node:crypto";

const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const digest = value => createHash("sha256").update(value).digest("hex");

export async function makeConcurrencyFixture(scenario) {
  const tag = randomUUID().replaceAll("-", "");
  const schema = `push_race_${tag}`;
  const userA = randomUUID();
  const userB = randomUUID();
  const id = () => randomUUID();
  const fid = suffix => `fid_${tag}_${suffix}`;
  const fingerprint = suffix => digest(`${tag}:${suffix}`);
  const userSeed = [userA, userB].map((user, i) => `('${user}','authenticated','authenticated','push-${tag}-${i}@example.invalid','','{}'::jsonb,'{}'::jsonb)`).join(",\n");
  const tx = (body, role = "service_role", user = userA) => `begin;\nselect set_config('request.jwt.claim.role',${quote(role)},true);\nselect set_config('request.jwt.claim.sub',${quote(user)},true);\n${body}\ncommit;`;
  const optIn = (user, device, op) => tx(`select public.push_edge_opt_in('${user}','${device}','push-consent-v1','${op}','netra-test-app');`, "service_role", user);
  const register = (user, device, gen, installation, fp, op, app = "netra-test-app") => tx(`select public.push_edge_register('${user}','${device}',${gen},${quote(installation)},'[ {"version":"v1","fingerprint":"${fp}"} ]'::jsonb,'${op}',${quote(app)});`, "service_role", user);
  const registerWithTwoVersions = (user, device, gen, installation, fp1, fp2, op) => tx(`select public.push_edge_register('${user}','${device}',${gen},${quote(installation)},'[ {"version":"v1","fingerprint":"${fp1}"},{"version":"v2","fingerprint":"${fp2}"} ]'::jsonb,'${op}','netra-test-app');`, "service_role", user);
  const pause = (user, device, gen, op) => tx(`select public.push_pause_device('${device}',${gen},'${op}');`, "authenticated", user);
  const revoke = (user, device, gen, op) => tx(`select public.push_revoke_device('${device}',${gen},'${op}');`, "authenticated", user);
  const seedPending = async (user, device) => optIn(user, device, id());
  const seedActive = async (user, device, installation, fp) => `${await optIn(user, device, id())}\n${register(user, device, 1, installation, fp, id())}`;
  const gateWait = `update ${schema}.gate set arrivals=arrivals+1 where singleton;\ndo $$ declare n integer; deadline timestamptz := clock_timestamp()+interval '15 seconds'; begin loop select arrivals into n from ${schema}.gate; exit when n=2; if clock_timestamp()>deadline then raise exception 'barrier timeout'; end if; perform pg_sleep(0.01); end loop; end $$;`;

  const dev = Array.from({ length: 4 }, () => id());
  const fidA = fid("a"), fidB = fid("b"), fpA = fingerprint("a"), fpB = fingerprint("b");
  let setup = `create schema ${schema};\ncreate table ${schema}.gate(singleton boolean primary key default true, arrivals integer not null default 0);\ninsert into ${schema}.gate default values;\ncreate table ${schema}.config_snapshot as select firebase_app_id, enabled from netra_private.push_firebase_config where singleton;\ncreate table ${schema}.keyring_snapshot as select current_version, accepted_versions from netra_private.push_fingerprint_keyring where singleton;\ninsert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data) values ${userSeed};\ndo $$ declare old_id text; begin select firebase_app_id into old_id from netra_private.push_firebase_config where singleton; perform netra_private.provision_push_firebase_app(old_id,false); perform netra_private.provision_push_firebase_app('netra-test-app',true); end $$;\nselect netra_private.provision_push_fingerprint_keyring('v1',array['v1']);`;
  let sessionA = "", sessionB = "", assertion = "";
  const finalSql = query => `${query.trim().replace(/;?$/, ";")}\n`;
  const assertBoolean = expression => `select case when (${expression}) then 'true' else 'false' end;`;

  switch (scenario) {
    case "resume versus pause": {
      const d = dev[0], base = await seedActive(userA, d, fidA, fpA);
      setup += `\n${base}\n${pause(userA,d,1,id())}`;
      sessionA = `${gateWait}\n${tx(`select public.push_edge_resume('${userA}','${d}',2,'${id()}','netra-test-app');`)}`;
      sessionB = `${gateWait}\n${pause(userA,d,2,id())}`;
      assertion = assertBoolean(`(select status='paused' and registration_generation>=2 from netra_private.push_devices where user_id='${userA}' and client_instance_id='${d}')`);
      break;
    }
    case "registration versus revoke": {
      const d = dev[0]; setup += `\n${await seedPending(userA,d)}`;
      sessionA = `${gateWait}\n${register(userA,d,1,fidA,fpA,id())}`;
      sessionB = `${gateWait}\n${revoke(userA,d,1,id())}`;
      assertion = assertBoolean(`(select status='revoked' and fid is null and not app_consent from netra_private.push_devices where user_id='${userA}' and client_instance_id='${d}')`);
      break;
    }
    case "two accounts claiming the same FID": {
      const da=dev[0], db=dev[1]; setup += `\n${await seedPending(userA,da)}\n${await seedPending(userB,db)}`;
      sessionA = `${gateWait}\n${register(userA,da,1,fidA,fpA,id())}`;
      sessionB = `${gateWait}\n${register(userB,db,1,fidA,fpA,id())}`;
      assertion = assertBoolean(`(select count(*)=1 from netra_private.push_devices where fid='${fidA}')`);
      break;
    }
    case "concurrent registration at the final available device slot": {
      const d1=dev[0],d2=dev[1],d3=dev[2],d4=dev[3];
      setup += `\n${await seedPending(userA,d1)}\n${await seedPending(userA,d2)}`;
      sessionA = `${gateWait}\n${optIn(userA,d3,id())}`;
      sessionB = `${gateWait}\n${optIn(userA,d4,id())}`;
      assertion = assertBoolean(`(select count(*)=3 from netra_private.push_devices where user_id='${userA}' and status in ('pending','active','paused'))`);
      break;
    }
    case "Firebase configuration rotation versus registration": {
      const d=dev[0]; setup += `\n${await seedPending(userA,d)}`;
      sessionA = `${gateWait}\n${register(userA,d,1,fidA,fpA,id())}`;
      sessionB = `${gateWait}\n${tx(`do $$ declare old_id text; begin select firebase_app_id into old_id from netra_private.push_firebase_config where singleton; perform netra_private.provision_push_firebase_app(old_id,false); perform netra_private.provision_push_firebase_app('netra-test-app-rotated',true); end $$;`)}`;
      assertion = assertBoolean(`(select firebase_app_id='netra-test-app-rotated' and enabled from netra_private.push_firebase_config where singleton) and (select count(*)<=1 from netra_private.push_devices where user_id='${userA}' and client_instance_id='${d}')`);
      break;
    }
    case "HMAC key rotation versus registration": {
      const d=dev[0], fpV2=fingerprint("rotation-v2"); setup += `\n${await seedPending(userA,d)}\nselect netra_private.provision_push_fingerprint_keyring('v1',array['v1','v2']);`;
      sessionA = `${gateWait}\n${registerWithTwoVersions(userA,d,1,fidA,fpA,fpV2,id())}`;
      sessionB = `${gateWait}\n${tx(`select netra_private.provision_push_fingerprint_keyring('v2',array['v1','v2']);`)}`;
      assertion = assertBoolean(`(select current_version='v2' and accepted_versions @> array['v1','v2'] from netra_private.push_fingerprint_keyring where singleton) and (select count(*)=2 from netra_private.push_device_fingerprints where user_id='${userA}' and client_instance_id='${d}' and key_version in ('v1','v2'))`);
      break;
    }
    case "account deletion versus registration": {
      const d=dev[0]; setup += `\n${await seedPending(userA,d)}`;
      sessionA = `${gateWait}\n${register(userA,d,1,fidA,fpA,id())}`;
      sessionB = `${gateWait}\nbegin; delete from auth.users where id='${userA}'; commit;`;
      assertion = assertBoolean(`not exists(select 1 from netra_private.push_devices where user_id='${userA}') and not exists(select 1 from netra_private.push_device_consents where user_id='${userA}')`);
      break;
    }
    case "recovery versus registration": {
      const d=dev[0], replacement=id(), gen=1; setup += `\n${await seedActive(userA,d,fidA,fpA)}`;
      sessionA = `${gateWait}\n${register(userA,d,gen,fidA,fpA,id())}`;
      sessionB = `${gateWait}\n${tx(`select public.push_edge_recover('${userA}','${replacement}','${d}',${gen},${quote(fidA)},'[ {"version":"v1","fingerprint":"${fpA}"} ]'::jsonb,'${id()}','netra-test-app');`)}`;
      assertion = assertBoolean(`(select count(*)=1 and count(distinct fid)=1 from netra_private.push_devices where user_id='${userA}' and fid='${fidA}') and not exists(select 1 from netra_private.push_devices where user_id='${userA}' and client_instance_id='${d}' and client_instance_id<>'${replacement}')`);
      break;
    }
    case "concurrent rate-limit requests": {
      const d1=dev[0],d2=dev[1],f1=fid("old1"),f2=fid("old2"),h1=fingerprint("old1"),h2=fingerprint("old2");
      setup += `\n${await seedActive(userA,d1,f1,h1)}\n${await seedActive(userA,d2,f2,h2)}\ninsert into netra_private.push_rate_events(user_id,operation_id,action,occurred_at) select '${userA}',md5('prefill-'||g)::uuid,'changed_fid',now() from generate_series(1,9) g;`;
      sessionA = `${gateWait}\n${register(userA,d1,1,fidA,fpA,id())}`;
      sessionB = `${gateWait}\n${register(userA,d2,1,fidB,fpB,id())}`;
      assertion = assertBoolean(`(select count(*)=10 from netra_private.push_rate_events where user_id='${userA}' and action='changed_fid' and occurred_at>now()-interval '1 hour') and (select count(*)<=1 from netra_private.push_devices where user_id='${userA}' and fid in ('${fidA}','${fidB}'))`);
      break;
    }
    case "re-key versus revocation": {
      const d=dev[0]; setup += `\n${await seedActive(userA,d,fidA,fpA)}\nselect netra_private.provision_push_fingerprint_keyring('v1',array['v1','v2']);`;
      sessionA = `${gateWait}\n${tx(`select public.push_edge_rekey_device('${userA}','${d}',${quote(fidA)},1,'v1','v2',${quote(fpA)},'${fingerprint("v2")}');`)}`;
      sessionB = `${gateWait}\n${revoke(userA,d,1,id())}`;
      assertion = assertBoolean(`(select status='revoked' and fid is null from netra_private.push_devices where user_id='${userA}' and client_instance_id='${d}') and not exists(select 1 from netra_private.push_device_fingerprints where user_id='${userA}' and client_instance_id='${d}')`);
      break;
    }
    case "recovery versus revoke": {
      const d=dev[0], replacement=id(); setup += `\n${await seedActive(userA,d,fidA,fpA)}`;
      sessionA = `${gateWait}\n${tx(`select public.push_edge_recover('${userA}','${replacement}','${d}',1,${quote(fidA)},'[ {"version":"v1","fingerprint":"${fpA}"} ]'::jsonb,'${id()}','netra-test-app');`)}`;
      sessionB = `${gateWait}\n${revoke(userA,d,1,id())}`;
      assertion = assertBoolean(`(select count(*)<=1 from netra_private.push_devices where user_id='${userA}' and fid='${fidA}') and not exists(select 1 from netra_private.push_devices where user_id='${userA}' and status='revoked' and fid is not null)`);
      break;
    }
    case "simultaneous recovery attempts": {
      const d=dev[0], newA=id(), newB=id(); setup += `\n${await seedActive(userA,d,fidA,fpA)}`;
      const recover = newId => tx(`select public.push_edge_recover('${userA}','${newId}','${d}',1,${quote(fidA)},'[ {"version":"v1","fingerprint":"${fpA}"} ]'::jsonb,'${id()}','netra-test-app');`);
      sessionA = `${gateWait}\n${recover(newA)}`;
      sessionB = `${gateWait}\n${recover(newB)}`;
      assertion = assertBoolean(`(select count(*)=1 and count(distinct fid)=1 from netra_private.push_devices where user_id='${userA}' and fid='${fidA}') and not (select count(*)>1 from netra_private.push_devices where user_id='${userA}' and status in ('pending','active','paused'))`);
      break;
    }
    default: throw new Error(`No executable SQL fixture for: ${scenario}`);
  }

  const cleanup = `do $$ declare app_id text; was_enabled boolean; live_app_id text; curr text; accepted text[]; begin
    delete from auth.users where id in ('${userA}','${userB}');
    if to_regclass('${schema}.config_snapshot') is not null then
      select firebase_app_id, enabled into app_id, was_enabled from ${schema}.config_snapshot;
      select firebase_app_id into live_app_id from netra_private.push_firebase_config where singleton;
      perform netra_private.provision_push_firebase_app(live_app_id,false);
      perform netra_private.provision_push_firebase_app(app_id,was_enabled);
    end if;
    if to_regclass('${schema}.keyring_snapshot') is not null then
      select current_version, accepted_versions into curr, accepted from ${schema}.keyring_snapshot;
      perform netra_private.provision_push_fingerprint_keyring(curr,accepted);
    end if;
    if to_regnamespace('${schema}') is not null then execute 'drop schema ${schema} cascade'; end if;
  end $$;`;

  return { tag, schema, userA, userB, setup, sessionA, sessionB, gateWait, assertion: finalSql(assertion), cleanup };
}
