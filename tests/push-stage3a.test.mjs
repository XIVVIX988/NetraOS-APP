import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { corsHeaders, readJsonBody, validateLifecycleBody, validateRegistrationBody } from "../supabase/functions/_shared/push-http.mjs";

const CLIENT_SOURCE = fs.readFileSync(new URL("../js/register-service-worker.js", import.meta.url), "utf8");
const USER_A = "user-a";
const USER_B = "user-b";
const INSTANCE_A = "616f0b8e-644e-4f4b-a6a0-a5ac3e27be91";
const OP_A = "2647d553-a927-40d2-a234-b4b8da6ab3c6";

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
  key(index) { return [...this.values.keys()][index] ?? null; }
}

class LockHarness {
  tails = new Map();
  async request(name, _options, callback) {
    const before = this.tails.get(name) || Promise.resolve();
    let release;
    const tail = new Promise(resolve => { release = resolve; });
    this.tails.set(name, before.then(() => tail));
    await before;
    try { return await callback(); } finally { release(); }
  }
  async query() { return { held: [], pending: [] }; }
}

function makeResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function loadClient({ fetchImpl = async () => makeResponse({ ok: true }), permission = "granted" } = {}) {
  const storage = new MemoryStorage();
  const listeners = new Map();
  let randomIdCounter = 0;
  let session = null;
  const auth = { signOut: async () => { session = null; return { error: null }; } };
  const supabase = {
    enabled: true,
    client: { auth },
    getSession: async () => ({ data: { session } }),
  };
  const windowObject = {
    isSecureContext: true,
    crypto: { randomUUID: () => `3d1f9d50-0e72-45e5-91d2-${String(++randomIdCounter).padStart(12, "0")}` },
    NetraSupabase: supabase,
    NETRAOS_SUPABASE_CONFIG: { url: "https://example.supabase.co", publishableKey: "public-test-key" },
    addEventListener(name, listener) { listeners.set(name, listener); },
    dispatchEvent() { return true; },
    setTimeout,
    clearTimeout,
    Notification: { get permission() { return permission; }, requestPermission: async () => permission },
    PushManager: function PushManager() {},
  };
  const navigatorObject = {
    serviceWorker: { register: async () => ({}), getRegistration: async () => ({ scope: "https://xivvix988.github.io/NetraOS-APP/", active: {} }) },
    locks: new LockHarness(),
  };
  const documentObject = { addEventListener(name, listener) { listeners.set(`document:${name}`, listener); }, querySelector() { return null; } };
  const context = vm.createContext({
    window: windowObject, navigator: navigatorObject, document: documentObject, location: { protocol: "https:", hostname: "xivvix988.github.io", href: "https://xivvix988.github.io/NetraOS-APP/" },
    localStorage: storage, Notification: windowObject.Notification, CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    URL, AbortController, fetch: fetchImpl, Response, console, setTimeout, clearTimeout, Promise,
  });
  vm.runInContext(CLIENT_SOURCE, context, { filename: "register-service-worker.js" });
  return { context, storage, window: windowObject, listeners, auth, setSession(value) { session = value; }, setPermission(value) { permission = value; } };
}

test("same-account tabs serialize creation and reuse one installation identity", async () => {
  const app = loadClient();
  const manager = app.window.NetraPushCore.createIdentityManager({ storage: app.storage, locks: app.context.navigator.locks, cryptoObject: app.window.crypto });
  const [first, second] = await Promise.all([manager.getOrCreate(USER_A), manager.getOrCreate(USER_A)]);
  assert.equal(first, second);
  assert.equal(await manager.getExisting(USER_A), first);
});

