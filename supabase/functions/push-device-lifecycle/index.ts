import { corsHeaders, jsonResponse, readJsonBody, validateLifecycleBody } from "../_shared/push-http.mjs";

const reply = (body: Record<string, unknown>, status: number, cors: Record<string, string>) => jsonResponse(body, status, cors);

async function verifySession(url: string, anonKey: string, bearer: string) {
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` } });
  if (!response.ok) return false;
  const user = await response.json().catch(() => null);
  return typeof user?.id === "string" && user.id.length > 0;
}

async function firebaseConfigMatches(url: string, serviceKey: string, expectedAppId: string) {
  const response = await fetch(`${url}/rest/v1/rpc/read_push_firebase_app_config`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) return false;
  const rows = await response.json().catch(() => null);
  const config = Array.isArray(rows) ? rows[0] : rows;
  return config?.enabled === true && config.firebase_app_id === expectedAppId;
}

const RPC_BY_ACTION: Record<string, { name: string; args: (body: Record<string, unknown>) => Record<string, unknown> }> = {
  state: { name: "push_get_device_state", args: body => ({ p_client_instance_id: body.client_instance_id }) },
  opt_in: { name: "push_begin_opt_in", args: body => ({ p_client_instance_id: body.client_instance_id, p_consent_version: body.consent_version }) },
  pause: { name: "push_pause_device", args: body => ({ p_client_instance_id: body.client_instance_id, p_expected_generation: body.expected_generation, p_operation_id: body.operation_id }) },
  resume: { name: "push_resume_device", args: body => ({ p_client_instance_id: body.client_instance_id, p_operation_id: body.operation_id }) },
  revoke: { name: "push_revoke_device", args: body => ({ p_client_instance_id: body.client_instance_id, p_expected_generation: body.expected_generation, p_operation_id: body.operation_id }) },
};

Deno.serve(async request => {
  const cors = corsHeaders(request.headers.get("origin"));
  if (!cors) return jsonResponse({ error: "ORIGIN_NOT_ALLOWED" }, 403, {});
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405, cors);

  const body = await readJsonBody(request);
  if (!body.ok) return reply({ error: body.code }, body.status, cors);
  const validation = validateLifecycleBody(body.value);
  if (!validation.ok) return reply({ error: validation.code }, 400, cors);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const firebaseAppId = Deno.env.get("FIREBASE_APP_ID");
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!url || !anonKey || !serviceKey || !bearer) return reply({ error: "SERVICE_UNAVAILABLE" }, 503, cors);

  try {
    if (!await verifySession(url, anonKey, bearer)) return reply({ error: "AUTH_REQUIRED" }, 401, cors);
    if (["opt_in", "resume"].includes(validation.action)) {
      if (!firebaseAppId || !await firebaseConfigMatches(url, serviceKey, firebaseAppId)) return reply({ error: "PUSH_NOT_CONFIGURED" }, 503, cors);
    }
    const rpcSpec = RPC_BY_ACTION[validation.action];
    const rpc = await fetch(`${url}/rest/v1/rpc/${rpcSpec.name}`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify(rpcSpec.args(body.value)),
    });
    const result = await rpc.json().catch(() => null);
    if (!rpc.ok) return reply({ error: rpc.status === 401 ? "AUTH_REQUIRED" : "REQUEST_FAILED" }, rpc.status === 401 ? 401 : 409, cors);
    if (!result?.ok) {
      const code = typeof result?.code === "string" ? result.code : "REQUEST_FAILED";
      const status = code === "DEVICE_LIMIT" || code === "FID_ALREADY_CLAIMED" || code === "STALE_GENERATION" || code === "RETRY_STATE_CHANGED" || code === "IDEMPOTENCY_CONFLICT" ? 409 : 400;
      return reply({ error: code }, status, cors);
    }
    return reply(result, 200, cors);
  } catch {
    return reply({ error: "REQUEST_FAILED" }, 502, cors);
  }
});
