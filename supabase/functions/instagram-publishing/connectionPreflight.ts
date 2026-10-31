import { appSecretProof, corsHeaders, GRAPH, log, redact, timed } from "./shared.ts";

export const PREFLIGHT_ACTION = "instagram_connection_preflight";
export const PREFLIGHT_TIMEOUT_MS = 8_000;
export const PREFLIGHT_PERMISSIONS = ["pages_show_list", "pages_read_engagement", "instagram_basic", "instagram_content_publish"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NUMERIC_ID = /^[0-9]{1,32}$/;
const USERNAME = /^[A-Za-z0-9._]{1,30}$/;
const ALLOWED_KEYS = new Set(["action", "publicationId"]);

export type CheckStatus = "pass" | "fail" | "inconclusive" | "skipped";
export type Overall = "PASS" | "FAIL" | "INCONCLUSIVE";

export interface PreflightConnection {
  id: string;
  pageId: string;
  igUserId: string;
  igUsername: string | null;
}

export type ConnectionLookup =
  | { kind: "ok"; connection: PreflightConnection }
  | { kind: "not_found" }
  | { kind: "not_connected" };

export interface ConnectionPreflightDeps {
  getUserId(jwt: string): Promise<string | null>;
  internalTestActive(userId: string): Promise<boolean>;
  connection(userId: string, publicationId: string): Promise<ConnectionLookup>;
  readToken(connectionId: string): Promise<string | null>;
  env(name: string): string | undefined;
  fetch?: typeof fetch;
  now?: () => number;
}

type GraphRead =
  | { kind: "ok"; body: Record<string, unknown> }
  | { kind: "error"; http: number; code: number | null }
  | { kind: "timeout" };

interface Check { status: CheckStatus; reason: string | null }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const reject = (code: string, status: number) => json({ ok: false, action: PREFLIGHT_ACTION, code }, status);

export async function isConnectionPreflightRequest(req: Request): Promise<boolean> {
  if (req.method !== "POST") return false;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  return body?.action === PREFLIGHT_ACTION;
}

const isoFromEpoch = (s: unknown) => typeof s === "number" && s > 0 ? new Date(s * 1000).toISOString() : null;

// GET only. The token travels in the Authorization header; URLs and bodies are never logged or returned.
async function graphGet(deps: ConnectionPreflightDeps, stage: string, path: string, token: string, appSecret: string, query: Record<string, string>): Promise<GraphRead> {
  let res: Response;
  try {
    const url = new URL(`${GRAPH}/${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    url.searchParams.set("appsecret_proof", await appSecretProof(token, appSecret));
    res = await timed(deps.fetch ?? fetch, url.toString(), { method: "GET", headers: { Authorization: `Bearer ${token}` } }, PREFLIGHT_TIMEOUT_MS);
  } catch {
    log({ stage, result: "timeout" });
    return { kind: "timeout" };
  }
  const body = await res.json().catch(() => null) as Record<string, unknown> | null;
  if (res.ok && body && typeof body === "object") return { kind: "ok", body };
  const e = (body?.error ?? null) as Record<string, unknown> | null;
  const code = typeof e?.code === "number" ? e.code : null;
  log({ stage, http: res.status, ...(code !== null ? { code } : {}) });
  return { kind: "error", http: res.status, code };
}

const isTokenError = (r: GraphRead) => r.kind === "error" && (r.code === 190 || r.code === 102);
const isPermissionError = (r: GraphRead) => r.kind === "error" && (r.code === 10 || (r.code !== null && r.code >= 200 && r.code <= 299));
const unreachable = (r: GraphRead) => r.kind === "timeout" ? "META_TIMEOUT" : "META_UNAVAILABLE";

export function createConnectionPreflightHandler(deps: ConnectionPreflightDeps) {
  const now = deps.now ?? Date.now;

  async function run(userId: string, publicationId: string): Promise<Response> {
    if (!(await deps.internalTestActive(userId))) return reject("INTERNAL_TEST_REQUIRED", 403);
    const lookup = await deps.connection(userId, publicationId);
    if (lookup.kind === "not_found") return reject("PUBLICATION_NOT_FOUND", 404);
    if (lookup.kind === "not_connected") return reject("CHANNEL_NOT_CONNECTED", 409);
    const conn = lookup.connection;
    if (!NUMERIC_ID.test(conn.pageId) || !NUMERIC_ID.test(conn.igUserId)) return reject("CHANNEL_NOT_CONNECTED", 409);

    const appId = deps.env("META_APP_ID");
    const appSecret = deps.env("META_APP_SECRET");
    if (!appId || !NUMERIC_ID.test(appId) || !appSecret) return reject("INTERNAL_ERROR", 500);

    const reasons: string[] = [];
    const checks: Record<string, Check> = {
      token: { status: "skipped", reason: null },
      permissions: { status: "skipped", reason: null },
      page: { status: "skipped", reason: null },
      instagram_account: { status: "skipped", reason: null },
      professional_eligibility: { status: "skipped", reason: null },
      publishing_limit: { status: "skipped", reason: null },
    };
    const set = (name: string, status: CheckStatus, reason: string | null = null) => {
      checks[name] = { status, reason };
      if (reason && !reasons.includes(reason)) reasons.push(reason);
    };
    const report = {
      token_valid: "unknown" as boolean | "unknown",
      token_expiry: { status: "unknown" as "never" | "valid_until" | "expired" | "unknown", expires_at: null as string | null, data_access_expires_at: null as string | null },
      permissions: Object.fromEntries(PREFLIGHT_PERMISSIONS.map((p) => [p, null])) as Record<string, boolean | null>,
      missing_permissions: [] as string[],
      page_id: null as string | null,
      instagram_account_id: null as string | null,
      instagram_username: null as string | null,
      professional: { eligibility: "skipped" as CheckStatus, subtype: "not_exposed" as const, basis: null as string | null },
      publishing_limit: { status: "skipped" as CheckStatus, quota_usage: null as number | null, quota_total: null as number | null, quota_duration_seconds: null as number | null },
    };

    const userToken = await deps.readToken(conn.id);
    if (!userToken) {
      set("token", "fail", "TOKEN_UNAVAILABLE");
      return finish();
    }

    const appToken = `${appId}|${appSecret}`;
    const [debug, perms, page] = await Promise.all([
      graphGet(deps, "pf_debug_token", "debug_token", appToken, appSecret, { input_token: userToken }),
      graphGet(deps, "pf_permissions", "me/permissions", userToken, appSecret, {}),
      graphGet(deps, "pf_page", conn.pageId, userToken, appSecret, { fields: "id,access_token,instagram_business_account" }),
    ]);

    // Token validity and expiry
    const data = debug.kind === "ok" ? (debug.body.data ?? null) as Record<string, unknown> | null : null;
    if (data && typeof data === "object" && typeof data.is_valid === "boolean") {
      if (String(data.app_id ?? "") !== appId) {
        report.token_valid = false;
        set("token", "fail", "TOKEN_APP_MISMATCH");
      } else if (!data.is_valid) {
        report.token_valid = false;
        set("token", "fail", "TOKEN_INVALID");
      } else {
        report.token_valid = true;
        const exp = data.expires_at;
        if (exp === 0) report.token_expiry.status = "never";
        else if (typeof exp === "number" && exp * 1000 > now()) report.token_expiry.status = "valid_until";
        else if (typeof exp === "number") report.token_expiry.status = "expired";
        report.token_expiry.expires_at = isoFromEpoch(exp);
        report.token_expiry.data_access_expires_at = isoFromEpoch(data.data_access_expires_at);
        if (report.token_expiry.status === "expired") {
          report.token_valid = false;
          set("token", "fail", "TOKEN_EXPIRED");
        } else if (report.token_expiry.status === "unknown") {
          set("token", "inconclusive", "TOKEN_EXPIRY_UNKNOWN");
        } else {
          set("token", "pass");
        }
      }
    } else if (isTokenError(perms) || isTokenError(page)) {
      report.token_valid = false;
      set("token", "fail", "TOKEN_INVALID");
    } else {
      set("token", "inconclusive", debug.kind === "timeout" ? "META_TIMEOUT" : "TOKEN_DEBUG_UNAVAILABLE");
    }

    // Permissions
    const permList = perms.kind === "ok" && Array.isArray(perms.body.data) ? perms.body.data as Record<string, unknown>[] : null;
    if (permList) {
      const granted = new Set(permList.filter((p) => p?.status === "granted" && typeof p.permission === "string").map((p) => p.permission as string));
      for (const p of PREFLIGHT_PERMISSIONS) report.permissions[p] = granted.has(p);
      report.missing_permissions = PREFLIGHT_PERMISSIONS.filter((p) => !granted.has(p));
      if (report.missing_permissions.length) set("permissions", "fail", "PERMISSIONS_MISSING");
      else set("permissions", "pass");
    } else if (isTokenError(perms)) {
      set("permissions", "fail", "TOKEN_INVALID");
    } else {
      set("permissions", "inconclusive", perms.kind === "ok" ? "PERMISSIONS_UNREADABLE" : unreachable(perms));
    }

    // Page identity, access and Instagram link
    let pageToken: string | null = null;
    let linkedIg: string | null = null;
    if (page.kind === "ok") {
      const b = page.body;
      const link = (b.instagram_business_account ?? null) as { id?: unknown } | null;
      linkedIg = typeof link?.id === "string" ? link.id : null;
      if (b.id !== conn.pageId) set("page", "fail", "PAGE_MISMATCH");
      else if (typeof b.access_token !== "string" || !b.access_token) set("page", "fail", "PAGE_ACCESS_MISSING");
      else if (!linkedIg) { report.page_id = conn.pageId; set("page", "fail", "INSTAGRAM_NOT_LINKED"); }
      else if (linkedIg !== conn.igUserId) { report.page_id = conn.pageId; set("page", "fail", "INSTAGRAM_ACCOUNT_MISMATCH"); }
      else { report.page_id = conn.pageId; pageToken = b.access_token; set("page", "pass"); }
    } else if (isTokenError(page)) {
      set("page", "fail", "TOKEN_INVALID");
    } else if (isPermissionError(page) || (page.kind === "error" && page.http >= 400 && page.http < 500)) {
      set("page", "fail", "PAGE_NOT_ACCESSIBLE");
    } else {
      set("page", "inconclusive", unreachable(page));
    }

    if (!pageToken) {
      if (checks.page.reason === "INSTAGRAM_NOT_LINKED") {
        report.professional.eligibility = "fail";
        report.professional.basis = "page_reports_no_linked_professional_account";
        set("professional_eligibility", "fail", "INSTAGRAM_NOT_LINKED");
      }
      return finish();
    }

    // Instagram identity and publishing limit, read with the in-memory Page token
    const [ig, limit] = await Promise.all([
      graphGet(deps, "pf_ig_account", conn.igUserId, pageToken, appSecret, { fields: "id,username" }),
      graphGet(deps, "pf_publishing_limit", `${conn.igUserId}/content_publishing_limit`, pageToken, appSecret, { fields: "config,quota_usage" }),
    ]);

    if (ig.kind === "ok") {
      const username = typeof ig.body.username === "string" && USERNAME.test(ig.body.username) ? ig.body.username : null;
      if (ig.body.id !== conn.igUserId) set("instagram_account", "fail", "INSTAGRAM_ACCOUNT_MISMATCH");
      else if (!username) set("instagram_account", "inconclusive", "INSTAGRAM_USERNAME_UNREADABLE");
      else {
        report.instagram_account_id = conn.igUserId;
        report.instagram_username = username;
        if (conn.igUsername && conn.igUsername.toLowerCase() !== username.toLowerCase()) set("instagram_account", "fail", "INSTAGRAM_USERNAME_CHANGED");
        else set("instagram_account", "pass");
      }
    } else if (isTokenError(ig)) {
      set("instagram_account", "fail", "TOKEN_INVALID");
    } else if (ig.kind === "error" && ig.http >= 400 && ig.http < 500) {
      set("instagram_account", "fail", "INSTAGRAM_NOT_ACCESSIBLE");
    } else {
      set("instagram_account", "inconclusive", unreachable(ig));
    }

    const row = limit.kind === "ok" && Array.isArray(limit.body.data) ? (limit.body.data[0] ?? null) as Record<string, unknown> | null : null;
    const config = (row?.config ?? null) as Record<string, unknown> | null;
    const usage = typeof row?.quota_usage === "number" ? row.quota_usage : null;
    const total = typeof config?.quota_total === "number" ? config.quota_total : null;
    let limitReadable = false;
    if (usage !== null && total !== null) {
      limitReadable = true;
      report.publishing_limit.quota_usage = usage;
      report.publishing_limit.quota_total = total;
      report.publishing_limit.quota_duration_seconds = typeof config?.quota_duration === "number" ? config.quota_duration : null;
      if (usage >= total) set("publishing_limit", "fail", "PUBLISHING_LIMIT_REACHED");
      else set("publishing_limit", "pass");
    } else if (isPermissionError(limit)) {
      set("publishing_limit", "fail", "PUBLISHING_LIMIT_DENIED");
    } else {
      set("publishing_limit", "inconclusive", limit.kind === "ok" ? "PUBLISHING_LIMIT_UNREADABLE" : unreachable(limit));
    }
    report.publishing_limit.status = checks.publishing_limit.status;

    // Meta does not expose Business vs Creator here; eligibility is inferred from two independent signals.
    if (checks.instagram_account.status === "pass" && limitReadable) {
      report.professional.eligibility = "pass";
      report.professional.basis = "linked_professional_account_and_publishing_limit_readable";
      set("professional_eligibility", "pass");
    } else if (checks.publishing_limit.reason === "PUBLISHING_LIMIT_DENIED") {
      report.professional.eligibility = "fail";
      report.professional.basis = "publishing_limit_denied";
      set("professional_eligibility", "fail", "PUBLISHING_NOT_ELIGIBLE");
    } else {
      report.professional.eligibility = "inconclusive";
      report.professional.basis = "insufficient_signals";
      set("professional_eligibility", "inconclusive", "ELIGIBILITY_INCONCLUSIVE");
    }
    return finish();

    function finish(): Response {
      const statuses = Object.values(checks).map((c) => c.status);
      const overall: Overall = statuses.includes("fail") ? "FAIL"
        : statuses.every((s) => s === "pass") ? "PASS" : "INCONCLUSIVE";
      if (!reasons.includes("SUBTYPE_NOT_EXPOSED")) reasons.push("SUBTYPE_NOT_EXPOSED");
      report.professional.eligibility = checks.professional_eligibility.status;
      return json({
        ok: true,
        action: PREFLIGHT_ACTION,
        overall,
        checked_at: new Date(now()).toISOString(),
        ...report,
        checks,
        reasons,
        persisted: false,
        publishing_enabled: false,
      });
    }
  }

  return async function handle(req: Request): Promise<Response> {
    try {
      const authHeader = req.headers.get("Authorization");
      const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
      const userId = jwt ? await deps.getUserId(jwt) : null;
      if (!userId) return reject("AUTH_REQUIRED", 401);
      const body = await req.json().catch(() => null) as Record<string, unknown> | null;
      if (!body || Object.keys(body).some((k) => !ALLOWED_KEYS.has(k)) || body.action !== PREFLIGHT_ACTION) return reject("INVALID_REQUEST", 400);
      if (typeof body.publicationId !== "string" || !UUID.test(body.publicationId)) return reject("INVALID_REQUEST", 400);
      return await run(userId, body.publicationId);
    } catch (err) {
      log({ stage: "connection_preflight", error: redact(err instanceof Error ? err.message : "unknown") });
      return reject("INTERNAL_ERROR", 500);
    }
  };
}
