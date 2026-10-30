// Copied from meta-publishing (edge functions cannot share code); the frozen Facebook files stay untouched.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export const META_GRAPH_VERSION = "v25.0";
export const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

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
} as const;

export type PublishErrorCode = keyof typeof PUBLISH_ERRORS;

export function isPublishErrorCode(value: unknown): value is PublishErrorCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PUBLISH_ERRORS, value);
}

export function errorTraits(code: PublishErrorCode) {
  return { ...PUBLISH_ERRORS[code] };
}

// A transport failure or 5xx after the request may have reached Meta is UNKNOWN, never FAILED.
export function mapMetaError(input: { status?: number; body?: unknown }): PublishErrorCode {
  const e = (input.body as { error?: Record<string, unknown> } | null)?.error;
  const code = Number(e?.code);
  const subcode = Number(e?.error_subcode);
  if ([4, 17, 32, 613, 9].includes(code) || subcode === 2207051 || subcode === 2207042) return "META_RATE_LIMITED";
  if (code === 190 || code === 102 || [458, 459, 460, 463, 464, 467].includes(subcode)) return "REAUTH_REQUIRED";
  if (code === 10 || (code >= 200 && code <= 299)) return "PERMISSION_REQUIRED";
  if (code === 368) return "META_REJECTED";
  if (code === 324 || code === 36003 || [2207004, 2207005, 2207009, 2207026].includes(subcode)) return "IMAGE_UNSUPPORTED";
  if (code === 1 || code === 2 || e?.is_transient === true) return "META_TEMPORARY_ERROR";
  const status = input.status ?? 0;
  if (status >= 500) return "PUBLISH_OUTCOME_UNKNOWN";
  if (status === 429) return "META_RATE_LIMITED";
  if (code === 100 || (status >= 400 && status < 500)) return "META_REJECTED";
  return "INTERNAL_ERROR";
}

const SECRET_PATTERNS: [RegExp, string][] = [
  [/\bEA[A-Za-z0-9]{20,}\b/g, "[token]"],
  [/(access_token|appsecret_proof|client_secret|fb_exchange_token|code|token|signature|sig|image_url)=([^&\s"']+)/gi, "$1=[redacted]"],
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

// Only numeric codes and the normalized result are ever logged; never bodies, messages, URLs or fbtrace_id.
export function safeErrorLog(body: unknown, result: PublishErrorCode): Record<string, string | number> {
  const e = (body as { error?: Record<string, unknown> } | null)?.error;
  const out: Record<string, string | number> = { result };
  if (typeof e?.code === "number") out.code = e.code;
  if (typeof e?.error_subcode === "number") out.subcode = e.error_subcode;
  return out;
}

export function log(entry: Record<string, unknown>) {
  console.log("[instagram-publishing]", redact(JSON.stringify(entry)));
}

export async function appSecretProof(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function timed(doFetch: typeof fetch, url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await doFetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
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

export type State = "NOT_REQUESTED" | "PUBLISHING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";
const ATTEMPT_STATES = { publishing: "PUBLISHING", succeeded: "SUCCEEDED", failed: "FAILED", unknown: "UNKNOWN" } as const;

export function instagramReadModel(rows: PreflightRow[]) {
  const row = rows.find((r) => r.channel === "instagram");
  const issue: PublishErrorCode | null = !row ? "INTERNAL_ERROR" : row.issue === null ? null : isPublishErrorCode(row.issue) ? row.issue : "INTERNAL_ERROR";
  const state: State = row?.attempt_status && row.attempt_status in ATTEMPT_STATES
    ? ATTEMPT_STATES[row.attempt_status as keyof typeof ATTEMPT_STATES]
    : "NOT_REQUESTED";
  const errorCode = isPublishErrorCode(row?.attempt_error_code) ? row!.attempt_error_code as PublishErrorCode : null;
  return {
    channel: "instagram" as const,
    state,
    can_publish: issue === null,
    issue,
    issue_traits: issue ? errorTraits(issue) : null,
    draft_version: typeof row?.draft_version === "number" ? row.draft_version : null,
    last_attempt: state === "NOT_REQUESTED" ? null : {
      error_code: errorCode,
      retryable: row?.attempt_retryable === true,
      verification_required: row?.attempt_verification_required === true,
      meta_object_id: state === "SUCCEEDED" ? row?.meta_object_id ?? null : null,
      permalink: state === "SUCCEEDED" ? row?.permalink ?? null : null,
      updated_at: row?.attempt_updated_at ?? null,
    },
  };
}
