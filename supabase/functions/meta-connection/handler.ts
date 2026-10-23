export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export const META_GRAPH_VERSION = "v25.0";
// OAuth state TTL (10 min) plus a 60 s grace for a callback already in flight.
export const STALE_ATTEMPT_MS = 11 * 60 * 1000;
const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export type InstagramStatus = "connected" | "not_associated" | "unsupported" | "permission_unavailable" | "api_error";
export type FailStatus = "disconnected" | "error" | "reauth_required";
export type CompleteResult = "unknown" | "wrong_user" | "binding_mismatch" | "expired" | "stale" | "ok";

export interface Connection {
  id: string;
  status: string;
  availablePages: { id: string; name: string }[];
  attemptStartedAt: string | null;
  tokenExpiresAt: string | null;
}

export interface PageSelection {
  connectionId: string;
  pageId: string;
  pageName: string;
  instagramStatus: InstagramStatus;
  instagramId: string | null;
  instagramUsername: string | null;
}

export interface ConnectionDeps {
  getUserId(jwt: string): Promise<string | null>;
  getOwnConnection(userId: string): Promise<Connection | null>;
  completeAuthorization(userId: string, completionHash: string, bindingHash: string): Promise<{ result: CompleteResult; pageCount: number }>;
  readToken(connectionId: string): Promise<string | null>;
  finishPageSelection(s: PageSelection): Promise<boolean>;
  failConnection(connectionId: string, status: FailStatus, code: string): Promise<void>;
  cancelAttempt(connectionId: string): Promise<boolean>;
  // Expires a connecting/authorized attempt older than staleBefore or without a live OAuth state.
  expireStaleAttempt(connectionId: string, staleBefore: string): Promise<boolean>;
  disconnect(connectionId: string, revocation: "revoked" | "failed" | "skipped"): Promise<void>;
  env(name: string): string | undefined;
  fetch?: typeof fetch;
  now?: () => Date;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const fail = (code: string, status: number) => json({ code, error: code }, status);

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function appSecretProof(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function graphErrorCode(body: unknown): number {
  return Number((body as { error?: { code?: unknown } } | null)?.error?.code);
}

const isRateLimit = (c: number) => [4, 17, 32, 613].includes(c);
const isPermission = (c: number) => c === 10 || (c >= 200 && c <= 299);
const HEX64 = /^[a-f0-9]{64}$/;

export function createHandler(deps: ConnectionDeps) {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());

  async function graph(path: string, token: string, secret: string, method = "GET") {
    const sep = path.includes("?") ? "&" : "?";
    const res = await doFetch(`${GRAPH}${path}${sep}appsecret_proof=${await appSecretProof(token, secret)}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => null);
    const ok = res.ok && !!body && !(body as { error?: unknown }).error;
    return { ok, body: body as Record<string, unknown> | null, code: ok ? 0 : graphErrorCode(body) };
  }

  async function selectPage(conn: Connection, pageId: string): Promise<Response> {
    const secret = deps.env("META_APP_SECRET");
    if (!secret || !deps.env("META_APP_ID")) return fail("META_APP_NOT_CONFIGURED", 503);
    if (conn.status !== "page_selection_required") return fail("PAGE_SELECTION_NOT_PENDING", 409);
    const page = conn.availablePages.find((p) => p.id === pageId);
    if (!page) return fail("PAGE_NOT_AUTHORIZED", 403);

    const token = await deps.readToken(conn.id);
    if (!token) {
      await deps.failConnection(conn.id, "reauth_required", "REAUTH_REQUIRED");
      return fail("REAUTH_REQUIRED", 401);
    }

    let instagramStatus: InstagramStatus = "not_associated";
    let instagramId: string | null = null;
    let instagramUsername: string | null = null;

    const pageRes = await graph(`/${pageId}?fields=instagram_business_account`, token, secret);
    if (!pageRes.ok) {
      if (pageRes.code === 190) {
        await deps.failConnection(conn.id, "reauth_required", "REAUTH_REQUIRED");
        return fail("REAUTH_REQUIRED", 401);
      }
      if (isRateLimit(pageRes.code)) return fail("META_API_RATE_LIMIT", 429);
      instagramStatus = isPermission(pageRes.code) ? "permission_unavailable" : "api_error";
    } else {
      const ig = pageRes.body?.instagram_business_account as { id?: unknown } | undefined;
      if (ig && typeof ig.id === "string" && /^\d+$/.test(ig.id)) {
        instagramId = ig.id;
        const igRes = await graph(`/${ig.id}?fields=id,username`, token, secret);
        if (igRes.ok && typeof igRes.body?.username === "string") {
          instagramStatus = "connected";
          instagramUsername = igRes.body.username.slice(0, 100);
        } else if (isRateLimit(igRes.code)) {
          return fail("META_API_RATE_LIMIT", 429);
        } else {
          instagramStatus = isPermission(igRes.code) ? "permission_unavailable" : igRes.code === 100 ? "unsupported" : "api_error";
          instagramId = null;
        }
      }
    }

    const done = await deps.finishPageSelection({
      connectionId: conn.id, pageId, pageName: page.name, instagramStatus, instagramId, instagramUsername,
    });
    if (!done) return fail("PAGE_SELECTION_NOT_PENDING", 409);
    return json({ ok: true, status: "connected", instagramStatus });
  }

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

    try {
      const authHeader = req.headers.get("Authorization");
      const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
      const userId = jwt ? await deps.getUserId(jwt) : null;
      if (!userId) return fail("NOT_AUTHENTICATED", 401);

      let body: Record<string, unknown> = {};
      try {
        const parsed = await req.json();
        if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
      } catch {
        return fail("INVALID_REQUEST", 400);
      }

      switch (body.action) {
        case "complete": {
          const { completion, binding } = body;
          if (typeof completion !== "string" || !HEX64.test(completion) || typeof binding !== "string" || !HEX64.test(binding)) {
            return fail("OAUTH_STATE_INVALID", 400);
          }
          const { result, pageCount } = await deps.completeAuthorization(userId, await sha256Hex(completion), await sha256Hex(binding));
          if (result === "expired") return fail("OAUTH_STATE_EXPIRED", 400);
          if (result === "wrong_user" || result === "binding_mismatch") return fail("OAUTH_STATE_INVALID", 403);
          if (result !== "ok") return fail("OAUTH_STATE_INVALID", 400);

          const conn = await deps.getOwnConnection(userId);
          // Exactly one Page means the user's own Meta consent already limited the choice to it.
          if (conn && pageCount === 1 && conn.availablePages.length === 1) {
            return selectPage(conn, conn.availablePages[0].id);
          }
          return json({ ok: true, status: "page_selection_required", pageCount });
        }

        case "select_page": {
          if (typeof body.pageId !== "string" || !/^\d{1,40}$/.test(body.pageId)) return fail("INVALID_REQUEST", 400);
          const conn = await deps.getOwnConnection(userId);
          if (!conn) return fail("PAGE_SELECTION_NOT_PENDING", 409);
          return selectPage(conn, body.pageId);
        }

        case "disconnect": {
          const conn = await deps.getOwnConnection(userId);
          if (!conn) return json({ ok: true, status: "disconnected", revocation: "skipped" });
          let revocation: "revoked" | "failed" | "skipped" = "skipped";
          const secret = deps.env("META_APP_SECRET");
          const token = secret ? await deps.readToken(conn.id).catch(() => null) : null;
          if (token && secret) {
            try {
              revocation = (await graph("/me/permissions", token, secret, "DELETE")).ok ? "revoked" : "failed";
            } catch {
              revocation = "failed";
            }
          }
          if (revocation === "failed") console.error("[meta-connection] revocation failed");
          await deps.disconnect(conn.id, revocation);
          return json({ ok: true, status: "disconnected", revocation });
        }

        case "cancel": {
          const conn = await deps.getOwnConnection(userId);
          if (!conn) return json({ ok: true, status: "disconnected", cancelled: false });
          if (conn.status !== "connecting" && conn.status !== "authorized") {
            return json({ ok: true, status: conn.status, cancelled: false });
          }
          const cancelled = await deps.cancelAttempt(conn.id);
          const after = cancelled ? null : await deps.getOwnConnection(userId);
          return json({ ok: true, status: cancelled ? "disconnected" : after?.status ?? "disconnected", cancelled });
        }

        case "recover": {
          const conn = await deps.getOwnConnection(userId);
          if (!conn) return json({ ok: true, status: "disconnected" });
          const t = now().getTime();
          if (conn.status === "connecting" || conn.status === "authorized") {
            const expired = await deps.expireStaleAttempt(conn.id, new Date(t - STALE_ATTEMPT_MS).toISOString());
            return json({ ok: true, status: expired ? "error" : conn.status });
          }
          const expires = conn.tokenExpiresAt ? Date.parse(conn.tokenExpiresAt) : NaN;
          if ((conn.status === "connected" || conn.status === "page_selection_required") && Number.isFinite(expires) && expires <= t) {
            await deps.failConnection(conn.id, "reauth_required", "REAUTH_REQUIRED");
            return json({ ok: true, status: "reauth_required" });
          }
          return json({ ok: true, status: conn.status });
        }

        default:
          return fail("INVALID_REQUEST", 400);
      }
    } catch {
      console.error("[meta-connection] unhandled error");
      return fail("UNKNOWN_ERROR", 500);
    }
  };
}
