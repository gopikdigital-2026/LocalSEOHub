export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export const GBP_SCOPE = "https://www.googleapis.com/auth/business.manage";

export interface AttemptStart {
  userId: string;
  businessId: string;
  state: string;
  startedAt: string;
}

export interface StartDeps {
  getUserId(jwt: string): Promise<string | null>;
  // The caller's own business, or null when they have none; throws on lookup failure.
  getOwnBusinessId(userId: string): Promise<string | null>;
  // Server-side write: status 'connecting', a fresh state, and no leftover error from a previous attempt.
  beginAttempt(attempt: AttemptStart): Promise<boolean>;
  env(name: string): string | undefined;
  randomState?: () => string;
  now?: () => Date;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function defaultState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function attemptRow(a: AttemptStart) {
  return {
    user_id: a.userId,
    business_id: a.businessId,
    source_type: "google_business",
    status: "connecting",
    last_error: null,
    external_account_id: null,
    external_location_id: null,
    metadata: { phase: "authorizing", oauth_state: a.state, oauth_started_at: a.startedAt },
    updated_at: a.startedAt,
  };
}

export function createHandler(deps: StartDeps) {
  const randomState = deps.randomState ?? defaultState;
  const now = deps.now ?? (() => new Date());

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

    try {
      const clientId = deps.env("GOOGLE_CLIENT_ID");
      const redirectUri = deps.env("GOOGLE_REDIRECT_URI");
      if (!clientId || !redirectUri) {
        return json({
          code: "NOT_CONFIGURED",
          error: "La conexion con Google Business esta pendiente de configuracion. Contacta con soporte para activar la integracion.",
        }, 503);
      }

      const authHeader = req.headers.get("Authorization");
      const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
      const userId = jwt ? await deps.getUserId(jwt) : null;
      if (!userId) return json({ code: "NOT_AUTHENTICATED", error: "Sesion no valida" }, 401);

      let requestedBusinessId: unknown = null;
      try {
        requestedBusinessId = (await req.json())?.businessId ?? null;
      } catch {
        requestedBusinessId = null;
      }

      const businessId = await deps.getOwnBusinessId(userId);
      if (!businessId) {
        return json({ code: "NO_BUSINESS", error: "No se encontro tu negocio. Completa la configuracion inicial." }, 400);
      }
      if (requestedBusinessId !== null && requestedBusinessId !== businessId) {
        return json({ code: "FORBIDDEN", error: "Negocio no valido" }, 403);
      }

      const state = randomState();
      const started = await deps.beginAttempt({ userId, businessId, state, startedAt: now().toISOString() });
      if (!started) {
        console.error("[gbp-oauth-start] attempt write failed");
        return json({ code: "INTERNAL_ERROR", error: "No se pudo iniciar la conexion. Vuelve a intentarlo." }, 500);
      }

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: GBP_SCOPE,
        access_type: "offline",
        prompt: "consent",
        state,
      });
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, state });
    } catch {
      console.error("[gbp-oauth-start] unhandled error");
      return json({ code: "INTERNAL_ERROR", error: "Error interno al iniciar la conexion" }, 500);
    }
  };
}
