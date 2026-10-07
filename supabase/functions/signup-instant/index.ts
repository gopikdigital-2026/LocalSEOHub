import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const IP_LIMIT = { limit: 10, windowSeconds: 3600 };
const EMAIL_LIMIT = { limit: 5, windowSeconds: 3600 };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || req.headers.get("x-real-ip") || "unknown").slice(0, 64);
}

async function withinLimit(url: string, key: string, bucket: string, cfg: { limit: number; windowSeconds: number }) {
  const res = await fetch(`${url}/rest/v1/rpc/consume_rate_limit`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_bucket: bucket, p_limit: cfg.limit, p_window_seconds: cfg.windowSeconds }),
  });
  if (!res.ok) throw new Error(`rate limit rpc ${res.status}`);
  return (await res.json()) === true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => null);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!EMAIL_RE.test(email) || password.length < 6 || password.length > 72) {
      return json({ error: "invalid_input" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const ipOk = await withinLimit(supabaseUrl, serviceRoleKey, `signup:ip:${clientIp(req)}`, IP_LIMIT);
    const emailOk = ipOk && await withinLimit(supabaseUrl, serviceRoleKey, `signup:email:${email}`, EMAIL_LIMIT);
    if (!ipOk || !emailOk) return json({ error: "rate_limited" }, 429);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // An existing account is never modified here, and the response is identical either way.
    const { error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      const alreadyExists = createError.status === 422 || /already|exists/i.test(createError.message);
      if (!alreadyExists) {
        console.error("signup-instant create failed", createError.status);
        return json({ error: "signup_failed" }, 400);
      }
    }

    return json({ ok: true });
  } catch (err) {
    console.error("signup-instant failed", err instanceof Error ? err.message : "unknown");
    return json({ error: "unavailable" }, 503);
  }
});
