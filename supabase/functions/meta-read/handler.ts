export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export const META_GRAPH_VERSION = "v25.0";
const GRAPH_HOST = "graph.facebook.com";
const GRAPH = `https://${GRAPH_HOST}/${META_GRAPH_VERSION}`;

export const SYNC_COOLDOWN_SECONDS = 60;
export const FETCH_TIMEOUT_MS = 10_000;
export const PAGE_LIMIT = 25;
export const MAX_PAGES = 4;
export const MAX_ITEMS = 100;

const META_ID = /^\d{1,40}$/;
const FB_POST_ID = /^\d{1,40}(_\d{1,40})?$/;

const FB_POST_FIELDS = "id,message,created_time,permalink_url,status_type";
const FB_ENGAGEMENT_FIELDS = "reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)";
const IG_MEDIA_FIELDS = "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count";

export type Platform = "facebook" | "instagram";
export type SyncStatus =
  | "ok" | "empty" | "not_linked" | "permission_unavailable" | "reauth_required" | "rate_limited" | "malformed" | "api_error";
type ErrorStatus = Exclude<SyncStatus, "ok" | "empty" | "not_linked">;

export interface ContentItem {
  external_id: string;
  content_type: string;
  text_content: string | null;
  published_at: string | null;
  permalink: string | null;
  reaction_count: number | null;
  comment_count: number | null;
}

export interface ClaimResult {
  result: "not_connected" | "cooldown" | "ok";
  pageId: string | null;
  instagramStatus: string | null;
  instagramAccountId: string | null;
  tokenExpiresAt: string | null;
}

export interface ApplyParams {
  connectionId: string;
  userId: string;
  platform: Platform;
  accountId: string | null;
  status: SyncStatus;
  errorCode: string | null;
  profile: Record<string, unknown>;
  items: ContentItem[];
  pagesFetched: number;
}

export interface ReadDeps {
  getUserId(jwt: string): Promise<string | null>;
  getOwnConnectionId(userId: string): Promise<string | null>;
  claim(connectionId: string, userId: string, cooldownSeconds: number): Promise<ClaimResult>;
  readToken(connectionId: string): Promise<string | null>;
  apply(p: ApplyParams): Promise<boolean>;
  failConnection(connectionId: string, status: "reauth_required", code: string): Promise<void>;
  env(name: string): string | undefined;
  fetch?: typeof fetch;
  now?: () => Date;
  log?: (entry: Record<string, unknown>) => void;
}

type GraphFailure = { ok: false; status: ErrorStatus; errorCode: string; metaCode: number | null };
type GraphOk = { ok: true; body: Record<string, unknown> };
type GraphResult = GraphOk | GraphFailure;
type ListResult = { ok: true; rows: unknown[]; pages: number } | GraphFailure;

