import { type CredentialStore, revokeGoogleToken } from "./gbpToken.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export type ResolveResult =
  | { kind: "found"; sourceId: string }
  | { kind: "none" }
  | { kind: "forbidden" }
  | { kind: "failed" };

export interface DisconnectDeps {
  getUserId(jwt: string): Promise<string | null>;
  // Must resolve only through the authenticated user's own business.
  resolveSource(userId: string, businessId: string | null): Promise<ResolveResult>;
  credentials(sourceId: string): CredentialStore;
  // Clears stored credentials and removes the connection; must succeed even if revocation failed.
  removeSource(userId: string, sourceId: string): Promise<boolean>;
  fetch: typeof fetch;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function createHandler(deps: DisconnectDeps) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

    try {
      const authHeader = req.headers.get("Authorization");
      const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
      const userId = jwt ? await deps.getUserId(jwt) : null;
      if (!userId) return json({ success: false, code: "NOT_AUTHENTICATED" }, 401);

      let body: { businessId?: unknown } = {};
      try {
        body = await req.json();
      } catch {
        body = {};
      }
      const businessId = typeof body.businessId === "string" && body.businessId ? body.businessId : null;

      const resolved = await deps.resolveSource(userId, businessId);
      if (resolved.kind === "failed") return json({ success: false, code: "INTERNAL_ERROR" }, 500);
      if (resolved.kind === "forbidden") return json({ success: false, code: "FORBIDDEN" }, 403);
      if (resolved.kind === "none") return json({ success: true, revoked: false, removed: false });

      let revoked = false;
      try {
        const creds = await deps.credentials(resolved.sourceId).read();
        // Revoking the refresh token ends the whole grant; the access token is the fallback.
        revoked = await revokeGoogleToken(creds?.refreshToken ?? creds?.accessToken ?? null, deps.fetch);
      } catch {
        revoked = false;
      }

      const removed = await deps.removeSource(userId, resolved.sourceId);
      console.info("[gbp-disconnect] completed", { revoked, removed });
      if (!removed) return json({ success: false, code: "INTERNAL_ERROR", revoked }, 500);
      return json({ success: true, revoked, removed });
    } catch {
      console.error("[gbp-disconnect] unhandled error");
      return json({ success: false, code: "INTERNAL_ERROR" }, 500);
    }
  };
}
