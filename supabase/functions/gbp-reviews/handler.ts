import type { EntitlementResult } from "./entitlement.ts";
import type { TokenResult } from "./gbpToken.ts";
import {
  GOOGLE_REVIEWS_BASE, LEDGER_FUNCTION, MAX_BODY_BYTES, MAX_PAGES, MAX_PROVIDER_CALLS, PAGE_SIZE,
  REVIEWS_ENDPOINT_LABEL, buildFacts, buildMessages, classifyGoogleError, normalizeReview, parseGoogleError,
  parseInput, parseModelOutput, replyViolations, tokenState,
  type Diagnostic, type NormalizedReview, type ReviewsState,
} from "./logic.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export type SourceResolution =
  | { kind: "no_business" }
  | { kind: "not_connected" }
  | { kind: "no_location" }
  | {
    kind: "found";
    sourceId: string;
    accountId: string;
    locationId: string;
    business: Record<string, unknown>;
  };

export type ReserveResult =
  | { status: "reserved" }
  | { status: "fn_limit" }
  | { status: "global_limit" }
  | { status: "disabled" }
  | { status: "invalid" };

export type ModelResult = { ok: true; raw: string } | { ok: false; retryable: boolean };

export interface Deps {
  authorize(req: Request, fn: string): Promise<EntitlementResult>;
  resolveSource(userId: string): Promise<SourceResolution>;
  token(sourceId: string): Promise<TokenResult>;
  google(url: string, accessToken: string): Promise<Response>;
  reserve(reservationId: string, userId: string, fn: typeof LEDGER_FUNCTION): Promise<ReserveResult>;
  settle(reservationId: string, userId: string, outcome: "completed" | "consumed" | "released"): Promise<boolean>;
  callModel(messages: ReturnType<typeof buildMessages>): Promise<ModelResult>;
  log(event: string, detail: Record<string, string | number | boolean | null>): void;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function stateResponse(state: ReviewsState, diagnostic: Diagnostic | null, retryable = false): Response {
  return json({ status: state, retryable, diagnostic });
}

type GoogleRead<T> =
  | { ok: true; value: T }
  | { ok: false; state: ReviewsState; diagnostic: Diagnostic; retryable: boolean };

async function readGoogle(
  deps: Deps, url: string, accessToken: string, refreshed: boolean,
): Promise<GoogleRead<Record<string, unknown>>> {
  let res: Response;
  try {
    res = await deps.google(url, accessToken);
  } catch {
    const diagnostic = { endpoint: REVIEWS_ENDPOINT_LABEL, httpStatus: null, googleStatus: null, reason: "network", tokenRefreshed: refreshed };
    deps.log("google_request_failed", { httpStatus: null, reason: "network" });
    return { ok: false, state: "google_error", diagnostic, retryable: true };
  }
  if (res.ok) {
    const body = await res.json().catch(() => null);
    if (body && typeof body === "object") return { ok: true, value: body as Record<string, unknown> };
    const diagnostic = { endpoint: REVIEWS_ENDPOINT_LABEL, httpStatus: res.status, googleStatus: null, reason: "malformed", tokenRefreshed: refreshed };
    return { ok: false, state: "google_error", diagnostic, retryable: true };
  }
  const info = parseGoogleError(await res.text().catch(() => ""));
  const state = classifyGoogleError(res.status, info);
  const diagnostic = {
    endpoint: REVIEWS_ENDPOINT_LABEL,
    httpStatus: res.status,
    googleStatus: info.googleStatus,
    reason: info.reason,
    tokenRefreshed: refreshed,
  };
  deps.log("google_request_failed", { httpStatus: res.status, googleStatus: info.googleStatus, reason: info.reason, state });
  return { ok: false, state, diagnostic, retryable: state === "google_error" && res.status >= 500 };
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const rawBody = await req.text();
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return json({ error: "invalid_input" }, 422); }
  const input = parseInput(body);
  if (!input.ok) return json({ error: "invalid_input" }, 422);

  const access = await deps.authorize(req, input.action === "draft" ? "gbp-reviews-draft" : "gbp-reviews-list");
  if (!access.ok) return access.response;
  const userId = access.userId;

