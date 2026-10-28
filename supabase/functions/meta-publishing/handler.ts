export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export const META_GRAPH_VERSION = "v25.0";
export const STATE_TTL_MS = 10 * 60 * 1000;

// Read-only scopes are re-requested so the new token never loses what the connection already uses.
export const PUBLISHING_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
  "instagram_basic",
  "pages_manage_posts",
  "instagram_content_publish",
];

export type Channel = "facebook" | "instagram";
export const CHANNELS: Channel[] = ["facebook", "instagram"];

export const REQUIRED_PERMISSIONS: Record<Channel, string[]> = {
  facebook: ["pages_show_list", "pages_read_engagement", "pages_manage_posts"],
  instagram: ["pages_show_list", "pages_read_engagement", "instagram_basic", "instagram_content_publish"],
};

export interface ErrorTraits {
  retryable: boolean;
  requires_user_action: boolean;
  verification_required: boolean;
}

export const PUBLISH_ERRORS = {
  AUTH_REQUIRED: { retryable: false, requires_user_action: true, verification_required: false },
  REAUTH_REQUIRED: { retryable: false, requires_user_action: true, verification_required: false },
  PERMISSION_REQUIRED: { retryable: false, requires_user_action: true, verification_required: false },
  CHANNEL_NOT_CONNECTED: { retryable: false, requires_user_action: true, verification_required: false },
  INVALID_PUBLICATION_STATE: { retryable: false, requires_user_action: true, verification_required: false },
  VERSION_CONFLICT: { retryable: false, requires_user_action: true, verification_required: false },
  IMAGE_UNAVAILABLE: { retryable: false, requires_user_action: true, verification_required: false },
  IMAGE_UNSUPPORTED: { retryable: false, requires_user_action: true, verification_required: false },
  META_RATE_LIMITED: { retryable: true, requires_user_action: false, verification_required: false },
  META_TEMPORARY_ERROR: { retryable: true, requires_user_action: false, verification_required: false },
  META_REJECTED: { retryable: false, requires_user_action: true, verification_required: false },
  PUBLISH_OUTCOME_UNKNOWN: { retryable: false, requires_user_action: false, verification_required: true },
  ALREADY_PUBLISHED: { retryable: false, requires_user_action: false, verification_required: false },
  PUBLISH_IN_PROGRESS: { retryable: false, requires_user_action: false, verification_required: false },
  INTERNAL_ERROR: { retryable: false, requires_user_action: false, verification_required: false },
} as const satisfies Record<string, ErrorTraits>;

export type PublishErrorCode = keyof typeof PUBLISH_ERRORS;

export function isPublishErrorCode(value: unknown): value is PublishErrorCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PUBLISH_ERRORS, value);
}

export function errorTraits(code: PublishErrorCode): ErrorTraits {
  return { ...PUBLISH_ERRORS[code] };
}

// Maps a Graph response (or a transport failure) to a taxonomy code. A transport failure or 5xx after
// the request may have reached Meta is UNKNOWN, never FAILED: the post could exist.
export function mapMetaError(input: { status?: number; body?: unknown; transport?: "timeout" | "network" | null; sent?: boolean }): PublishErrorCode {
  if (input.transport) return input.sent === false ? "META_TEMPORARY_ERROR" : "PUBLISH_OUTCOME_UNKNOWN";
  const e = (input.body as { error?: Record<string, unknown> } | null)?.error;
  const code = Number(e?.code);
  const subcode = Number(e?.error_subcode);
  if ([4, 17, 32, 613].includes(code) || subcode === 2207051) return "META_RATE_LIMITED";
  if (code === 190 || code === 102 || [458, 459, 460, 463, 464, 467].includes(subcode)) return "REAUTH_REQUIRED";
  if (code === 10 || (code >= 200 && code <= 299)) return "PERMISSION_REQUIRED";
  if (code === 368) return "META_REJECTED";
  if (code === 324 || subcode === 2207004 || subcode === 2207005 || subcode === 2207009) return "IMAGE_UNSUPPORTED";
  if (code === 1 || code === 2 || e?.is_transient === true) return "META_TEMPORARY_ERROR";
  const status = input.status ?? 0;
  if (status >= 500) return "PUBLISH_OUTCOME_UNKNOWN";
  if (status === 429) return "META_RATE_LIMITED";
  if (code === 100 || (status >= 400 && status < 500)) return "META_REJECTED";
  return "INTERNAL_ERROR";
}

