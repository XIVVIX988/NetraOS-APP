import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const migration = fs.readFileSync(new URL("../supabase/migrations/20261118000200_push_stage3a_remediation.sql", import.meta.url), "utf8");
const edge = fs.readFileSync(new URL("../supabase/functions/_shared/push-stage3a.ts", import.meta.url), "utf8");
const edgeValidation = fs.readFileSync(new URL("../supabase/functions/_shared/push-http.mjs", import.meta.url), "utf8");
const client = fs.readFileSync(new URL("../js/register-service-worker.js", import.meta.url), "utf8");

const USER_A = "user-a";
const USER_B = "user-b";
const OLD_INSTANCE = "616f0b8e-644e-4f4b-a6a0-a5ac3e27be91";
const FID = `c${"A".repeat(21)}`;

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(key); }
  key(index) { return [...this.values.keys()][index] ?? null; }
}

class SharedLocks {
  tails = new Map();
  fail = false;
  async request(name, _options, callback) {
    if (this.fail) throw new Error("Web Lock unavailable");
    const before = this.tails.get(name) || Promise.resolve();
    let release;
    const tail = new Promise(resolve => { release = resolve; });
    this.tails.set(name, before.then(() => tail));
    await before;
    try { return await callback(); } finally { release(); }
  }
  async query() { return { held: [], pending: [] }; }
}

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