  const source = await deps.resolveSource(userId);
  if (source.kind === "no_business") return json({ error: "not_found" }, 404);
  if (source.kind === "not_connected") return stateResponse("not_connected", null);
  if (source.kind === "no_location") return stateResponse("no_location", null);

  const token = await deps.token(source.sourceId);
  if (!token.ok) {
    deps.log("token_unavailable", { code: token.code });
    return stateResponse(tokenState(token.code), {
      endpoint: "POST oauth2.googleapis.com/token",
      httpStatus: null,
      googleStatus: null,
      reason: token.code,
      tokenRefreshed: false,
    }, token.retryable);
  }

  const base = `${GOOGLE_REVIEWS_BASE}/${source.accountId}/${source.locationId}/reviews`;

  if (input.action === "list") {
    const reviews: NormalizedReview[] = [];
    let pageToken: string | null = null;
    let totalReviewCount: number | null = null;
    let averageRating: number | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const qs = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
      if (pageToken) qs.set("pageToken", pageToken);
      const r = await readGoogle(deps, `${base}?${qs}`, token.accessToken, token.refreshed);
      if (!r.ok) {
        if (page === 0) return stateResponse(r.state, r.diagnostic, r.retryable);
        pageToken = "partial";
        break;
      }
      const v = r.value;
      if (page === 0) {
        totalReviewCount = typeof v.totalReviewCount === "number" ? v.totalReviewCount : null;
        averageRating = typeof v.averageRating === "number" ? v.averageRating : null;
      }
      for (const raw of Array.isArray(v.reviews) ? v.reviews : []) {
        const n = normalizeReview(raw);
        if (n) reviews.push(n);
      }
      pageToken = typeof v.nextPageToken === "string" && v.nextPageToken ? v.nextPageToken : null;
      if (!pageToken) break;
    }
    return json({
      status: "ok",
      reviews,
      complete: pageToken === null,
      totalReviewCount,
      averageRating,
      diagnostic: {
        endpoint: REVIEWS_ENDPOINT_LABEL,
        httpStatus: 200,
        googleStatus: null,
        reason: null,
        tokenRefreshed: token.refreshed,
      },
    });
  }

  // The review is re-read from Google so the draft is always based on the real review, never on client text.
  const one = await readGoogle(deps, `${base}/${input.reviewId}`, token.accessToken, token.refreshed);
  if (!one.ok) {
    const state = one.diagnostic.httpStatus === 404 ? "review_not_found" : one.state;
    return stateResponse(state, one.diagnostic, one.retryable);
  }
  const review = normalizeReview(one.value);
  if (!review || review.reviewId !== input.reviewId) return stateResponse("review_not_found", null);

  const facts = buildFacts(source.business);
  const reserved = await deps.reserve(input.requestId, userId, LEDGER_FUNCTION);
  if (reserved.status === "fn_limit") return json({ error: "review_limit" }, 429);
  if (reserved.status === "global_limit") return json({ error: "global_limit" }, 429);
  if (reserved.status === "invalid") return json({ error: "duplicate_request" }, 409);
  if (reserved.status !== "reserved") return json({ error: "unavailable" }, 503);

  const messages = buildMessages(review, facts, input.lang);
  let billed = false;
  let lastRetryable = true;
  try {
    for (let call = 0; call < MAX_PROVIDER_CALLS; call++) {
      const res = await deps.callModel(messages);
      if (!res.ok) {
        lastRetryable = res.retryable;
        if (!res.retryable) break;
        continue;
      }
      billed = true;
      const reply = parseModelOutput(res.raw);
      const bad = reply ? replyViolations(reply, facts) : ["unparseable"];
      if (reply && bad.length === 0) {
        await deps.settle(input.requestId, userId, "completed");
        return json({ status: "drafted", reviewId: review.reviewId, draft: reply });
      }
      deps.log("draft_rejected", { rules: bad.join(",") });
    }
  } catch {
    lastRetryable = true;
  }
  await deps.settle(input.requestId, userId, billed ? "consumed" : "released");
  return json({ error: billed ? "generation_failed" : "ai_unavailable", retryable: lastRetryable }, 502);
}
