import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");

    if (!clientId || !clientSecret || !redirectUri) {
      return new Response(
        JSON.stringify({ error: "Google API no configurado en el servidor" }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { code, state } = await req.json();
    if (!code || !state) {
      return new Response(
        JSON.stringify({ error: "Codigo y estado requeridos" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const jwt = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(jwt);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Sesion no valida" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── CSRF: validate state against DB ──
    const { data: sourceRow } = await supabaseAdmin
      .from("connected_sources")
      .select("metadata")
      .eq("user_id", user.id)
      .eq("business_id", "default")
      .eq("source_type", "google_business")
      .maybeSingle();

    const storedState = (sourceRow?.metadata as Record<string, unknown>)
      ?.oauth_state;
    if (!storedState || storedState !== state) {
      return new Response(
        JSON.stringify({
          error:
            "La verificacion de seguridad ha fallado (state no coincide). Vuelve a iniciar la conexion.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // ── Exchange code for tokens ──
    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      return new Response(
        JSON.stringify({
          error: "Error al intercambiar el codigo de autorizacion con Google",
          details: errBody,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const tokens = await tokenResponse.json();

    // ── Store tokens (service_role bypasses column restrictions) ──
    // NOTE: Tokens are stored as-is. For production, encrypt with a KMS
    // or Vault service before persisting. The column names reflect the
    // intended target state, not the current implementation.
    await supabaseAdmin
      .from("connected_sources")
      .upsert(
        {
          user_id: user.id,
          business_id: "default",
          source_type: "google_business",
          status: "connecting",
          access_token_encrypted: tokens.access_token,
          refresh_token_encrypted: tokens.refresh_token ?? null,
          token_expires_at: tokens.expires_in
            ? new Date(
                Date.now() + tokens.expires_in * 1000
              ).toISOString()
            : null,
          metadata: { oauth_state: null, tokens_stored_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,business_id,source_type" }
      );

    // ── Fetch GBP accounts ──
    const accountsResponse = await fetch(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    if (!accountsResponse.ok) {
      const body = await accountsResponse.text();
      return new Response(
        JSON.stringify({
          error: "No se pudieron obtener las cuentas de Google Business Profile",
          details: body,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const accountsData = await accountsResponse.json();
    const accounts = (accountsData.accounts ?? []).map(
      (a: { name: string; accountName?: string }) => ({
        id: a.name,
        name: a.accountName ?? a.name,
      })
    );

    return new Response(JSON.stringify({ accounts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
