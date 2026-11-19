import { corsHeaders, jsonResponse, readJsonBody, validateLifecycleBody, validateRegistrationBody } from "./push-http.mjs";

const reply = (body: Record<string, unknown>, status: number, cors: Record<string, string>) => jsonResponse(body, status, cors);

async function authenticatedUser(url: string, anonKey: string, bearer: string) {
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` } });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return typeof user?.id === "string" ? user.id as string : null;
}

async function rpc(url: string, key: string, name: string, args: Record<string, unknown>, bearer = key) {
  return fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
}

async function runtimeConfig(url: string, anon: string, service: string, expectedAppId: string) {
  const response = await rpc(url, service, "read_push_runtime_config", {}, service);
  if (!response.ok) return null;
  const rows = await response.json().catch(() => null);
  const config = Array.isArray(rows) ? rows[0] : rows;
  if (!config || config.enabled !== true || config.firebase_app_id !== expectedAppId ||
      typeof config.current_fingerprint_version !== "string" || !Array.isArray(config.accepted_fingerprint_versions)) return null;
  return config as { firebase_app_id: string; enabled: boolean; current_fingerprint_version: string; accepted_fingerprint_versions: string[] };
}

function readFingerprintKeys() {
  const raw = Deno.env.get("PUSH_FID_HMAC_KEYS");
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const keys: Record<string, Uint8Array> = {};
    for (const [version, encoded] of Object.entries(value)) {
      if (!/^[a-zA-Z0-9_-]{1,32}$/.test(version) || typeof encoded !== "string") return null;
      const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
      if (bytes.byteLength < 32 || bytes.byteLength > 128) return null;
      keys[version] = bytes;
    }
    return keys;
  } catch { return null; }
}

async function hmacFingerprint(keyBytes: Uint8Array, fid: string) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const message = new TextEncoder().encode(`netraos:fid-fingerprint:v1\0${fid}`);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  return Array.from(signature, byte => byte.toString(16).padStart(2, "0")).join("");
}

function resultStatus(code: unknown) {
  if (code === "AUTH_REQUIRED") return 401;
  if (code === "PUSH_NOT_CONFIGURED" || code === "FINGERPRINT_KEYS_UNAVAILABLE") return 503;
  if (code === "RATE_LIMITED") return 429;
  if (["DEVICE_LIMIT", "FID_ALREADY_CLAIMED", "STALE_GENERATION", "RETRY_STATE_CHANGED", "IDEMPOTENCY_CONFLICT", "DEVICE_NOT_FOUND", "DEVICE_ALREADY_EXISTS", "RECOVERY_UNAVAILABLE", "RECOVERY_STATE_CHANGED", "SOURCE_FINGERPRINT_MISSING", "SOURCE_FINGERPRINT_MISMATCH"].includes(String(code))) return 409;
  return 400;
}

function serviceConfig() {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const appId = Deno.env.get("FIREBASE_APP_ID");
  return url && anon && service ? { url: url.replace(/\/+$/, ""), anon, service, appId } : null;
}

async function requestContext(request: Request, cors: Record<string, string>) {
  const config = serviceConfig();
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!config || !bearer) return { error: reply({ error: "SERVICE_UNAVAILABLE" }, 503, cors) };
  const userId = await authenticatedUser(config.url, config.anon, bearer);
  if (!userId) return { error: reply({ error: "AUTH_REQUIRED" }, 401, cors) };
  return { config, bearer, userId };
}

export async function handlePushRegistration(request: Request) {
  const cors = corsHeaders(request.headers.get("origin"));
  if (!cors) return jsonResponse({ error: "ORIGIN_NOT_ALLOWED" }, 403, {});
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405, cors);
  const body = await readJsonBody(request);
  if (!body.ok) return reply({ error: body.code }, body.status, cors);
  const validation = validateRegistrationBody(body.value);
  if (!validation.ok) return reply({ error: validation.code }, 400, cors);
  const context = await requestContext(request, cors);
  if ("error" in context) return context.error;
  const { config, userId } = context;
  if (!config.appId) return reply({ error: "PUSH_NOT_CONFIGURED" }, 503, cors);
  try {
    const runtime = await runtimeConfig(config.url, config.anon, config.service, config.appId);
    if (!runtime) return reply({ error: "PUSH_NOT_CONFIGURED" }, 503, cors);
    const keys = readFingerprintKeys();
    if (!keys || runtime.accepted_fingerprint_versions.some(version => !keys[version])) return reply({ error: "FINGERPRINT_KEYS_UNAVAILABLE" }, 503, cors);
    const fingerprints = await Promise.all(runtime.accepted_fingerprint_versions.map(async version => ({
      version, fingerprint: await hmacFingerprint(keys[version], body.value.fid),
    })));
    const response = await rpc(config.url, config.service, "push_edge_register", {
      p_user_id: userId, p_client_instance_id: body.value.client_instance_id, p_generation: body.value.generation,
      p_fid: body.value.fid, p_fingerprints: fingerprints, p_operation_id: body.value.operation_id,
      p_expected_app_id: config.appId,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) return reply({ error: "REQUEST_FAILED" }, 502, cors);
    if (!result?.ok) return reply({ error: result?.code || "REQUEST_FAILED", ...(result?.retry_after_seconds ? { retry_after_seconds: result.retry_after_seconds } : {}) }, resultStatus(result?.code), cors);
    return reply({ ok: true, state: result.state, generation: result.generation }, 200, cors);
  } catch { return reply({ error: "REQUEST_FAILED" }, 502, cors); }
}

const userRpcByAction: Record<string, { name: string; args: (body: Record<string, unknown>) => Record<string, unknown> }> = {
  state: { name: "push_get_device_state", args: body => ({ p_client_instance_id: body.client_instance_id }) },
  list: { name: "push_list_devices", args: () => ({}) },
  pause: { name: "push_pause_device", args: body => ({ p_client_instance_id: body.client_instance_id, p_expected_generation: body.expected_generation, p_operation_id: body.operation_id }) },
  revoke: { name: "push_revoke_device", args: body => ({ p_client_instance_id: body.client_instance_id, p_expected_generation: body.expected_generation, p_operation_id: body.operation_id }) },
};
const serverRpcByAction: Record<string, { name: string; args: (body: Record<string, unknown>, userId: string, appId: string) => Record<string, unknown> }> = {
  opt_in: { name: "push_edge_opt_in", args: (body, userId, appId) => ({ p_user_id: userId, p_client_instance_id: body.client_instance_id, p_consent_version: body.consent_version, p_operation_id: body.operation_id, p_expected_app_id: appId }) },
  resume: { name: "push_edge_resume", args: (body, userId, appId) => ({ p_user_id: userId, p_client_instance_id: body.client_instance_id, p_expected_generation: body.expected_generation, p_operation_id: body.operation_id, p_expected_app_id: appId }) },
  recovery_candidate: { name: "push_edge_recovery_candidate", args: (body, userId, appId) => ({ p_user_id: userId, p_fid: body.fid, p_fingerprints: body.fingerprints, p_expected_app_id: appId }) },
  recover: { name: "push_edge_recover", args: (body, userId, appId) => ({ p_user_id: userId, p_new_client_instance_id: body.client_instance_id, p_previous_client_instance_id: body.previous_client_instance_id, p_expected_generation: body.expected_generation, p_fid: body.fid, p_fingerprints: body.fingerprints, p_operation_id: body.operation_id, p_expected_app_id: appId }) },
};

export async function handlePushLifecycle(request: Request) {
  const cors = corsHeaders(request.headers.get("origin"));
  if (!cors) return jsonResponse({ error: "ORIGIN_NOT_ALLOWED" }, 403, {});
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405, cors);
  const body = await readJsonBody(request);
  if (!body.ok) return reply({ error: body.code }, body.status, cors);
  const validation = validateLifecycleBody(body.value);
  if (!validation.ok) return reply({ error: validation.code }, 400, cors);
  const context = await requestContext(request, cors);
  if ("error" in context) return context.error;
  const { config, bearer, userId } = context;
  try {
    const action = validation.action;
    let response: Response;
    if (userRpcByAction[action]) {
      const spec = userRpcByAction[action];
      response = await rpc(config.url, config.anon, spec.name, spec.args(body.value), bearer);
    } else {
      const spec = serverRpcByAction[action];
      if (!spec) return reply({ error: "INVALID_REQUEST" }, 400, cors);
      if (!config.appId || !await runtimeConfig(config.url, config.anon, config.service, config.appId)) return reply({ error: "PUSH_NOT_CONFIGURED" }, 503, cors);
      let args = spec.args(body.value, userId, config.appId);
      if (action === "recover" || action === "recovery_candidate") {
        const runtime = await runtimeConfig(config.url, config.anon, config.service, config.appId);
        const keys = readFingerprintKeys();
        if (!runtime || !keys || runtime.accepted_fingerprint_versions.some(version => !keys[version])) return reply({ error: "FINGERPRINT_KEYS_UNAVAILABLE" }, 503, cors);
        const fingerprints = await Promise.all(runtime.accepted_fingerprint_versions.map(async version => ({
          version, fingerprint: await hmacFingerprint(keys[version], body.value.fid),
        })));
        args = { ...args, p_fingerprints: fingerprints };
      }
      response = await rpc(config.url, config.service, spec.name, args);
    }
    const result = await response.json().catch(() => null);
    if (!response.ok) return reply({ error: response.status === 401 ? "AUTH_REQUIRED" : "REQUEST_FAILED" }, response.status === 401 ? 401 : 502, cors);
    if (result?.ok === false) return reply({ error: result.code || "REQUEST_FAILED", ...(result.retry_after_seconds ? { retry_after_seconds: result.retry_after_seconds } : {}) }, resultStatus(result.code), cors);
    return reply(result && typeof result === "object" ? result : { ok: true }, 200, cors);
  } catch { return reply({ error: "REQUEST_FAILED" }, 502, cors); }
}

function constantTimeEqual(left: string, right: string) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return difference === 0;
}

// Internal operator-only bounded rotation worker. Raw FIDs stay inside this
// trusted function and are never included in its response or logs.
export async function handleFingerprintRekey(request: Request) {
  if (request.headers.has("origin")) return jsonResponse({ error: "ORIGIN_NOT_ALLOWED" }, 403, {});
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, {});
  const expectedSecret = Deno.env.get("PUSH_FINGERPRINT_ROTATION_JOB_SECRET");
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expectedSecret || !constantTimeEqual(supplied, expectedSecret)) return jsonResponse({ error: "AUTH_REQUIRED" }, 401, {});
  const body = await readJsonBody(request, 1024);
  if (!body.ok || Object.keys(body.value).some(key => !["from_version", "to_version", "limit"].includes(key)) ||
      typeof body.value.from_version !== "string" || !/^[a-zA-Z0-9_-]{1,32}$/.test(body.value.from_version) ||
      typeof body.value.to_version !== "string" || !/^[a-zA-Z0-9_-]{1,32}$/.test(body.value.to_version) ||
      body.value.from_version === body.value.to_version || !Number.isSafeInteger(body.value.limit) || body.value.limit < 1 || body.value.limit > 100) {
    return jsonResponse({ error: "INVALID_REQUEST" }, 400, {});
  }
  const config = serviceConfig(), keys = readFingerprintKeys();
  if (!config || !keys?.[body.value.from_version] || !keys?.[body.value.to_version]) return jsonResponse({ error: "SERVICE_UNAVAILABLE" }, 503, {});
  try {
    const keyringResponse = await rpc(config.url, config.service, "read_push_runtime_config", {}, config.service);
    if (!keyringResponse.ok) return jsonResponse({ error: "SERVICE_UNAVAILABLE" }, 503, {});
    const rows = await keyringResponse.json().catch(() => null), runtime = Array.isArray(rows) ? rows[0] : rows;
    if (!runtime || !runtime.accepted_fingerprint_versions?.includes(body.value.from_version) || !runtime.accepted_fingerprint_versions?.includes(body.value.to_version)) return jsonResponse({ error: "KEY_VERSION_NOT_ACCEPTED" }, 409, {});
    const batch = await rpc(config.url, config.service, "push_edge_rekey_batch", { p_from_version: body.value.from_version, p_to_version: body.value.to_version, p_limit: body.value.limit });
    if (!batch.ok) return jsonResponse({ error: "REQUEST_FAILED" }, 502, {});
    const rowsToUpdate = await batch.json().catch(() => null);
    if (!Array.isArray(rowsToUpdate)) return jsonResponse({ error: "REQUEST_FAILED" }, 502, {});
    let updated = 0;
    for (const row of rowsToUpdate) {
      if (typeof row?.fid !== "string" || typeof row?.user_id !== "string" || typeof row?.client_instance_id !== "string") return jsonResponse({ error: "REQUEST_FAILED" }, 502, {});
      const fingerprint = await hmacFingerprint(keys[body.value.to_version], row.fid);
      const sourceFingerprint = await hmacFingerprint(keys[body.value.from_version], row.fid);
      const resultResponse = await rpc(config.url, config.service, "push_edge_rekey_device", {
        p_user_id: row.user_id, p_client_instance_id: row.client_instance_id, p_expected_fid: row.fid,
        p_expected_generation: row.registration_generation,
        p_from_version: body.value.from_version, p_to_version: body.value.to_version,
        p_expected_source_fingerprint: sourceFingerprint, p_new_fingerprint: fingerprint,
      });
      const result = await resultResponse.json().catch(() => null);
      if (!resultResponse.ok || !result?.ok) return jsonResponse({ error: result?.code || "REQUEST_FAILED", updated }, 409, {});
      updated += 1;
    }
    return jsonResponse({ ok: true, processed: rowsToUpdate.length, updated, has_more: rowsToUpdate.length === body.value.limit }, 200, {});
  } catch { return jsonResponse({ error: "REQUEST_FAILED" }, 502, {}); }
}