const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bEA[A-Za-z0-9]{20,}\b/g, "[token]"],
  [/(access_token|appsecret_proof|client_secret|fb_exchange_token|code|token|signature|sig)=([^&\s"']+)/gi, "$1=[redacted]"],
  [/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]"],
  [/https?:\/\/[^\s"']*(?:token=|X-Amz-|Signature=|\/object\/sign\/)[^\s"']*/gi, "[signed-url]"],
  [/"?fbtrace_id"?\s*[:=]\s*"?[A-Za-z0-9_-]+"?/gi, "fbtrace_id=[redacted]"],
  [/\b[a-f0-9]{64}\b/gi, "[hex]"],
];

export function redact(value: string): string {
  let out = value;
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out.slice(0, 300);
}

// Only numeric codes and the normalized result are ever logged; raw bodies, messages and fbtrace_id never are.
export function safeErrorLog(body: unknown, result: PublishErrorCode): Record<string, string | number> {
  const e = (body as { error?: Record<string, unknown> } | null)?.error;
  const out: Record<string, string | number> = { result };
  if (typeof e?.code === "number") out.code = e.code;
  if (typeof e?.error_subcode === "number") out.subcode = e.error_subcode;
  return out;
}

export function instagramImageIssue(mime: string | null, width: number | null, height: number | null): "IMAGE_UNSUPPORTED" | null {
  if (mime !== "image/jpeg" || !width || !height || width <= 0 || height <= 0) return "IMAGE_UNSUPPORTED";
  const ratio = width / height;
  return ratio < 0.8 || ratio > 1.91 ? "IMAGE_UNSUPPORTED" : null;
}

const TASK_NAME = /^[A-Z_]{1,32}$/;

export function parsePageTasks(data: unknown): { id: string; tasks: string[] }[] {
  if (!Array.isArray(data)) return [];
  return (data as { id?: unknown; tasks?: unknown }[])
    .filter((p) => p && typeof p.id === "string" && /^\d+$/.test(p.id))
    .map((p) => ({
      id: p.id as string,
      tasks: Array.isArray(p.tasks)
        ? [...new Set((p.tasks as unknown[]).filter((t): t is string => typeof t === "string" && TASK_NAME.test(t)))].slice(0, 32)
        : [],
    }));
}

export interface CapabilityRow {
  channel: string;
  issue: string | null;
  missing_permissions: string[] | null;
}

export interface ChannelCapability {
  channel: Channel;
  ready: boolean;
  issue: PublishErrorCode | null;
  missing_permissions: string[];
}

export function deriveCapabilities(rows: CapabilityRow[]) {
  const channels = CHANNELS.map((channel): ChannelCapability => {
    const row = rows.find((r) => r.channel === channel);
    const issue: PublishErrorCode | null = !row ? "INTERNAL_ERROR" : row.issue === null ? null : isPublishErrorCode(row.issue) ? row.issue : "INTERNAL_ERROR";
    const allowed = REQUIRED_PERMISSIONS[channel];
    return {
      channel,
      ready: issue === null,
      issue,
      missing_permissions: (row?.missing_permissions ?? []).filter((p) => allowed.includes(p)),
    };
  });
  return {
    facebook_publish_ready: channels[0].ready,
    instagram_publish_ready: channels[1].ready,
    channels,
  };
}

export interface PreflightRow {
  channel: string;
  issue: string | null;
  draft_version: number | null;
  attempt_status: string | null;
  attempt_error_code: string | null;
  meta_object_id: string | null;
  permalink: string | null;
  attempt_updated_at: string | null;
  attempt_retryable: boolean | null;
  attempt_verification_required: boolean | null;
}

const ATTEMPT_STATES = { publishing: "PUBLISHING", succeeded: "SUCCEEDED", failed: "FAILED", unknown: "UNKNOWN" } as const;

export function toReadModel(rows: PreflightRow[]) {
  return CHANNELS.map((channel) => {
    const row = rows.find((r) => r.channel === channel);
    const issue: PublishErrorCode | null = !row ? "INTERNAL_ERROR" : row.issue === null ? null : isPublishErrorCode(row.issue) ? row.issue : "INTERNAL_ERROR";
    const status = row?.attempt_status && row.attempt_status in ATTEMPT_STATES
      ? ATTEMPT_STATES[row.attempt_status as keyof typeof ATTEMPT_STATES]
      : "NOT_REQUESTED";
    const errorCode = isPublishErrorCode(row?.attempt_error_code) ? row!.attempt_error_code as PublishErrorCode : null;
    return {
      channel,
      state: status,
      can_publish: issue === null,
      issue,
      issue_traits: issue ? errorTraits(issue) : null,
      draft_version: typeof row?.draft_version === "number" ? row.draft_version : null,
      last_attempt: status === "NOT_REQUESTED" ? null : {
        error_code: errorCode,
        retryable: row?.attempt_retryable === true,
        verification_required: row?.attempt_verification_required === true,
        meta_object_id: status === "SUCCEEDED" ? row?.meta_object_id ?? null : null,
        permalink: status === "SUCCEEDED" ? row?.permalink ?? null : null,
        updated_at: row?.attempt_updated_at ?? null,
      },
    };
  });
}

export interface ConsentBegin {
  userId: string;
  businessId: string;
  stateHash: string;
  bindingHash: string;
  expiresAt: string;
}

export type ConsentBeginResult = "ok" | "invalid" | "no_business" | "not_connected";
export type ConsentCompleteResult = "ok" | "unknown" | "wrong_user" | "binding_mismatch" | "expired" | "stale";

export interface PublishingDeps {
  getUserId(jwt: string): Promise<string | null>;
  getOwnBusinessId(userId: string): Promise<string | null>;
  beginConsent(b: ConsentBegin): Promise<ConsentBeginResult>;
  completeConsent(userId: string, completionHash: string, bindingHash: string): Promise<{ result: ConsentCompleteResult; permissions: string[] }>;
  capabilities(userId: string, businessId: string): Promise<CapabilityRow[]>;
  preflight(userId: string, publicationId: string, expectedVersion: number): Promise<PreflightRow[]>;
  env(name: string): string | undefined;
  randomToken?: () => string;
  now?: () => Date;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
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

const HEX64 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const fail = (code: PublishErrorCode | "NO_BUSINESS" | "SESSION_MISMATCH" | "OAUTH_STATE_EXPIRED" | "META_APP_NOT_CONFIGURED", status: number) =>
  json({ ok: false, code, ...(isPublishErrorCode(code) ? errorTraits(code) : {}) }, status);

export function createHandler(deps: PublishingDeps) {
  const token = deps.randomToken ?? randomToken;
  const now = deps.now ?? (() => new Date());

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
    try {
      if (req.method !== "POST") return fail("INVALID_PUBLICATION_STATE", 405);
      const authHeader = req.headers.get("Authorization");
      const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
      const userId = jwt ? await deps.getUserId(jwt) : null;
      if (!userId) return fail("AUTH_REQUIRED", 401);

      const body = await req.json().catch(() => null) as Record<string, unknown> | null;
      const action = body?.action;

      if (action === "preflight") {
        const publicationId = body?.publicationId;
        const expectedVersion = body?.expectedVersion;
        if (typeof publicationId !== "string" || !UUID.test(publicationId)) return fail("INVALID_PUBLICATION_STATE", 400);
        if (typeof expectedVersion !== "number" || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
          return fail("VERSION_CONFLICT", 409);
        }
        const rows = await deps.preflight(userId, publicationId, expectedVersion);
        return json({ ok: true, channels: toReadModel(rows) });
      }

      const businessId = await deps.getOwnBusinessId(userId);
      if (!businessId) return fail("NO_BUSINESS", 400);

      if (action === "capabilities") {
        return json({ ok: true, ...deriveCapabilities(await deps.capabilities(userId, businessId)) });
      }

      if (action === "enable_publishing_start") {
        const appId = deps.env("META_APP_ID");
        const redirectUri = deps.env("META_REDIRECT_URI");
        if (!appId || !redirectUri || !deps.env("META_APP_SECRET")) return fail("META_APP_NOT_CONFIGURED", 503);
        const state = token();
        const binding = token();
        const begun = await deps.beginConsent({
          userId,
          businessId,
          stateHash: await sha256Hex(state),
          bindingHash: await sha256Hex(binding),
          expiresAt: new Date(now().getTime() + STATE_TTL_MS).toISOString(),
        });
        if (begun === "not_connected") return fail("CHANNEL_NOT_CONNECTED", 409);
        if (begun === "no_business") return fail("NO_BUSINESS", 400);
        if (begun !== "ok") return fail("INTERNAL_ERROR", 500);
        const params = new URLSearchParams({
          client_id: appId,
          redirect_uri: redirectUri,
          state,
          response_type: "code",
          scope: PUBLISHING_SCOPES.join(","),
          auth_type: "rerequest",
        });
        console.log("[meta-publishing]", JSON.stringify({ stage: "publishing_consent_url", scopes: PUBLISHING_SCOPES }));
        return json({ ok: true, url: `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params}`, binding });
      }

      if (action === "enable_publishing_complete") {
        const completion = body?.completion;
        const binding = body?.binding;
        if (typeof completion !== "string" || !HEX64.test(completion) || typeof binding !== "string" || !HEX64.test(binding)) {
          return fail("SESSION_MISMATCH", 400);
        }
        const done = await deps.completeConsent(userId, await sha256Hex(completion), await sha256Hex(binding));
        if (done.result === "ok") {
          return json({ ok: true, ...deriveCapabilities(await deps.capabilities(userId, businessId)) });
        }
        if (done.result === "expired") return fail("OAUTH_STATE_EXPIRED", 410);
        if (done.result === "stale") return fail("CHANNEL_NOT_CONNECTED", 409);
        return fail("SESSION_MISMATCH", 403);
      }

      return fail("INVALID_PUBLICATION_STATE", 400);
    } catch (err) {
      console.error("[meta-publishing] unhandled:", redact(err instanceof Error ? err.message : "unknown"));
      return fail("INTERNAL_ERROR", 500);
    }
  };
}
