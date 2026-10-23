export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export const META_GRAPH_VERSION = "v25.0";
export const COMPLETION_TTL_MS = 10 * 60 * 1000;
const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export type ConsumeResult = "unknown" | "consumed" | "stale" | "expired" | "ok";
export type FailStatus = "disconnected" | "error" | "reauth_required";

export interface Page {
  id: string;
  name: string;
}

export interface Authorization {
  connectionId: string;
  stateHash: string;
  accessToken: string;
  expiresAt: string | null;
  metaUserId: string;
  permissions: string[];
  pages: Page[];
  completionHash: string;
  completionExpiresAt: string;
}

export interface CallbackDeps {
  consumeState(stateHash: string): Promise<{ result: ConsumeResult; connectionId: string | null }>;
  failConnection(connectionId: string, status: FailStatus, code: string): Promise<void>;
  storeAuthorization(a: Authorization): Promise<boolean>;
  env(name: string): string | undefined;
  fetch?: typeof fetch;
  randomToken?: () => string;
  now?: () => Date;
}

class MetaError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
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

export async function appSecretProof(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Graph error codes: 4/17/32/613 throttling, 190 invalid token, 10 and 200-299 missing permission.
export function classifyGraphError(body: unknown, fallback: string): string {
  const code = Number((body as { error?: { code?: unknown } } | null)?.error?.code);
  if ([4, 17, 32, 613].includes(code)) return "META_API_RATE_LIMIT";
  if (code === 190) return "REAUTH_REQUIRED";
  if (code === 10 || (code >= 200 && code <= 299)) return "META_PERMISSION_UNAVAILABLE";
  return fallback;
}

export const PAGE_PERMISSIONS = ["pages_show_list", "pages_read_engagement", "business_management"];

// Only codes, counts and permission names are logged: never tokens, codes, secrets or appsecret_proof.
export function graphErrorDetail(body: unknown): Record<string, string | number> {
  const e = (body as { error?: Record<string, unknown> } | null)?.error;
  if (!e || typeof e !== "object") return {};
  const out: Record<string, string | number> = {};
  for (const [key, field] of [["code", "code"], ["subcode", "error_subcode"], ["type", "type"], ["fbtrace_id", "fbtrace_id"]] as const) {
    const v = e[field];
    if (typeof v === "number") out[key] = v;
    else if (typeof v === "string") out[key] = v.slice(0, 64);
  }
  return out;
}

function logStage(stage: string, detail: Record<string, unknown> = {}) {
  console.log("[meta-oauth-callback]", JSON.stringify({ stage, ...detail }));
}

const PERMISSION_NAME = /^[a-z_]{1,64}$/;

const STATE_PATTERN = /^[a-f0-9]{64}$/;

export function createHandler(deps: CallbackDeps) {
  const doFetch = deps.fetch ?? fetch;
  const token = deps.randomToken ?? randomToken;
  const now = deps.now ?? (() => new Date());

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

    const site = (deps.env("SITE_URL") || "https://localseohub.io").replace(/\/+$/, "");
    const target = `${site}/oauth/meta/callback`;
    const redirect = (location: string) =>
      new Response(null, { status: 302, headers: { ...corsHeaders, Location: location, "Cache-Control": "no-store" } });
    const fail = (code: string) => redirect(`${target}?error=${encodeURIComponent(code)}`);

    let connectionId: string | null = null;
    const terminate = async (status: FailStatus, code: string) => {
      console.error("[meta-oauth-callback] terminated:", code);
      if (connectionId) {
        try {
          await deps.failConnection(connectionId, status, code);
        } catch {
          console.error("[meta-oauth-callback] fail write failed");
        }
      }
      return fail(code);
    };

    try {
      if (req.method !== "GET") return fail("OAUTH_STATE_INVALID");
      const url = new URL(req.url);
      const state = url.searchParams.get("state") ?? "";
      if (!STATE_PATTERN.test(state)) return terminate("error", "OAUTH_STATE_INVALID");

      const stateHash = await sha256Hex(state);
      const consumed = await deps.consumeState(stateHash);
      if (consumed.result === "expired") {
        connectionId = consumed.connectionId;
        return terminate("error", "OAUTH_STATE_EXPIRED");
      }
      if (consumed.result !== "ok" || !consumed.connectionId) return terminate("error", "OAUTH_STATE_INVALID");
      connectionId = consumed.connectionId;

      const appId = deps.env("META_APP_ID");
      const appSecret = deps.env("META_APP_SECRET");
      const redirectUri = deps.env("META_REDIRECT_URI");
      if (!appId || !appSecret || !redirectUri) return terminate("error", "META_APP_NOT_CONFIGURED");

      if (url.searchParams.get("error")) {
        const denied = url.searchParams.get("error") === "access_denied";
        return terminate(denied ? "disconnected" : "error", denied ? "OAUTH_DENIED" : "UNKNOWN_ERROR");
      }
      const code = url.searchParams.get("code");
      if (!code) return terminate("error", "TOKEN_EXCHANGE_FAILED");

      const graphGet = async (stage: string, path: string, accessToken: string, fallback: string) => {
        const sep = path.includes("?") ? "&" : "?";
        const proof = await appSecretProof(accessToken, appSecret);
        const res = await doFetch(`${GRAPH}${path}${sep}appsecret_proof=${proof}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body || (body as { error?: unknown }).error) {
          const code = classifyGraphError(body, fallback);
          logStage(stage, { ok: false, http: res.status, result: code, ...graphErrorDetail(body) });
          throw new MetaError(code);
        }
        return body as Record<string, unknown>;
      };

      const shortRes = await doFetch(`${GRAPH}/oauth/access_token?${new URLSearchParams({
        client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code,
      })}`);
      const shortBody = await shortRes.json().catch(() => null) as { access_token?: unknown } | null;
      if (!shortRes.ok || typeof shortBody?.access_token !== "string") {
        logStage("token_exchange_short", { ok: false, http: shortRes.status, ...graphErrorDetail(shortBody) });
        throw new MetaError("TOKEN_EXCHANGE_FAILED");
      }

      const longRes = await doFetch(`${GRAPH}/oauth/access_token?${new URLSearchParams({
        grant_type: "fb_exchange_token", client_id: appId, client_secret: appSecret, fb_exchange_token: shortBody.access_token,
      })}`);
      const longBody = await longRes.json().catch(() => null) as { access_token?: unknown; expires_in?: unknown } | null;
      if (!longRes.ok || typeof longBody?.access_token !== "string") {
        logStage("token_exchange_long", { ok: false, http: longRes.status, ...graphErrorDetail(longBody) });
        throw new MetaError("TOKEN_EXCHANGE_FAILED");
      }
      const accessToken = longBody.access_token;
      const expiresIn = Number(longBody.expires_in);
      const expiresAt = Number.isFinite(expiresIn) && expiresIn > 0
        ? new Date(now().getTime() + expiresIn * 1000).toISOString()
        : null;
      logStage("token_exchange", { ok: true, long_lived: true, expires_in_s: Number.isFinite(expiresIn) ? expiresIn : null });

      const me = await graphGet("me", "/me?fields=id", accessToken, "PAGE_DISCOVERY_FAILED");
      if (typeof me.id !== "string") throw new MetaError("PAGE_DISCOVERY_FAILED");

      const perms = await graphGet("permissions", "/me/permissions", accessToken, "PAGE_DISCOVERY_FAILED");
      const permRows = Array.isArray(perms.data) ? (perms.data as { permission?: unknown; status?: unknown }[]) : [];
      const withStatus = (status: string) => permRows
        .filter((p) => p.status === status && typeof p.permission === "string" && PERMISSION_NAME.test(p.permission))
        .map((p) => p.permission as string);
      const permissions = withStatus("granted");
      logStage("permissions", { granted: permissions, declined: withStatus("declined"), expired: withStatus("expired") });
      if (!permissions.includes("pages_show_list")) throw new MetaError("META_PERMISSION_UNAVAILABLE");

      const accounts = await graphGet("page_discovery", "/me/accounts?fields=id,name&limit=100", accessToken, "PAGE_DISCOVERY_FAILED");
      if (!Array.isArray(accounts.data)) {
        logStage("page_discovery", { ok: false, endpoint: "/me/accounts", result: "MALFORMED_RESPONSE" });
        throw new MetaError("PAGE_DISCOVERY_FAILED");
      }
      const pages: Page[] = (accounts.data as { id?: unknown; name?: unknown }[])
        .filter((p) => typeof p.id === "string" && /^\d+$/.test(p.id))
        .map((p) => ({ id: p.id as string, name: typeof p.name === "string" ? p.name.slice(0, 200) : "" }));
      const hasNext = Boolean((accounts.paging as { next?: unknown } | undefined)?.next);
      logStage("page_discovery", { ok: true, endpoint: "/me/accounts", returned: accounts.data.length, pages: pages.length, has_next: hasNext });
      if (pages.length === 0) {
        // Business-portfolio Pages are hidden from /me/accounts unless every page permission was granted.
        const missing = PAGE_PERMISSIONS.filter((p) => !permissions.includes(p));
        logStage("page_discovery_empty", { missing_permissions: missing });
        throw new MetaError(missing.length > 0 ? "META_PERMISSION_UNAVAILABLE" : "NO_AUTHORIZED_PAGES");
      }

      const completion = token();
      const stored = await deps.storeAuthorization({
        connectionId,
        stateHash,
        accessToken,
        expiresAt,
        metaUserId: me.id,
        permissions,
        pages,
        completionHash: await sha256Hex(completion),
        completionExpiresAt: new Date(now().getTime() + COMPLETION_TTL_MS).toISOString(),
      });
      if (!stored) return terminate("error", "OAUTH_STATE_INVALID");

      return redirect(`${target}#token=${completion}`);
    } catch (err) {
      return terminate("error", err instanceof MetaError ? err.code : "UNKNOWN_ERROR");
    }
  };
}
