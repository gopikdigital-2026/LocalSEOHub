import { buildFacts, type Lang } from "./context.ts";
import { adaptationContext, parseAdaptation, reviewAdaptation, ADAPTATION_SCHEMA, type ChannelTexts, type SourceSnapshot } from "./adaptation.ts";
import { adaptationMessages, adaptationRepairMessages, type ChatMessage } from "./prompts.ts";
import { ROLES, type Role } from "./safety.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export const LEDGER_FUNCTION = "publication-adaptation";
export const MODEL = "gpt-4o-mini";
export const MAX_BODY_BYTES = 1024;
export const ADAPTATIONS_LIMIT = 3;
export const WRITER = { maxTokens: 900, timeoutMs: 25_000, temperature: 0.6, maxCalls: 2 } as const;

export type ErrorCode =
  | "unauthenticated" | "not_found" | "publication_not_ready" | "no_selected_proposal" | "stale_selection" | "busy"
  | "limit_reached" | "ai_unavailable" | "invalid_ai_output" | "unsafe_output" | "conflict" | "unavailable" | "unknown";

export const STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401, not_found: 404, publication_not_ready: 409, no_selected_proposal: 409, stale_selection: 409, busy: 409,
  limit_reached: 429, ai_unavailable: 503, invalid_ai_output: 502, unsafe_output: 422, conflict: 409, unavailable: 503, unknown: 500,
};

export interface DraftRow {
  publicationId: string;
  businessId: string;
  status: string;
  generationId: string | null;
  draft: {
    version: number;
    sourceGenerationId: string;
    role: Role;
    lang: Lang;
    body: string;
    cta: string;
    adaptationsUsed: number;
  } | null;
}

export type ClaimStatus = "claimed" | "not_found" | "not_ready" | "no_selection" | "stale" | "busy" | "limit";
export type ReserveStatus = "reserved" | "fn_limit" | "global_limit" | "invalid" | "disabled";
export type Outcome = "completed" | "consumed" | "released";
export type CompleteResult =
  | { result: "completed"; version: number; adaptedAt: string; adaptationsUsed: number }
  | { result: "not_found" | "stale" | "claim_lost" | "limit" | "invalid" };

export interface ModelRequest {
  messages: ChatMessage[];
  schema: typeof ADAPTATION_SCHEMA;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}
export type ModelResult = { ok: true; raw: string } | { ok: false; billed: boolean; failure: "timeout" | "rate_limited" | "server" | "client" | "empty" };

