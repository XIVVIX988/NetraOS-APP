export const PUSH_ALLOWED_ORIGINS = new Set([
  "https://xivvix988.github.io",
  "http://127.0.0.1:5500",
]);

export const PUSH_MAX_BODY_BYTES = 4096;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function corsHeaders(origin) {
  if (!PUSH_ALLOWED_ORIGINS.has(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

export function jsonResponse(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function readJsonBody(request, maxBytes = PUSH_MAX_BODY_BYTES) {
  const contentType = request.headers.get("content-type") || "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return { ok: false, status: 415, code: "JSON_REQUIRED" };
  try {
    if (!request.body) return { ok: false, status: 400, code: "INVALID_BODY" };
    const reader = request.body.getReader();
    const chunks = [];
    let byteLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, status: 413, code: "BODY_TOO_LARGE" };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, status: 400, code: "INVALID_BODY" };
    return { ok: true, value };
  } catch {
    return { ok: false, status: 400, code: "INVALID_BODY" };
  }
}

export function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

export function validateRegistrationBody(body) {
  if (Object.keys(body).some(key => !["client_instance_id", "generation", "fid"].includes(key)) ||
      !isUuid(body.client_instance_id) || !Number.isSafeInteger(body.generation) || body.generation < 1 ||
      typeof body.fid !== "string" || body.fid.length < 1 || body.fid.length > 128 ||
      body.fid.trim() !== body.fid || /[\u0000-\u001f\u007f]/.test(body.fid)) {
    return { ok: false, code: "INVALID_REGISTRATION" };
  }
  return { ok: true };
}

export function validateLifecycleBody(body) {
  if (!isUuid(body.client_instance_id) || typeof body.action !== "string") return { ok: false, code: "INVALID_REQUEST" };
  const action = body.action;
  if (action === "state") return { ok: Object.keys(body).every(key => ["client_instance_id", "action"].includes(key)), action, code: "INVALID_REQUEST" };
  if (action === "opt_in") {
    if (Object.keys(body).some(key => !["client_instance_id", "action", "consent_version"].includes(key)) || typeof body.consent_version !== "string" || body.consent_version.trim() !== body.consent_version ||
        body.consent_version.length < 1 || body.consent_version.length > 64) return { ok: false, code: "INVALID_REQUEST" };
    return { ok: true, action };
  }
  if (action === "pause" || action === "revoke") {
    if (Object.keys(body).some(key => !["client_instance_id", "action", "expected_generation", "operation_id"].includes(key)) || !Number.isSafeInteger(body.expected_generation) || body.expected_generation < 0 || !isUuid(body.operation_id)) return { ok: false, code: "INVALID_REQUEST" };
    return { ok: true, action };
  }
  if (action === "resume") {
    if (Object.keys(body).some(key => !["client_instance_id", "action", "operation_id"].includes(key)) || !isUuid(body.operation_id)) return { ok: false, code: "INVALID_REQUEST" };
    return { ok: true, action };
  }
  return { ok: false, code: "INVALID_REQUEST" };
}

export function rpcFailureCode(status, body) {
  const code = body && typeof body.code === "string" ? body.code : "";
  if (["DEVICE_LIMIT", "FID_ALREADY_CLAIMED", "STALE_GENERATION", "RETRY_STATE_CHANGED", "CONSENT_REQUIRED", "CONSENT_REVOKED", "IDEMPOTENCY_CONFLICT", "DEVICE_NOT_FOUND"].includes(code)) return code;
  if (status === 401 || status === 403) return "AUTH_REQUIRED";
  return "REQUEST_FAILED";
}