interface PlatformOutcome {
  status: SyncStatus;
  errorCode: string | null;
  profile: Record<string, unknown>;
  items: ContentItem[];
  pages: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const fail = (code: string, status: number) => json({ code, error: code }, status);

export async function appSecretProof(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function classifyMetaError(code: number): GraphFailure {
  if (code === 190 || code === 102) return { ok: false, status: "reauth_required", errorCode: "REAUTH_REQUIRED", metaCode: code };
  if ([4, 17, 32, 613].includes(code)) return { ok: false, status: "rate_limited", errorCode: "META_RATE_LIMITED", metaCode: code };
  if (code === 10 || (code >= 200 && code <= 299)) {
    return { ok: false, status: "permission_unavailable", errorCode: "META_PERMISSION_DENIED", metaCode: code };
  }
  if (code === 100) return { ok: false, status: "api_error", errorCode: "META_UNSUPPORTED", metaCode: code };
  return { ok: false, status: "api_error", errorCode: "META_API_ERROR", metaCode: Number.isFinite(code) ? code : null };
}

const malformed = (): GraphFailure => ({ ok: false, status: "malformed", errorCode: "META_MALFORMED_RESPONSE", metaCode: null });

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function countOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
}

function summaryCount(v: unknown): number | null {
  return isObject(v) && isObject(v.summary) ? countOrNull(v.summary.total_count) : null;
}

function textOrNull(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function httpsOrNull(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 1000) return null;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

export function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const FB_TYPES: Record<string, string> = {
  added_photos: "photo",
  added_video: "video",
  shared_story: "link",
  mobile_status_update: "status",
  created_event: "event",
};

export function normalizeFacebookPost(raw: unknown): ContentItem | null {
  if (!isObject(raw) || typeof raw.id !== "string" || !FB_POST_ID.test(raw.id)) return null;
  return {
    external_id: raw.id,
    content_type: (typeof raw.status_type === "string" && FB_TYPES[raw.status_type]) || "post",
    text_content: textOrNull(raw.message, 5000),
    published_at: isoOrNull(raw.created_time),
    permalink: httpsOrNull(raw.permalink_url),
    reaction_count: summaryCount(raw.reactions),
    comment_count: summaryCount(raw.comments),
  };
}

export function normalizeInstagramMedia(raw: unknown): ContentItem | null {
  if (!isObject(raw) || typeof raw.id !== "string" || !META_ID.test(raw.id)) return null;
  let type = "other";
  if (raw.media_type === "IMAGE") type = "image";
  else if (raw.media_type === "CAROUSEL_ALBUM") type = "carousel";
  else if (raw.media_type === "VIDEO") type = raw.media_product_type === "REELS" ? "reel" : "video";
  return {
    external_id: raw.id,
    content_type: type,
    text_content: textOrNull(raw.caption, 5000),
    published_at: isoOrNull(raw.timestamp),
    permalink: httpsOrNull(raw.permalink),
    reaction_count: countOrNull(raw.like_count),
    comment_count: countOrNull(raw.comments_count),
  };
}

export function createHandler(deps: ReadDeps) {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((entry) => console.log(JSON.stringify(entry)));

  async function request(url: URL, token: string, secret: string): Promise<GraphResult> {
    url.searchParams.delete("access_token");
    url.searchParams.set("appsecret_proof", await appSecretProof(token, secret));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await doFetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
      const body = await res.json().catch(() => undefined);
      if (isObject(body) && isObject(body.error)) return classifyMetaError(Number(body.error.code));
      if (!res.ok) return classifyMetaError(NaN);
      return isObject(body) ? { ok: true, body } : malformed();
    } catch {
      return { ok: false, status: "api_error", errorCode: ctrl.signal.aborted ? "META_TIMEOUT" : "META_API_ERROR", metaCode: null };
    } finally {
      clearTimeout(timer);
    }
  }

  function trace(platform: Platform, endpoint: string, started: number, r: { ok: true } | GraphFailure, extra: Record<string, unknown> = {}) {
    log({
      fn: "meta-read", platform, endpoint, ...extra,
      metaCode: r.ok ? null : r.metaCode,
      durationMs: Date.now() - started,
      result: r.ok ? "ok" : r.status,
    });
  }

  async function getObject(platform: Platform, endpoint: string, path: string, token: string, secret: string) {
    const started = Date.now();
    const r = await request(new URL(`${GRAPH}${path}`), token, secret);
    trace(platform, endpoint, started, r);
    return r;
  }

  function nextUrl(next: unknown, edgePath: string, seen: Set<string>): URL | null {
    if (typeof next !== "string") return null;
    let url: URL;
    try {
      url = new URL(next);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || url.hostname !== GRAPH_HOST) return null;
    if (url.pathname.replace(/^\/v\d+\.\d+/, "") !== edgePath) return null;
    url.searchParams.delete("access_token");
    url.searchParams.delete("appsecret_proof");
    const key = url.search;
    if (seen.has(key)) return null;
    seen.add(key);
    return url;
  }

  async function getList(platform: Platform, endpoint: string, edgePath: string, fields: string, token: string, secret: string): Promise<ListResult> {
    const started = Date.now();
    const rows: unknown[] = [];
    const seen = new Set<string>();
    let url: URL | null = new URL(`${GRAPH}${edgePath}?fields=${fields}&limit=${PAGE_LIMIT}`);
    let pages = 0;
    let outcome: ListResult | null = null;
    while (url && pages < MAX_PAGES && rows.length < MAX_ITEMS) {
      const r = await request(url, token, secret);
      if (!r.ok) {
        outcome = r;
        break;
      }
      if (!Array.isArray(r.body.data)) {
        outcome = malformed();
        break;
      }
      pages++;
      rows.push(...r.body.data);
      url = nextUrl(isObject(r.body.paging) ? r.body.paging.next : undefined, edgePath, seen);
    }
    const result: ListResult = outcome ?? { ok: true, rows: rows.slice(0, MAX_ITEMS), pages };
    trace(platform, endpoint, started, result, { pages, items: result.ok ? result.rows.length : 0 });
    return result;
  }

  function collect(rows: unknown[], normalize: (r: unknown) => ContentItem | null) {
    const byId = new Map<string, ContentItem>();
    let skipped = 0;
    for (const row of rows) {
      const item = normalize(row);
      if (item) byId.set(item.external_id, item);
      else skipped++;
    }
    return { items: [...byId.values()], skipped };
  }

  const failed = (r: GraphFailure, pages = 0): PlatformOutcome =>
    ({ status: r.status, errorCode: r.errorCode, profile: {}, items: [], pages });

  async function readFacebook(pageId: string, userToken: string, secret: string): Promise<PlatformOutcome> {
    const tokenRes = await getObject("facebook", "page_token", `/${pageId}?fields=access_token`, userToken, secret);
    if (!tokenRes.ok) return failed(tokenRes);
    const pageToken = tokenRes.body.access_token;
    if (typeof pageToken !== "string" || !pageToken) {
      return { status: "permission_unavailable", errorCode: "PAGE_TOKEN_UNAVAILABLE", profile: {}, items: [], pages: 0 };
    }

    const pageRes = await getObject("facebook", "page_profile",
      `/${pageId}?fields=id,name,about,category,link,website,fan_count,followers_count`, pageToken, secret);
    if (!pageRes.ok) return failed(pageRes);
    if (pageRes.body.id !== pageId) return { ...failed(malformed()), errorCode: "META_ACCOUNT_MISMATCH" };
    const b = pageRes.body;
    const profile = {
      name: textOrNull(b.name, 200),
      category: textOrNull(b.category, 200),
      about: textOrNull(b.about, 500),
      link: httpsOrNull(b.link),
      website: textOrNull(b.website, 300),
      fan_count: countOrNull(b.fan_count),
      followers_count: countOrNull(b.followers_count),
    };

    const edge = `/${pageId}/published_posts`;
    let list = await getList("facebook", "page_posts", edge, `${FB_POST_FIELDS},${FB_ENGAGEMENT_FIELDS}`, pageToken, secret);
    // Engagement summaries can be denied while the posts themselves are readable; counts then stay null.
    if (!list.ok && list.status === "permission_unavailable") {
      list = await getList("facebook", "page_posts_basic", edge, FB_POST_FIELDS, pageToken, secret);
    }
    if (!list.ok) return { ...failed(list), profile };
    const { items } = collect(list.rows, normalizeFacebookPost);
    if (list.rows.length > 0 && items.length === 0) return { ...failed(malformed(), list.pages), profile };
    return { status: items.length ? "ok" : "empty", errorCode: null, profile, items, pages: list.pages };
  }

  async function readInstagram(igId: string, userToken: string, secret: string): Promise<PlatformOutcome> {
    const profRes = await getObject("instagram", "ig_profile",
      `/${igId}?fields=id,username,name,biography,website,followers_count,follows_count,media_count`, userToken, secret);
    if (!profRes.ok) return failed(profRes);
    if (profRes.body.id !== igId) return { ...failed(malformed()), errorCode: "META_ACCOUNT_MISMATCH" };
    const b = profRes.body;
    const profile = {
      username: textOrNull(b.username, 100),
      name: textOrNull(b.name, 200),
      biography: textOrNull(b.biography, 500),
      website: textOrNull(b.website, 300),
      followers_count: countOrNull(b.followers_count),
      follows_count: countOrNull(b.follows_count),
      media_count: countOrNull(b.media_count),
    };

    const list = await getList("instagram", "ig_media", `/${igId}/media`, IG_MEDIA_FIELDS, userToken, secret);
    if (!list.ok) return { ...failed(list), profile };
    const { items } = collect(list.rows, normalizeInstagramMedia);
    if (list.rows.length > 0 && items.length === 0) return { ...failed(malformed(), list.pages), profile };
    return { status: items.length ? "ok" : "empty", errorCode: null, profile, items, pages: list.pages };
  }

  async function store(connectionId: string, userId: string, platform: Platform, accountId: string | null, o: PlatformOutcome) {
    const applied = await deps.apply({
      connectionId, userId, platform, accountId,
      status: o.status, errorCode: o.errorCode, profile: o.profile, items: o.items, pagesFetched: o.pages,
    });
    return applied
      ? { status: o.status, itemCount: o.status === "ok" || o.status === "empty" ? o.items.length : null, errorCode: o.errorCode }
      : { status: "conflict" as const, itemCount: null, errorCode: "CONNECTION_CHANGED" };
  }

  async function markReauth(connectionId: string, userId: string, claim: ClaimResult) {
    const base = { status: "reauth_required" as const, errorCode: "REAUTH_REQUIRED", profile: {}, items: [], pages: 0 };
    await deps.apply({ connectionId, userId, platform: "facebook", accountId: claim.pageId, ...base, pagesFetched: 0 });
    if (claim.instagramAccountId) {
      await deps.apply({ connectionId, userId, platform: "instagram", accountId: claim.instagramAccountId, ...base, pagesFetched: 0 });
    }
    await deps.failConnection(connectionId, "reauth_required", "REAUTH_REQUIRED");
    return fail("REAUTH_REQUIRED", 401);
  }

  async function sync(userId: string): Promise<Response> {
    const secret = deps.env("META_APP_SECRET");
    if (!secret || !deps.env("META_APP_ID")) return fail("META_APP_NOT_CONFIGURED", 503);

    const connectionId = await deps.getOwnConnectionId(userId);
    if (!connectionId) return fail("META_NOT_CONNECTED", 409);

    const claim = await deps.claim(connectionId, userId, SYNC_COOLDOWN_SECONDS);
    if (claim.result === "cooldown") return fail("SYNC_COOLDOWN", 429);
    if (claim.result !== "ok" || !claim.pageId || !META_ID.test(claim.pageId)) return fail("META_NOT_CONNECTED", 409);

    const expires = claim.tokenExpiresAt ? Date.parse(claim.tokenExpiresAt) : NaN;
    if (Number.isFinite(expires) && expires <= now().getTime()) return markReauth(connectionId, userId, claim);

    const token = await deps.readToken(connectionId);
    if (!token) return markReauth(connectionId, userId, claim);

    const fb = await readFacebook(claim.pageId, token, secret);
    if (fb.status === "reauth_required") return markReauth(connectionId, userId, claim);

    const igId = claim.instagramStatus === "connected" && claim.instagramAccountId && META_ID.test(claim.instagramAccountId)
      ? claim.instagramAccountId
      : null;
    const ig: PlatformOutcome = igId
      ? await readInstagram(igId, token, secret)
      : { status: "not_linked", errorCode: null, profile: {}, items: [], pages: 0 };
    if (ig.status === "reauth_required") return markReauth(connectionId, userId, claim);

    const facebook = await store(connectionId, userId, "facebook", claim.pageId, fb);
    const instagram = await store(connectionId, userId, "instagram", igId, ig);
    return json({ ok: true, facebook, instagram });
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
        if (isObject(parsed)) body = parsed;
      } catch {
        return fail("INVALID_REQUEST", 400);
      }

      if (body.action !== "sync") return fail("INVALID_REQUEST", 400);
      return await sync(userId);
    } catch {
      console.error("[meta-read] unhandled error");
      return fail("UNKNOWN_ERROR", 500);
    }
  };
}
