import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { REQUIRED_DISPOSABLE_DATABASE, runValidatedPsql, validatePushTestDatabaseUrl } from "./push-stage3a-db-connection.mjs";

const databaseUrl = process.env.NETRAOS_PUSH_TEST_DATABASE_URL;
const disposableFlag = process.env.NETRAOS_PUSH_TEST_DISPOSABLE;
const validation = validatePushTestDatabaseUrl(databaseUrl, disposableFlag);
const psqlAvailable = spawnSync("psql", ["--version"], { stdio: "ignore", windowsHide: true }).status === 0;
const enabled = validation.ok && psqlAvailable;
const unavailable = [!validation.ok ? validation.code : "", !psqlAvailable ? "psql executable unavailable" : ""]
  .filter(Boolean).join("; ");
const userId = randomUUID();
const email = `push-3b-${userId}@example.invalid`;

function psql(sql) {
  return runValidatedPsql(databaseUrl, disposableFlag, sql);
}

test("push preference writes to separate categories preserve both values across independent sessions", { skip: enabled ? false : `Not run: ${unavailable}. Use only the dedicated loopback ${REQUIRED_DISPOSABLE_DATABASE} database with NETRAOS_PUSH_TEST_DISPOSABLE=1.` }, async () => {
  const setup = `begin;
insert into auth.users(id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('${userId}', 'authenticated', 'authenticated', '${email}', '', '{}'::jsonb, '{}'::jsonb);
commit;`;
  const sessionA = `begin;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','${userId}',true);
select pg_sleep(0.15);
select public.push_set_notification_preference('financial_alerts',true);
commit;`;
  const sessionB = `begin;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','${userId}',true);
select pg_sleep(0.15);
select public.push_set_notification_preference('reminders',true);
commit;`;
  const assertion = `select case when (
  select financial_alerts and reminders
  from netra_private.push_notification_preferences where user_id='${userId}'
) then 'true' else 'false' end;`;
  let setupStarted = false;
  try {
    await psql(setup);
    setupStarted = true;
    const results = await Promise.allSettled([psql(sessionA), psql(sessionB)]);
    const failure = results.find(result => result.status === "rejected");
    if (failure) throw failure.reason;
    assert.equal(await psql(assertion), "true", "separate category updates must both persist");
  } finally {
    if (setupStarted) await psql(`delete from auth.users where id='${userId}';`);
  }
});