test("account identities and pending deactivation records remain isolated", async () => {
  const app = loadClient();
  const manager = app.window.NetraPushCore.createIdentityManager({ storage: app.storage, locks: app.context.navigator.locks, cryptoObject: app.window.crypto });
  const first = await manager.getOrCreate(USER_A);
  const second = await manager.getOrCreate(USER_B);
  assert.notEqual(first, second);
  await manager.savePending({ userId: USER_A, clientInstanceId: first, operationId: OP_A, fid: "must-not-persist" });
  assert.deepEqual(JSON.parse(JSON.stringify(await manager.listPending(USER_A))), [{ userId: USER_A, clientInstanceId: first, operationId: OP_A }]);
  assert.deepEqual(JSON.parse(JSON.stringify(await manager.listPending(USER_B))), []);
  const pendingJson = [...app.storage.values.entries()].find(([key]) => key.includes("pending-deactivation"))[1];
  assert.deepEqual(Object.keys(JSON.parse(pendingJson)).sort(), ["clientInstanceId", "operationId", "userId"]);
  assert.equal(pendingJson.includes("must-not-persist"), false);
});

test("callback gate requires same user, identity, active consent, current generation and granted permission", async () => {
  const app = loadClient();
  const gate = app.window.NetraPushCore.maySubmitCallback;
  const valid = { expectedUserId: USER_A, currentUserId: USER_A, expectedInstanceId: INSTANCE_A, currentInstanceId: INSTANCE_A, permission: "granted", consentActive: true, expectedGeneration: 4, currentGeneration: 4 };
  assert.equal(gate(valid), true);
  for (const change of [
    { currentUserId: USER_B }, { currentInstanceId: "other" }, { permission: "default" },
    { permission: "denied" }, { consentActive: false }, { currentGeneration: 5 },
  ]) assert.equal(gate({ ...valid, ...change }), false);
});

test("sign-out failure retains only account-scoped retry metadata and retries after same-user authentication", async () => {
  const calls = [];
  let failPause = true;
  const app = loadClient({ fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body); calls.push(body);
    if (body.action === "state") return makeResponse({ ok: true, state: "active", app_consent: true, generation: 7 });
    if (body.action === "pause" && failPause) throw new Error("network offline");
    if (body.action === "pause") return makeResponse({ ok: true, state: "paused", generation: 8 });
    return makeResponse({ ok: true });
  } });
  app.storage.setItem(`netraos.push.instance.v1:${USER_A}`, INSTANCE_A);
  app.setSession({ access_token: "user-session-token", user: { id: USER_A } });
  await app.auth.signOut();
  const pendingKey = [...app.storage.values.keys()].find(key => key.startsWith(`netraos.push.pending-deactivation.v1:${USER_A}:`));
  assert.ok(pendingKey);
  assert.equal(app.storage.getItem(`netraos.push.instance.v1:${USER_A}`), null);
  const pending = JSON.parse(app.storage.getItem(pendingKey));
  assert.deepEqual(Object.keys(pending).sort(), ["clientInstanceId", "operationId", "userId"]);
  assert.equal(calls.some(body => body.action === "pause"), true);

  // A different account cannot consume the first account's retry record.
  app.setSession({ access_token: "other-session", user: { id: USER_B } });
  await app.window.NetraPush.retryPendingDeactivations(USER_B);
  assert.ok(app.storage.getItem(pendingKey));

  failPause = false;
  app.setSession({ access_token: "user-session-token", user: { id: USER_A } });
  await app.window.NetraPush.retryPendingDeactivations(USER_A);
  assert.equal(app.storage.getItem(pendingKey), null);
  assert.equal(app.storage.getItem(`netraos.push.instance.v1:${USER_A}`), INSTANCE_A);
});

test("observed default or denied permission requests a pause for a currently reserved device", async t => {
  for (const permission of ["default", "denied"]) {
    await t.test(permission, async () => {
      const calls = [];
      const app = loadClient({ permission, fetchImpl: async (_url, init) => {
        const body = JSON.parse(init.body); calls.push(body);
        if (body.action === "state") return makeResponse({ ok: true, state: "active", app_consent: true, generation: 9 });
        if (body.action === "pause") return makeResponse({ ok: true, state: "paused", generation: 10 });
        return makeResponse({ ok: true });
      } });
      app.storage.setItem(`netraos.push.instance.v1:${USER_A}`, INSTANCE_A);
      app.setSession({ access_token: "session", user: { id: USER_A } });
      await app.window.NetraPush.reconcilePermission();
      assert.equal(calls.some(body => body.action === "pause"), true);
      assert.equal((await app.window.NetraPushCore.createIdentityManager({ storage: app.storage, locks: app.context.navigator.locks, cryptoObject: app.window.crypto }).listPending(USER_A)).length, 0);
    });
  }
});

