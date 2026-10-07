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

  const SITE_URL = Deno.env.get("SITE_URL") || "https://localseohub.io";
  const frontendCallback = `${SITE_URL}/oauth/google-business/callback`;

  function redirectWithError(msg: string): Response {
    const url = `${frontendCallback}?error=${encodeURIComponent(msg)}`;
    return new Response(null, { status: 302, headers: { Location: url } });
  }

  try {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");

    if (!clientId || !clientSecret || !redirectUri) {
      return redirectWithError("Google API no configurado en el servidor");
    }

    let code: string | null = null;
    let state: string | null = null;

    if (req.method === "GET") {
      const url = new URL(req.url);
      code = url.searchParams.get("code");
      state = url.searchParams.get("state");

      const googleError = url.searchParams.get("error");
      if (googleError) {
        return redirectWithError(`Google denego el acceso: ${googleError}`);
      }
    } else {
      try {
        const body = await req.json();
        code = body.code ?? null;
        state = body.state ?? null;
      } catch {
        return redirectWithError("Solicitud invalida");
      }
    }

    if (!code || !state) {
      return redirectWithError("Faltan parametros de autorizacion (code/state)");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Look up the user by matching the exact oauth_state value.
    // This is the key fix: filter by metadata->>oauth_state = state
    // instead of just source_type + status, which fails when multiple
    // users are connecting simultaneously (maybeSingle returns error).
    const { data: sourceRow, error: lookupError } = await supabaseAdmin
      .from("connected_sources")
      .select("user_id, business_id, metadata")
      .eq("source_type", "google_business")
      .eq("status", "connecting")
      .eq("metadata->>oauth_state", state)
      .maybeSingle();

    if (lookupError) {
      console.error("[gbp-oauth-callback] DB lookup error:", lookupError.code ?? "unknown");
      return redirectWithError(
        "Error al buscar la conexion en curso. Vuelve a iniciar la conexion desde Fuentes."
      );
    }

    if (!sourceRow) {
      return redirectWithError(
        "No se encontro una conexion en curso. Vuelve a iniciar la conexion desde Fuentes."
      );
    }

    const userId = sourceRow.user_id;

    // The business travels with the OAuth state row; confirm it is still this user's business.
    const { data: business, error: businessError } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .eq("id", sourceRow.business_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (businessError || !business) {
      return redirectWithError(
        "No se encontro tu negocio. Vuelve a iniciar la conexion desde Fuentes."
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
      await tokenResponse.body?.cancel();
      console.error("[gbp-oauth-callback] Token exchange failed, status:", tokenResponse.status);
      return redirectWithError(
        "Error al intercambiar el codigo de autorizacion con Google"
      );
    }

    const tokens = await tokenResponse.json();

    // Tokens are stored as plain text in the *_encrypted columns; they are protected by
    // column grants (no client read access) and RLS, not by encryption.
    const { error: upsertError } = await supabaseAdmin
      .from("connected_sources")
      .upsert(
        {
          user_id: userId,
          business_id: business.id,
          source_type: "google_business",
          status: "connecting",
          access_token_encrypted: tokens.access_token,
          refresh_token_encrypted: tokens.refresh_token ?? null,
          token_expires_at: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            : null,
          metadata: {
            oauth_state: null,
            tokens_stored_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,business_id,source_type" }
      );

    if (upsertError) {
      console.error("[gbp-oauth-callback] Token upsert failed:", upsertError.code ?? "unknown");
      return redirectWithError("No se pudo guardar la conexion con Google. Vuelve a intentarlo desde Fuentes.");
    }

    // ── Fetch GBP accounts ──
    const accountsResponse = await fetch(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    if (!accountsResponse.ok) {
      await accountsResponse.body?.cancel();
      console.error("[gbp-oauth-callback] GBP accounts fetch failed, status:", accountsResponse.status);
      return redirectWithError(
        "No se pudieron obtener las cuentas de Google Business Profile"
      );
    }

    const accountsData = await accountsResponse.json();
    const accounts = (accountsData.accounts ?? []).map(
      (a: { name: string; accountName?: string }) => ({
        id: a.name,
        name: a.accountName ?? a.name,
      })
    );

    const accountsParam = encodeURIComponent(JSON.stringify(accounts));
    const successUrl = `${frontendCallback}?accounts=${accountsParam}`;
    return new Response(null, {
      status: 302,
      headers: { Location: successUrl },
    });
  } catch (err) {
    console.error("[gbp-oauth-callback] Unhandled error:", err instanceof Error ? err.name : "unknown");
    return redirectWithError("Error interno al conectar con Google. Vuelve a intentarlo desde Fuentes.");
  }
});