export interface AdaptationDeps {
  loadDraft(userId: string, publicationId: string): Promise<DraftRow | null>;
  loadBusiness(userId: string, businessId: string): Promise<Record<string, unknown> | null>;
  claim(publicationId: string, userId: string, claimId: string, expectedVersion: number): Promise<ClaimStatus>;
  release(publicationId: string, userId: string, claimId: string): Promise<boolean>;
  complete(publicationId: string, userId: string, claimId: string, expectedVersion: number, sourceGenerationId: string, texts: ChannelTexts): Promise<CompleteResult | null>;
  reserve(reservationId: string, userId: string, fn: typeof LEDGER_FUNCTION): Promise<ReserveStatus>;
  settle(reservationId: string, userId: string, outcome: Outcome): Promise<boolean>;
  callModel(req: ModelRequest): Promise<ModelResult>;
  log(event: string, detail: Record<string, unknown>): void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export const fail = (code: ErrorCode, extra: Record<string, unknown> = {}, status = STATUS[code]) => json({ ok: false, code, ...extra }, status);

export interface AdaptInput { publicationId: string; requestId: string; expectedVersion: number }

// Only identifiers are accepted; every piece of content is loaded server-side.
export function parseInput(raw: string | null): AdaptInput | null {
  if (raw === null || raw.length > MAX_BODY_BYTES) return null;
  let b: unknown;
  try {
    b = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const o = b as Record<string, unknown>;
  if (Object.keys(o).sort().join() !== "expected_version,publication_id,request_id") return null;
  if (typeof o.publication_id !== "string" || typeof o.request_id !== "string") return null;
  if (typeof o.expected_version !== "number" || !Number.isInteger(o.expected_version) || o.expected_version < 1 || o.expected_version > 1_000_000) return null;
  const publicationId = o.publication_id.toLowerCase();
  const requestId = o.request_id.toLowerCase();
  if (!UUID.test(publicationId) || !UUID.test(requestId)) return null;
  return { publicationId, requestId, expectedVersion: o.expected_version };
}

interface Meter { calls: number; billed: boolean; repairs: number }

type PipelineResult =
  | { kind: "ok"; texts: ChannelTexts }
  | { kind: "error"; code: "ai_unavailable" | "invalid_ai_output" | "unsafe_output"; reason: string; rules?: string[] };

const retryable = (f: Extract<ModelResult, { ok: false }>["failure"]) => f !== "client";

export async function runAdaptation(deps: AdaptationDeps, meter: Meter, ctx: ReturnType<typeof adaptationContext>): Promise<PipelineResult> {
  const base = adaptationMessages(ctx);
  let messages = base;
  let last: PipelineResult = { kind: "error", code: "invalid_ai_output", reason: "invalid_shape" };
  for (let i = 0; i < WRITER.maxCalls; i++) {
    meter.calls++;
    const res = await deps.callModel({
      messages, schema: ADAPTATION_SCHEMA, maxTokens: WRITER.maxTokens, temperature: WRITER.temperature, timeoutMs: WRITER.timeoutMs,
    });
    if (res.ok || res.billed) meter.billed = true;
    if (!res.ok) {
      last = { kind: "error", code: res.failure === "empty" ? "invalid_ai_output" : "ai_unavailable", reason: res.failure };
      if (!retryable(res.failure)) break;
      messages = base;
      continue;
    }
    const texts = parseAdaptation(res.raw);
    if (!texts) {
      last = { kind: "error", code: "invalid_ai_output", reason: "invalid_shape" };
      messages = base;
      continue;
    }
    const review = reviewAdaptation(texts, ctx);
    if (!review.safety.length && !review.quality.length) return { kind: "ok", texts };
    const unsafe = review.safety.length > 0;
    last = {
      kind: "error", code: unsafe ? "unsafe_output" : "invalid_ai_output", reason: unsafe ? "unsafe" : "quality",
      rules: [...new Set([...review.safety, ...review.quality].map((r) => r.split(":")[0]))],
    };
    meter.repairs++;
    messages = adaptationRepairMessages(base, res.raw, [...review.safety, ...review.quality]);
  }
  return last;
}

const CLAIM_ERRORS: Record<Exclude<ClaimStatus, "claimed">, ErrorCode> = {
  not_found: "not_found", not_ready: "publication_not_ready", no_selection: "no_selected_proposal",
  stale: "stale_selection", busy: "busy", limit: "limit_reached",
};

const COMPLETE_ERRORS: Record<Exclude<CompleteResult["result"], "completed">, ErrorCode> = {
  not_found: "not_found", stale: "stale_selection", claim_lost: "conflict", limit: "limit_reached", invalid: "invalid_ai_output",
};

export async function adapt(userId: string, rawBody: string | null, deps: AdaptationDeps): Promise<Response> {
  const input = parseInput(rawBody);
  if (!input) return fail("not_found", { reason: "invalid_request" }, 400);

  const row = await deps.loadDraft(userId, input.publicationId);
  if (!row) return fail("not_found");
  if (row.status !== "proposals_ready" || !row.generationId) return fail("publication_not_ready");
  const draft = row.draft;
  if (!draft) return fail("no_selected_proposal");
  if (draft.version !== input.expectedVersion || draft.sourceGenerationId !== row.generationId) return fail("stale_selection");
  if (draft.adaptationsUsed >= ADAPTATIONS_LIMIT) return fail("limit_reached", { scope: "publication" });
  if (!ROLES.includes(draft.role) || (draft.lang !== "es" && draft.lang !== "en")) return fail("unavailable");
  const facts = buildFacts(await deps.loadBusiness(userId, row.businessId));
  if (!facts) return fail("not_found");

  const claim = await deps.claim(row.publicationId, userId, input.requestId, input.expectedVersion);
  if (claim !== "claimed") return fail(CLAIM_ERRORS[claim], claim === "limit" ? { scope: "publication" } : {});

  try {
    const reserved = await deps.reserve(input.requestId, userId, LEDGER_FUNCTION);
    if (reserved === "fn_limit") return fail("limit_reached", { scope: "monthly" });
    if (reserved === "global_limit") return fail("limit_reached", { scope: "global" });
    if (reserved === "invalid") return fail("conflict");
    if (reserved !== "reserved") return fail("ai_unavailable");

    const meter: Meter = { calls: 0, billed: false, repairs: 0 };
    let completed = false;
    try {
      const source: SourceSnapshot = { role: draft.role, lang: draft.lang, body: draft.body, cta: draft.cta };
      const result = await runAdaptation(deps, meter, adaptationContext(facts, source));
      deps.log("pipeline", {
        result: result.kind, code: result.kind === "error" ? result.code : null, reason: result.kind === "error" ? result.reason : null,
        rules: result.kind === "error" ? result.rules ?? null : null, calls: meter.calls, repairs: meter.repairs, billed: meter.billed,
      });
      if (result.kind === "error") return fail(result.code);

      const saved = await deps.complete(row.publicationId, userId, input.requestId, input.expectedVersion, draft.sourceGenerationId, result.texts);
      if (!saved) return fail("unavailable");
      if (saved.result !== "completed") return fail(COMPLETE_ERRORS[saved.result]);
      completed = true;
      return json({
        ok: true,
        draft: {
          publicationId: row.publicationId, version: saved.version, adaptedAt: saved.adaptedAt,
          adaptationsUsed: saved.adaptationsUsed, adaptationsLimit: ADAPTATIONS_LIMIT, lang: draft.lang, role: draft.role,
        },
        facebook: { text: result.texts.facebook },
        instagram: { text: result.texts.instagram },
      });
    } finally {
      await deps.settle(input.requestId, userId, completed ? "completed" : meter.billed ? "consumed" : "released");
    }
  } finally {
    await deps.release(row.publicationId, userId, input.requestId);
  }
}