test("public push API does not expose a FID accessor and the registration module does not log FIDs", async () => {
  const app = loadClient();
  assert.equal(Object.keys(app.window.NetraPush).some(key => /fid/i.test(key)), false);
  assert.equal("getLastFid" in app.window.NetraPush, false);
  assert.match(CLIENT_SOURCE, /let lastObservedFid;/);
  assert.doesNotMatch(CLIENT_SOURCE, /console\.(?:log|warn|error)\([^\n]*(?:lastObservedFid|fid)/i);
  assert.doesNotMatch(CLIENT_SOURCE, /localStorage\.(?:setItem|set)\([^\n]*(?:lastObservedFid|fid)/i);
});

test("CORS allows only the approved production and documented local origins", () => {
  assert.equal(corsHeaders("https://xivvix988.github.io")["Access-Control-Allow-Origin"], "https://xivvix988.github.io");
  assert.equal(corsHeaders("http://127.0.0.1:5500")["Access-Control-Allow-Origin"], "http://127.0.0.1:5500");
  assert.equal(corsHeaders("http://localhost:5500"), null);
  assert.equal(corsHeaders("https://attacker.example"), null);
  assert.equal(corsHeaders("null"), null);
});

test("request size is measured from streamed bytes rather than Content-Length", async () => {
  const largeBody = new TextEncoder().encode(JSON.stringify({ data: "x".repeat(5000) }));
  const request = new Request("https://edge.example/function", { method: "POST", headers: { "content-type": "application/json", "content-length": "1" }, body: largeBody });
  assert.deepEqual(await readJsonBody(request, 4096), { ok: false, status: 413, code: "BODY_TOO_LARGE" });
});

test("Edge request validators reject injected user IDs and malformed lifecycle inputs", () => {
  assert.equal(validateRegistrationBody({ client_instance_id: INSTANCE_A, generation: 1, fid: "fid-value" }).ok, true);
  assert.equal(validateRegistrationBody({ client_instance_id: INSTANCE_A, generation: 1, fid: "fid-value", user_id: USER_B }).ok, false);
  assert.equal(validateRegistrationBody({ client_instance_id: INSTANCE_A, generation: 0, fid: "fid-value" }).ok, false);
  assert.equal(validateLifecycleBody({ action: "opt_in", client_instance_id: INSTANCE_A, consent_version: " " }).ok, false);
  assert.equal(validateLifecycleBody({ action: "pause", client_instance_id: INSTANCE_A, expected_generation: 2, operation_id: OP_A }).ok, true);
  assert.equal(validateLifecycleBody({ action: "state", client_instance_id: INSTANCE_A, user_id: USER_B }).ok, false);
});

test("migration declares private ownership, serial locks, idempotency and slot reservation invariants", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/20261118000100_push_devices.sql", import.meta.url), "utf8");
  assert.match(sql, /create unique index if not exists push_devices_fid_unique[\s\S]*where fid is not null/i);
  assert.match(sql, /status in \('pending','active','paused'\)/i);
  assert.match(sql, /push_device_operations[\s\S]*primary key \(user_id, operation_id\)/i);
  assert.match(sql, /fp := encode\(extensions\.digest\('pause\|' \|\| p_client_instance_id::text/i);
  assert.match(sql, /perform pg_advisory_xact_lock_shared\(hashtextextended\('netra-push-config'/i);
  assert.match(sql, /grant execute on function public\.push_get_device_state[\s\S]*to authenticated/i);
  assert.match(sql, /grant execute on function public\.read_push_firebase_app_config\(\) to service_role/i);
  assert.match(sql, /revoke all on all tables in schema netra_private from public, anon, authenticated, service_role/i);
});
