import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { makeConcurrencyFixture } from "./push-stage3a-concurrency-fixtures.mjs";
import { REQUIRED_DISPOSABLE_DATABASE, runValidatedPsql, validatePushTestDatabaseUrl } from "./push-stage3a-db-connection.mjs";

const databaseUrl = process.env.NETRAOS_PUSH_TEST_DATABASE_URL;
const disposableFlag = process.env.NETRAOS_PUSH_TEST_DISPOSABLE;
const validation = validatePushTestDatabaseUrl(databaseUrl, disposableFlag);
const psqlAvailable = spawnSync("psql", ["--version"], { stdio: "ignore", windowsHide: true }).status === 0;
const enabled = validation.ok && psqlAvailable;
const unavailableReasons = [];
if (!validation.ok) unavailableReasons.push(validation.code);
if (!psqlAvailable) unavailableReasons.push("psql executable unavailable");
const unavailable = unavailableReasons.length
  ? `Independent-session PostgreSQL tests not run: ${unavailableReasons.join("; ")}. Use a loopback URL for the dedicated ${REQUIRED_DISPOSABLE_DATABASE} database and set NETRAOS_PUSH_TEST_DISPOSABLE=1.`
  : false;

function psql(sql) {
  return runValidatedPsql(databaseUrl, disposableFlag, sql);
}

/** Two separately spawned psql processes, released from a SQL barrier together. */
async function runIndependentSessions(sqlA, sqlB) {
  if (!enabled) throw new Error(unavailable);
  const results = await Promise.allSettled([psql(sqlA), psql(sqlB)]);
  const failure = results.find(result => result.status === "rejected");
  if (failure) throw failure.reason;
  return results.map(result => result.value);
}

const scenarios = [
  "resume versus pause",
  "registration versus revoke",
  "two accounts claiming the same FID",
  "concurrent registration at the final available device slot",
  "Firebase configuration rotation versus registration",
  "HMAC key rotation versus registration",
  "account deletion versus registration",
  "recovery versus registration",
  "concurrent rate-limit requests",
  "re-key versus revocation",
  "recovery versus revoke",
  "simultaneous recovery attempts",
];

test("database URL gate accepts only explicit loopback disposable PostgreSQL", () => {
  const valid = `postgresql://postgres:secret@127.0.0.1:54322/${REQUIRED_DISPOSABLE_DATABASE}`;
  assert.equal(validatePushTestDatabaseUrl(valid, "1").ok, true);
  assert.equal(validatePushTestDatabaseUrl(`postgres://postgres:secret@db.example.com/${REQUIRED_DISPOSABLE_DATABASE}`, "1").ok, false);
  assert.equal(validatePushTestDatabaseUrl(`postgres://postgres:secret@8.8.8.8/${REQUIRED_DISPOSABLE_DATABASE}`, "1").ok, false);
  assert.equal(validatePushTestDatabaseUrl("not a database url", "1").ok, false);
  assert.equal(validatePushTestDatabaseUrl(`https://tester:secret@127.0.0.1/${REQUIRED_DISPOSABLE_DATABASE}`, "1").ok, false);
  assert.equal(validatePushTestDatabaseUrl(valid, "0").ok, false);

  let childStarts = 0;
  const forbiddenSpawn = () => { childStarts += 1; throw new Error("spawn must not occur"); };
  assert.throws(() => runValidatedPsql(`postgres://postgres:secret@db.example.com/${REQUIRED_DISPOSABLE_DATABASE}`, "1", "select 1", forbiddenSpawn), /NON_LOOPBACK_HOST_REJECTED/);
  assert.throws(() => runValidatedPsql("malformed", "1", "select 1", forbiddenSpawn), /MALFORMED_DATABASE_URL/);
  assert.equal(childStarts, 0, "rejected URLs cannot launch a SQL child process");
});

for (const scenario of scenarios) {
  test(`independent PostgreSQL sessions: ${scenario}`, { skip: unavailable }, async () => {
    const fixture = await makeConcurrencyFixture(scenario);
    let setupStarted = false;
    try {
      setupStarted = true;
      await psql(fixture.setup);
      await runIndependentSessions(fixture.sessionA, fixture.sessionB);
      assert.equal(await psql(fixture.assertion), "true", `database invariant failed: ${scenario}`);
    } finally {
      if (setupStarted) await psql(fixture.cleanup);
    }
  });
}

test("all twelve concurrency cases generate independent-session SQL and scoped cleanup", async () => {
  for (const scenario of scenarios) {
    const fixture = await makeConcurrencyFixture(scenario);
    assert.match(fixture.setup, /create schema push_race_[a-f0-9]{32}/);
    assert.match(fixture.sessionA, /arrivals=arrivals\+1/);
    assert.match(fixture.sessionB, /arrivals=arrivals\+1/);
    assert.match(fixture.sessionA, /begin;/i);
    assert.match(fixture.sessionB, /begin;/i);
    assert.match(fixture.assertion, /case when \([\s\S]+\) then 'true' else 'false' end/i);
    assert.match(fixture.cleanup, /delete from auth\.users where id in/);
    assert.match(fixture.cleanup, /drop schema push_race_[a-f0-9]{32} cascade/);
    assert.doesNotMatch(fixture.cleanup, /drop database|delete from auth\.users\s*;/i);
  }
});
