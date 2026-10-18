const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: Record<string, string>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!bearer || !supabaseUrl || !publishableKey || !serviceRoleKey) {
    return respond({ error: "Account deletion is unavailable." }, 401);
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${bearer}` },
    });
    if (!userResponse.ok) return respond({ error: "Sign in again before deleting this account." }, 401);
    const user = await userResponse.json();
    if (typeof user.id !== "string" || !user.id) return respond({ error: "Unable to verify the account." }, 401);

    const deletionResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!deletionResponse.ok) {
      console.error("Supabase Auth user deletion failed:", deletionResponse.status);
      return respond({ error: "Supabase could not delete this account." }, 502);
    }
    return respond({ success: "Account deleted." }, 200);
  } catch (error) {
    console.error("Account deletion request failed:", error);
    return respond({ error: "Account deletion failed. Try again later." }, 502);
  }
});
