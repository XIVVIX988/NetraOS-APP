import { corsHeaders, jsonResponse, readJsonBody, validateRegistrationBody } from "../_shared/push-http.mjs";

const response = (body: Record<string, unknown>, status: number, cors: Record<string, string>) => jsonResponse(body, status, cors);

async function verifySession(url: string, anonKey: string, bearer: string) {
  const result = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${bearer}` } });
  if (!result.ok) return false;
  const user = await result.json().catch(() => null);
  return typeof user?.id === "string" && user.id.length > 0;
}

async function firebaseConfigMatches(url: string, serviceKey: string, expectedAppId: string) {
  const result = await fetch(`${url}/rest/v1/rpc/read_push_firebase_app_config`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!result.ok) return false;
  const rows = await result.json().catch(() => null);
  const config = Array.isArray(rows) ? rows[0] : rows;
  return config?.enabled === true && typeof config.firebase_app_id === "string" && config.firebase_app_id === expectedAppId;
}

Deno.serve(async request => {
  const cors = corsHeaders(request.headers.get("origin"));
  if (!cors) return jsonResponse({ error: "ORIGIN_NOT_ALLOWED" }, 403, {});
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return response({ error: "METHOD_NOT_ALLOWED" }, 405, cors);

  const body = await readJsonBody(request);
  if (!body.ok) return response({ error: body.code }, body.status, cors);
  const validation = validateRegistrationBody(body.value);
  if (!validation.ok) return response({ error: validation.code }, 400, cors);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const firebaseAppId = Deno.env.get("FIREBASE_APP_ID");
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!url || !anonKey || !serviceKey || !firebaseAppId || !bearer) return response({ error: "SERVICE_UNAVAILABLE" }, 503, cors);

  try {
    if (!await verifySession(url, anonKey, bearer)) return response({ error: "AUTH_REQUIRED" }, 401, cors);
    if (!await firebaseConfigMatches(url, serviceKey, firebaseAppId)) return response({ error: "PUSH_NOT_CONFIGURED" }, 503, cors);

    const rpc = await fetch(`${url}/rest/v1/rpc/push_register_device`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_client_instance_id: body.value.client_instance_id,
        p_generation: body.value.generation,
        p_fid: body.value.fid,
      }),
    });
    const result = await rpc.json().catch(() => null);
    if (!rpc.ok) return response({ error: rpc.status === 401 ? "AUTH_REQUIRED" : "REQUEST_FAILED" }, rpc.status === 401 ? 401 : 409, cors);
    if (!result?.ok) {
      const code = typeof result?.code === "string" ? result.code : "REQUEST_FAILED";
      const status = code === "PUSH_NOT_CONFIGURED" ? 503 : code === "DEVICE_LIMIT" || code === "FID_ALREADY_CLAIMED" ? 409 : 409;
      return response({ error: code }, status, cors);
    }
    return response({ ok: true, state: "active", generation: result.generation }, 200, cors);
  } catch {
    return response({ error: "REQUEST_FAILED" }, 502, cors);
  }
});