function recoveryApp({ shared = {}, permission = "granted", confirm = () => false, candidate = null, list = null, state = null, onRequest = null, onRegister = null, signOut = null } = {}) {
  const storage = shared.storage || new MemoryStorage();
  const locks = shared.locks || new SharedLocks();
  const calls = [];
  const listeners = new Map();
  const appCallback = { current: null };
  const registerStarted = deferred();
  let session = { access_token: "test-user-token", user: { id: USER_A } };
  let idCounter = 0;
  const registration = { scope: "https://xivvix988.github.io/NetraOS-APP/", active: {} };
  const appSdk = { getApps: () => [], initializeApp: () => ({}) };
  const messagingSdk = {
    isSupported: async () => true,
    getMessaging: () => ({}),
    onRegistered: (_messaging, callback) => { appCallback.current = callback; },
    register: async () => { registerStarted.resolve(); return onRegister ? onRegister(appCallback) : Promise.resolve(); },
  };
  const windowObject = {
    isSecureContext: true,
    location: { href: "https://xivvix988.github.io/NetraOS-APP/" },
    crypto: { randomUUID: () => `3d1f9d50-0e72-45e5-91d2-${String(++idCounter).padStart(12, "0")}` },
    Notification: { get permission() { return permission; }, requestPermission: async () => permission },
    PushManager: function PushManager() {},
    __testFirebaseAppSdk: appSdk,
    __testFirebaseMessagingSdk: messagingSdk,
    indexedDB: shared.indexedDB,
    NetraSupabase: { enabled: true, client: { auth: { signOut: (...args) => signOut ? signOut(...args) : Promise.resolve({ error: null }) } }, getSession: async () => ({ data: { session } }) },
    NETRAOS_SUPABASE_CONFIG: { url: "https://example.supabase.co", publishableKey: "public-test-key" },
    addEventListener(name, listener) { listeners.set(`window:${name}`, listener); },
    dispatchEvent() { return true; },
    confirm,
    setTimeout,
    clearTimeout,
  };
  const documentObject = {
    addEventListener(name, listener) { listeners.set(`document:${name}`, listener); },
    querySelector() { return null; },
  };
  const navigatorObject = {
    serviceWorker: { register: async () => registration, getRegistration: async () => registration },
    locks,
  };
  const source = client
    .replace('import("https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js")', "Promise.resolve(window.__testFirebaseAppSdk)")
    .replace('import("https://www.gstatic.com/firebasejs/13.3.0/firebase-messaging.js")', "Promise.resolve(window.__testFirebaseMessagingSdk)")
    .replace(/const firebaseWebConfig = Object\.freeze\(\{[\s\S]*?\n  \}\);/, `const firebaseWebConfig = Object.freeze({apiKey:"test",authDomain:"test",projectId:"test",messagingSenderId:"test",appId:"1:2:web:3",vapidKey:"public-vapid"});`)
    .replace("const requestTimeoutMs = 8000;", "const requestTimeoutMs = 30;");
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const custom = await onRequest?.(body, init.signal);
    if (custom) return custom;
    if (body.action === "state") return new Response(JSON.stringify(state ? state(body) : { ok: true, state: "not_registered" }), { status: 200 });
    if (body.action === "list") return new Response(JSON.stringify(list ? list() : [{ client_instance_id: OLD_INSTANCE, generation: 5, state: "active", app_consent: true }]), { status: 200 });
    if (body.action === "recovery_candidate") return new Response(JSON.stringify(candidate ? candidate(body) : { ok: true, client_instance_id: OLD_INSTANCE, generation: 5, state: "active", app_consent: true }), { status: 200 });
    if (body.action === "recover") return new Response(JSON.stringify({ ok: true, state: "active", generation: 6, recovered: true }), { status: 200 });
    if (body.action === "pause") return new Response(JSON.stringify({ ok: true, state: "paused", generation: 2 }), { status: 200 });
    if (body.action === "revoke") return new Response(JSON.stringify({ ok: true, state: "revoked", generation: 2 }), { status: 200 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const context = vm.createContext({
    window: windowObject, navigator: navigatorObject, document: documentObject,
    location: { protocol: "https:", hostname: "xivvix988.github.io", href: "https://xivvix988.github.io/NetraOS-APP/" },
    localStorage: storage, Notification: windowObject.Notification, CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    URL, AbortController, fetch: fetchImpl, Response, console, setTimeout, clearTimeout, Promise,
  });
  vm.runInContext(source, context, { filename: "register-service-worker.js" });
  const status = { textContent: "" };
  const wrapper = { querySelector: selector => selector === "[data-push-status]" ? status : null };
  const recoverButton = { disabled: false, closest: selector => selector === "[data-push-settings]" ? wrapper : null };
  const clickRecover = async () => {
    const handler = listeners.get("document:click");
    await handler({ target: { closest: selector => selector === "[data-push-recover]" ? recoverButton : null } });
    return status.textContent;
  };
  return {
    calls, listeners, status, recoverButton, clickRecover, registerStarted, appCallback, storage, locks,
    window: windowObject,
    setSession(value) { session = value; },
    setPermission(value) { permission = value; },
  };
}

test("browser cannot execute registration, resume or opt-in mutation RPCs", () => {
  assert.match(migration, /revoke all on function public\.push_begin_opt_in\(uuid, text\) from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.push_edge_opt_in[\s\S]*push_edge_register[\s\S]*to service_role/i);
  assert.match(migration, /auth\.role\(\) is distinct from 'service_role'/i);
  assert.match(edge, /\/auth\/v1\/user/);
  assert.match(edge, /p_user_id: userId/);
});

test("resume is generation-bound and rate checks precede mutation", () => {
  const body = migration.slice(migration.indexOf("create or replace function public.push_edge_resume"), migration.indexOf("create or replace function public.push_edge_recover"));
  assert.match(body, /p_expected_generation bigint/);
  assert.match(body, /d\.registration_generation <> p_expected_generation/);
  assert.ok(body.indexOf("if n >= 10") < body.indexOf("update netra_private.push_devices set registration_generation"));
  assert.match(body, /push_store_operation[\s\S]*return result/);
});

test("pause binds operation replay to generation and avoids repeated pause mutations", () => {
  const body = migration.slice(migration.indexOf("create or replace function public.push_pause_device"), migration.indexOf("create or replace function public.push_revoke_device"));
  assert.match(body, /old_op\.request_fingerprint <> fp/);
  assert.match(body, /d\.status = 'paused'[\s\S]*already_paused/);
  assert.match(body, /d\.registration_generation <> p_expected_generation/);
});

test("FID fingerprint keys never enter the browser and raw FID is not browser-persisted or logged", () => {
  assert.match(edge, /PUSH_FID_HMAC_KEYS/);
  assert.match(edge, /HMAC/);
  assert.doesNotMatch(client, /localStorage\.(?:setItem|getItem)\([^\n]*fid/i);
  assert.doesNotMatch(client, /console\.(?:log|warn|error)\([^\n]*fid/i);
  assert.match(client, /navigator\.serviceWorker\.register\("\.\/service-worker\.js"\)/);
});

test("configuration comparison is backed by a transactionally locked private check", () => {
  assert.match(edge, /config\.firebase_app_id !== expectedAppId/);
  assert.match(migration, /pg_advisory_xact_lock_shared\(hashtextextended\('netra-push-config'/i);
  assert.match(migration, /cfg\.firebase_app_id is distinct from p_expected_app_id/i);
});

test("device identities and account-linked rows cascade on account deletion", () => {
  assert.match(migration, /references auth\.users\(id\) on delete cascade/i);
  assert.match(migration, /push_device_fingerprints[\s\S]*on update cascade on delete cascade/i);
  assert.doesNotMatch(client, /delete-account/i);
});

test("recovery rechecks the authenticated account after the global Firebase callback", async () => {
  const gate = deferred();
  const app = recoveryApp({ onRegister: () => gate.promise });
  const click = app.clickRecover();
  await app.registerStarted.promise;
  app.setSession({ access_token: "different", user: { id: USER_B } });
  app.appCallback.current(FID);
  gate.resolve();
  await click;
  assert.equal(app.calls.some(call => call.action === "recover" || call.action === "recovery_candidate"), false);
  assert.match(app.status.textContent, /account changed/i);
});

test("recovery is stopped if browser notification permission changes during registration", async () => {
  const gate = deferred();
  const app = recoveryApp({ onRegister: () => gate.promise });
  const click = app.clickRecover();
  await app.registerStarted.promise;
  app.setPermission("denied");
  app.appCallback.current(FID);
  gate.resolve();
  await click;
  assert.equal(app.calls.some(call => call.action === "recover" || call.action === "recovery_candidate"), false);
  assert.match(app.status.textContent, /permission changed/i);
});

test("recovery stops when the candidate consent is revoked while Firebase registration is pending", async () => {
  const gate = deferred();
  let consent = true;
  const app = recoveryApp({
    onRegister: () => gate.promise,
    candidate: () => consent ? { ok: true, client_instance_id: OLD_INSTANCE, generation: 5, state: "active", app_consent: true } : { ok: false, error: "RECOVERY_UNAVAILABLE" },
  });
  const click = app.clickRecover();
  await app.registerStarted.promise;
  consent = false;
  app.appCallback.current(FID);
  gate.resolve();
  await click;
  assert.equal(app.calls.some(call => call.action === "recover"), false);
});

test("recovery aborts when the candidate generation changed while Firebase registration was pending", async () => {
  const gate = deferred();
  const app = recoveryApp({
    onRegister: () => gate.promise,
    candidate: () => ({ ok: true, client_instance_id: OLD_INSTANCE, generation: 6, state: "active", app_consent: true }),
  });
  const click = app.clickRecover();
  await app.registerStarted.promise;
  app.appCallback.current(FID);
  gate.resolve();
  await click;
  assert.equal(app.calls.some(call => call.action === "recover"), false);
  assert.match(app.status.textContent, /device changed/i);
});

test("two tabs serialize recovery and only one server recovery is submitted", async () => {
  const gate = deferred();
  const shared = { storage: new MemoryStorage(), locks: new SharedLocks() };
  let recovered = false;
  const sharedState = body => recovered && body.client_instance_id !== OLD_INSTANCE
    ? { ok: true, state: "active", app_consent: true, generation: 6 }
    : { ok: true, state: "not_registered" };
  const sharedList = () => recovered
    ? [{ client_instance_id: "3d1f9d50-0e72-45e5-91d2-000000000001", generation: 6, state: "active", app_consent: true }]
    : [{ client_instance_id: OLD_INSTANCE, generation: 5, state: "active", app_consent: true }];
  const appA = recoveryApp({ shared, state: sharedState, list: sharedList, onRegister: () => gate.promise, onRequest: body => {
    if (body.action !== "recover") return null;
    recovered = true;
    return new Response(JSON.stringify({ ok: true, state: "active", generation: 6, recovered: true }), { status: 200 });
  } });
  const appB = recoveryApp({ shared, state: sharedState, list: sharedList });
  const first = appA.clickRecover();
  await appA.registerStarted.promise;
  const second = appB.clickRecover();
  appA.appCallback.current(FID);
  gate.resolve();
  await Promise.all([first, second]);
  const recoveredRequests = [...appA.calls, ...appB.calls].filter(call => call.action === "recover");
  assert.equal(recoveredRequests.length, 1);
  assert.equal(recoveredRequests[0].fid, FID);
});

test("a delayed Firebase callback after prior-device revocation cannot recover that device", async () => {
  const gate = deferred();
  let revoked = false;
  const app = recoveryApp({
    onRegister: () => gate.promise,
    candidate: () => revoked ? { ok: false, error: "RECOVERY_UNAVAILABLE" } : { ok: true, client_instance_id: OLD_INSTANCE, generation: 5, state: "active", app_consent: true },
  });
  const click = app.clickRecover();
  await app.registerStarted.promise;
  revoked = true;
  app.appCallback.current(FID);
  gate.resolve();
  await click;
  assert.equal(app.calls.some(call => call.action === "recover"), false);
});

test("sign-out cancellation releases the lifecycle gate and allows a later explicit attempt", async () => {
  const storage = new MemoryStorage();
  const originalSet = storage.setItem.bind(storage);
  let failPersistence = true;
  storage.setItem = (key, value) => { if (failPersistence && key.includes("pending-deactivation")) throw new Error("local storage disabled"); originalSet(key, value); };
  let failIndexedDb = true;
  let allowEmergency = false;
  let pauseAttempts = 0;
  let signOutAttempts = 0;
  const app = recoveryApp({
    shared: { storage, indexedDB: { open() { if (failIndexedDb) throw new Error("IndexedDB denied"); return Promise.resolve({}); } } },
    confirm: () => allowEmergency,
    state: () => ({ ok: true, state: "active", app_consent: true, generation: 7 }),
    onRequest: body => {
      if (body.action === "pause") { pauseAttempts += 1; throw new Error("pause unavailable"); }
      return null;
    },
    signOut: async () => { signOutAttempts += 1; return { error: null }; },
  });
  storage.setItem(`netraos.push.instance.v1:${USER_A}`, OLD_INSTANCE);
  app.setSession({ access_token: "test-user-token", user: { id: USER_A } });
  await assert.rejects(app.window.NetraSupabase.client.auth.signOut(), /sign-out was paused/i);
  failPersistence = false;
  failIndexedDb = false;
  allowEmergency = false;
  await app.window.NetraSupabase.client.auth.signOut();
  assert.equal(pauseAttempts, 2);
  assert.equal(signOutAttempts, 1);
});

test("failed Supabase sign-out releases its gate even when no auth-state event arrives", async () => {
  let fail = true;
  let calls = 0;
  const app = recoveryApp({ state: () => ({ ok: true, state: "not_registered" }), signOut: async () => {
    calls += 1;
    if (fail) { fail = false; throw new Error("auth sign-out failed"); }
    return { error: null };
  } });
  app.storage.setItem(`netraos.push.instance.v1:${USER_A}`, OLD_INSTANCE);
  app.setSession({ access_token: "test-user-token", user: { id: USER_A } });
  await assert.rejects(app.window.NetraSupabase.client.auth.signOut(), /auth sign-out failed/);
  await app.window.NetraSupabase.client.auth.signOut();
  assert.equal(calls, 2);
});

test("pause timeout remains unconfirmed, persists retry metadata and lets a later sign-out retry", async () => {
  let timeoutFirst = true;
  let signOutCalls = 0;
  const app = recoveryApp({
    state: () => ({ ok: true, state: "active", app_consent: true, generation: 3 }),
    onRequest: (body, signal) => body.action === "pause" && timeoutFirst
      ? new Promise((resolve, reject) => signal.addEventListener("abort", () => { timeoutFirst = false; reject(new Error("aborted")); }, { once: true }))
      : null,
    signOut: async () => { signOutCalls += 1; return { error: null }; },
  });
  app.storage.setItem(`netraos.push.instance.v1:${USER_A}`, OLD_INSTANCE);
  app.setSession({ access_token: "test-user-token", user: { id: USER_A } });
  await app.window.NetraSupabase.client.auth.signOut();
  const pending = [...app.storage.values.entries()].find(([key]) => key.includes("pending-deactivation"));
  assert.ok(pending, "timeout must leave an account-scoped retry operation");
  assert.equal(app.window.NetraPush.getRegistrationState(), "deactivation_unconfirmed");
  assert.equal(signOutCalls, 1);
});

test("a failed Web Lock lookup cannot be reported as a confirmed deactivation", async () => {
  const app = recoveryApp({ confirm: () => false, state: () => ({ ok: true, state: "active", app_consent: true, generation: 1 }) });
  app.storage.setItem(`netraos.push.instance.v1:${USER_A}`, OLD_INSTANCE);
  app.setSession({ access_token: "test-user-token", user: { id: USER_A } });
  app.locks.fail = true;
  await assert.rejects(app.window.NetraSupabase.client.auth.signOut(), /sign-out was paused/i);
  assert.equal(app.calls.some(call => call.action === "pause"), false);
});

test("re-key RPC compares the Edge-computed source fingerprint and generation before insert", () => {
  const body = migration.slice(migration.indexOf("create or replace function public.push_edge_rekey_device"), migration.indexOf("create or replace function public.push_edge_finalize_fid_rotation"));
  assert.match(body, /p_expected_source_fingerprint/);
  assert.match(body, /stored_source is distinct from p_expected_source_fingerprint/);
  assert.match(body, /d\.registration_generation <> p_expected_generation/);
  assert.match(body, /d\.status = 'revoked'/);
  assert.match(edge, /p_expected_source_fingerprint: sourceFingerprint/);
  assert.match(edge, /p_expected_generation: row\.registration_generation/);
});

test("re-key failure paths preserve the source version and rotation cannot retire it early", () => {
  const body = migration.slice(migration.indexOf("create or replace function public.push_edge_rekey_device"), migration.indexOf("create or replace function public.push_edge_finalize_fid_rotation"));
  assert.match(body, /SOURCE_FINGERPRINT_MISSING/);
  assert.match(body, /SOURCE_FINGERPRINT_MISMATCH/);
  assert.match(body, /p_from_version <> all\(versions\) or p_to_version <> all\(versions\)/);
  assert.match(body, /d\.registration_generation <> p_expected_generation or d\.status = 'revoked'/);
  assert.match(migration, /unique \(key_version, fingerprint\)/i);
  assert.doesNotMatch(body, /delete from netra_private\.push_device_fingerprints/);
  const finalize = migration.slice(migration.indexOf("create or replace function public.push_edge_finalize_fid_rotation"), migration.indexOf("-- Replace pause and revoke"));
  assert.match(finalize, /incomplete <> 0/);
  assert.match(finalize, /delete from netra_private\.push_device_fingerprints where key_version <> p_current_version/);
});

test("device management uses safe metadata, expected generation and server-confirmed UI", () => {
  assert.match(migration, /'client_instance_id', d\.client_instance_id[\s\S]*'generation', d\.registration_generation[\s\S]*'last_seen_at', d\.last_seen_at/);
  assert.match(client, /Number\(state\.generation\) !== Number\(expectedGeneration\)/);
  assert.match(client, /if \(!result\?\.ok\) throw new Error\("The server did not confirm device revocation\."\)/);
  assert.match(client, /device\.client_instance_id === currentId \? "This browser"/);
  assert.match(client, /window\.NetraPush = Object\.freeze\(\{[\s\S]*listDevices/);
});

test("recovery RPC locks FID before candidate lookup and rechecks expected generation", () => {
  const body = migration.slice(migration.indexOf("create or replace function public.push_edge_recover("), migration.indexOf("-- Restricted re-key maintenance"));
  assert.ok(body.indexOf("netra-push-fid:' || p_fid") < body.indexOf("from netra_private.push_device_fingerprints"));
  assert.match(body, /p_previous_client_instance_id/);
  assert.match(body, /d\.registration_generation <> p_expected_generation/);
  assert.match(body, /old_op\.request_fingerprint <> fp/);
  assert.match(client, /withLifecycleLock\(userId, instanceId/);
});

test("unverified FID grammar uses one bounded rule and legacy lifecycle updates are not blocked", () => {
  assert.match(migration, /create or replace function netra_private\.is_valid_fid\(p_fid text\)[\s\S]*length\(p_fid\) between 1 and 128[\s\S]*position\(' ' in p_fid\) = 0[\s\S]*p_fid !~ '\[\[:cntrl:\]\]'/i);
  assert.match(migration, /create trigger push_devices_validate_fid\s+before insert or update of fid/i);
  assert.doesNotMatch(migration, /add constraint push_devices_fid_format_check/i);
  assert.doesNotMatch(migration, /check \(fid is null or fid ~ '\^\[cdef\]/i);
  assert.match(edgeValidation, /characters >= 1 && characters <= 128/);
  assert.match(edgeValidation, /!\/\[ \\u0000-\\u001f\\u007f-\\u009f\]\/\.test\(value\)/);
  assert.match(edge, /validateRegistrationBody\(body\.value\)/);
  const pgTap = fs.readFileSync(new URL("../supabase/tests/push_stage3a.test.sql", import.meta.url), "utf8");
  assert.match(pgTap, /legacy fid/i);
  assert.match(pgTap, /legacy FID device can be paused/);
  assert.match(pgTap, /legacy FID device can be permanently revoked/);
});

