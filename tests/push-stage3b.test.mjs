import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const migration = fs.readFileSync(new URL("../supabase/migrations/20261119000100_push_notification_preferences.sql", import.meta.url), "utf8");
const clientSource = fs.readFileSync(new URL("../js/register-service-worker.js", import.meta.url), "utf8");
const settingsSource = fs.readFileSync(new URL("../js/scrip.js", import.meta.url), "utf8");

const USER_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const INSTANCE_A = "616f0b8e-644e-4f4b-a6a0-a5ac3e27be91";

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(key); }
  key(index) { return [...this.values.keys()][index] ?? null; }
}

function makeResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function makePushApp({ stateGeneration = 7, pauseStatus = 200 } = {}) {
  const storage = new MemoryStorage();
  const calls = [];
  const prefs = { ok: true, account_security: true, financial_alerts: false, reminders: false, product_updates: false, announcements_offers: false };
  let id = 0;
  const session = { access_token: "test-token", user: { id: USER_A } };
  const windowObject = {
    Notification: { permission: "granted" },
    crypto: { randomUUID: () => `3d1f9d50-0e72-45e5-91d2-${String(++id).padStart(12, "0")}` },
    NetraSupabase: {
      enabled: true,
      client: { auth: { signOut: async () => ({ error: null }) } },
      getSession: async () => ({ data: { session } }),
    },
    NETRAOS_SUPABASE_CONFIG: { url: "https://example.supabase.co", publishableKey: "public-test-key" },
    addEventListener() {}, dispatchEvent() {}, confirm: () => true,
    setTimeout, clearTimeout,
  };
  const documentObject = { addEventListener() {}, querySelector() { return null; } };
  const navigatorObject = { locks: { request: async (_name, _options, callback) => callback() } };
  const fetchImpl = async (_url, init) => {
    if (_url.includes("/rest/v1/rpc/")) {
      const name = _url.split("/").at(-1);
      const args = JSON.parse(init.body || "{}");
      calls.push({ rpc: name, args, authorization: init.headers.Authorization });
      if (name === "push_get_notification_preferences") return makeResponse({ ...prefs });
      if (name === "push_set_notification_preference") {
        prefs[args.p_category] = args.p_enabled;
        return makeResponse({ ...prefs });
      }
      return makeResponse({ error: "unexpected rpc" }, 404);
    }
    const body = JSON.parse(init.body);
    calls.push({ action: body.action, body });
    if (body.action === "state") return makeResponse({ ok: true, state: "active", generation: stateGeneration, app_consent: true });
    if (body.action === "pause") {
      if (pauseStatus !== 200) return makeResponse({ error: "REQUEST_FAILED" }, pauseStatus);
      return makeResponse({ ok: true, state: "paused", generation: stateGeneration + 1 });
    }
    if (body.action === "list") return makeResponse([{ client_instance_id: INSTANCE_A, generation: stateGeneration, state: "active", app_consent: true }]);
    return makeResponse({ ok: true });
  };
  const context = vm.createContext({
    window: windowObject, document: documentObject, navigator: navigatorObject,
    location: { protocol: "https:", hostname: "xivvix988.github.io", href: "https://xivvix988.github.io/NetraOS-APP/" },
    localStorage: storage, Notification: windowObject.Notification, CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    URL, AbortController, fetch: fetchImpl, Response, console, setTimeout, clearTimeout, Promise,
  });
  vm.runInContext(clientSource, context, { filename: "register-service-worker.js" });
  return { push: windowObject.NetraPush, calls, prefs, storage };
}

test("preference migration uses authenticated per-account defaults and denies direct table access", () => {
  assert.match(migration, /user_id uuid primary key references auth\.users\(id\) on delete cascade/);
  assert.match(migration, /financial_alerts boolean not null default false/);
  assert.match(migration, /reminders boolean not null default false/);
  assert.match(migration, /product_updates boolean not null default false/);
  assert.match(migration, /announcements_offers boolean not null default false/);
  assert.match(migration, /uid uuid := auth\.uid\(\)/);
  assert.match(migration, /when 'account_security' then[\s\S]*?ESSENTIAL_CATEGORY/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table netra_private\.push_notification_preferences from public, anon, authenticated, service_role/);
  assert.match(migration, /set financial_alerts = excluded\.financial_alerts, updated_at = now\(\)/);
  assert.match(migration, /set reminders = excluded\.reminders, updated_at = now\(\)/);
  assert.match(migration, /set product_updates = excluded\.product_updates, updated_at = now\(\)/);
  assert.match(migration, /set announcements_offers = excluded\.announcements_offers, updated_at = now\(\)/);
  assert.doesNotMatch(migration, /p_user_id/);
});

