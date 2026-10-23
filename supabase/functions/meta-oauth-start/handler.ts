export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export const META_GRAPH_VERSION = "v25.0";
// Minimal read-only set: list the Pages the user manages and read the linked Instagram professional account.
export const META_SCOPES = ["pages_show_list", "pages_read_engagement", "business_management", "instagram_basic"];
export const STATE_TTL_MS = 10 * 60 * 1000;
export const ALREADY_CONNECTED = "already_connected";

export interface BeginAttempt {
  userId: string;
  businessId: string;
  stateHash: string;
  bindingHash: string;
  expiresAt: string;
}

export interface StartDeps {
  getUserId(jwt: string): Promise<string | null>;
  getOwnBusinessId(userId: string): Promise<string | null>;
  // Returns the connection id, null when the business is not owned by the user, or ALREADY_CONNECTED.
  beginAttempt(attempt: BeginAttempt): Promise<string | null>;
  env(name: string): string | undefined;
  randomToken?: () => string;
  now?: () => Date;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function createHandler(deps: StartDeps) {
  const token = deps.randomToken ?? randomToken;
  const now = deps.now ?? (() => new Date());

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

    try {
      const appId = deps.env("META_APP_ID");
      const redirectUri = deps.env("META_REDIRECT_URI");
      if (!appId || !redirectUri || !deps.env("META_APP_SECRET")) {
        return json({ code: "META_APP_NOT_CONFIGURED", error: "La conexión con Meta todavía no está disponible." }, 503);
      }

      const authHeader = req.headers.get("Authorization");
      const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
      const userId = jwt ? await deps.getUserId(jwt) : null;
      if (!userId) return json({ code: "NOT_AUTHENTICATED", error: "Sesión no válida" }, 401);

      const businessId = await deps.getOwnBusinessId(userId);
      if (!businessId) return json({ code: "NO_BUSINESS", error: "No se encontró tu negocio." }, 400);

      const state = token();
      const binding = token();
      const connectionId = await deps.beginAttempt({
        userId,
        businessId,
        stateHash: await sha256Hex(state),
        bindingHash: await sha256Hex(binding),
        expiresAt: new Date(now().getTime() + STATE_TTL_MS).toISOString(),
      });
      if (connectionId === ALREADY_CONNECTED) {
        return json({ code: "ALREADY_CONNECTED", error: "Facebook e Instagram ya están conectados." }, 409);
      }
      if (!connectionId) {
        console.error("[meta-oauth-start] attempt write failed");
        return json({ code: "UNKNOWN_ERROR", error: "No se pudo iniciar la conexión. Vuelve a intentarlo." }, 500);
      }

      const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: redirectUri,
        state,
        response_type: "code",
        scope: META_SCOPES.join(","),
        // Without rerequest Meta silently skips permissions the user declined in an earlier attempt.
        auth_type: "rerequest",
      });
      console.log("[meta-oauth-start]", JSON.stringify({ stage: "authorize_url", scopes: META_SCOPES, auth_type: "rerequest" }));
      return json({
        url: `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params.toString()}`,
        binding,
      });
    } catch {
      console.error("[meta-oauth-start] unhandled error");
      return json({ code: "UNKNOWN_ERROR", error: "No se pudo iniciar la conexión. Vuelve a intentarlo." }, 500);
    }
  };
}