test("push preference API reads defaults and updates only an allowed category", async () => {
  const { push, calls, prefs } = makePushApp();
  const before = await push.getNotificationPreferences();
  assert.equal(before.account_security, true);
  assert.equal(before.financial_alerts, false);
  const after = await push.setNotificationPreference("reminders", true);
  assert.equal(after.reminders, true);
  assert.equal(prefs.reminders, true);
  assert.equal(calls.filter(call => call.rpc === "push_set_notification_preference").length, 1);
  assert.equal(calls.find(call => call.rpc === "push_set_notification_preference").authorization, "Bearer test-token");
  await assert.rejects(push.setNotificationPreference("account_security", false), /valid optional push category/);
  assert.equal(calls.filter(call => call.rpc === "push_set_notification_preference").length, 1);
});

test("manual device pause rechecks generation under the existing device lifecycle lock", async () => {
  const { push, calls, storage } = makePushApp();
  const result = await push.pauseRegisteredDevice(INSTANCE_A, 7);
  assert.equal(result.ok, true);
  assert.equal(result.confirmed, true);
  const stateIndex = calls.findIndex(call => call.action === "state");
  const pauseIndex = calls.findIndex(call => call.action === "pause");
  assert.ok(stateIndex >= 0 && pauseIndex > stateIndex);
  assert.equal(calls[pauseIndex].body.expected_generation, 7);
  assert.match(calls[pauseIndex].body.operation_id, /^[0-9a-f-]{36}$/i);
  assert.equal([...storage.values.keys()].some(key => key.includes("pending-deactivation")), false, "confirmed pause clears its pending retry record");
});

test("manual pause rejects stale generations without sending a pause request", async () => {
  const { push, calls } = makePushApp({ stateGeneration: 8 });
  const result = await push.pauseRegisteredDevice(INSTANCE_A, 7);
  assert.equal(result.ok, false);
  assert.equal(result.confirmed, false);
  assert.equal(result.error, "STALE_GENERATION");
  assert.equal(calls.some(call => call.action === "pause"), false);
});

test("failed pause remains explicitly unconfirmed and preserves retry metadata", async () => {
  const { push, calls, storage } = makePushApp({ pauseStatus: 503 });
  const result = await push.pauseRegisteredDevice(INSTANCE_A, 7);
  assert.equal(result.ok, false);
  assert.equal(result.confirmed, false);
  assert.equal(result.retry_persisted, true);
  assert.equal(calls.some(call => call.action === "pause"), true);
  assert.ok([...storage.values.keys()].some(key => key.includes("pending-deactivation")));
});

test("push settings distinguish browser categories from existing in-app reminders", () => {
  assert.match(settingsSource, /data-push-preference="financial_alerts"/);
  assert.match(settingsSource, /data-push-preference="reminders"/);
  assert.match(settingsSource, /Account and security[\s\S]*?Always enabled/);
  assert.match(settingsSource, /Quest milestones[\s\S]*?In-app notices/);
  assert.match(settingsSource, /Announcements and offers/);
});

test("device UI hides raw instance identifiers and exposes current-browser-only resume", () => {
  assert.doesNotMatch(clientSource, /id\.textContent\s*=\s*String\(device\.client_instance_id/);
  assert.match(clientSource, /device\.state === "paused" && device\.client_instance_id === currentId/);
  assert.match(clientSource, /if \(!await isCurrentDevice\(deviceResume\.dataset\.pushDeviceResume\)\)/);
  assert.match(clientSource, /data-push-device-pause/);
  assert.match(clientSource, /data-push-device-revoke/);
});
