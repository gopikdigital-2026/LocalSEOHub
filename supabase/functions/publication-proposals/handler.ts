import {
  buildEnvelope, buildFacts, insufficiency, mismatchNotice, parseVisual, INSUFFICIENT_MESSAGE, VISUAL_SCHEMA,
  type Consistency, type GroundingEnvelope, type InsufficientReason, type Lang, type MismatchNotice,
} from "./context.ts";
import { normalizeImage, type NormalizedMime } from "./normalize.ts";
import { repairMessages, visionMessages, writerMessages, type ChatMessage } from "./prompts.ts";
import { isClaim, parseProposals, reviewSet, PROPOSALS_SCHEMA, type Proposal } from "./safety.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export const LEDGER_FUNCTION = "publication-proposals";
export const MODEL = "gpt-4o-mini";
export const MAX_BODY_BYTES = 2048;
export const GENERATIONS_LIMIT = 4;
export const VISION = { maxTokens: 700, timeoutMs: 30_000, temperature: 0.1, maxCalls: 2 } as const;
export const WRITER = { maxTokens: 1200, timeoutMs: 25_000, temperature: 0.7, maxCalls: 2 } as const;

export type ErrorCode =
  | "INVALID_REQUEST" | "NOT_FOUND" | "IMAGE_REQUIRED" | "IMAGE_NOT_NORMALIZED" | "BUSINESS_CONTEXT_MISSING"
  | "GENERATION_IN_PROGRESS" | "REGENERATION_LIMIT_REACHED" | "IMAGE_CHANGED" | "DUPLICATE_REQUEST"
  | "AI_LIMIT_REACHED" | "AI_GLOBAL_LIMIT_REACHED" | "AI_UNAVAILABLE" | "STORAGE_UNAVAILABLE"
  | "IMAGE_NOT_UNDERSTANDABLE" | "BUSINESS_IMAGE_MISMATCH" | "PROVIDER_TIMEOUT" | "PROVIDER_UNAVAILABLE" | "INVALID_MODEL_OUTPUT"
  | "GENERATION_UNSAFE" | "PROPOSALS_NOT_DISTINCT" | "UNKNOWN_ERROR";

const STATUS: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400, NOT_FOUND: 404, IMAGE_REQUIRED: 409, IMAGE_NOT_NORMALIZED: 409, BUSINESS_CONTEXT_MISSING: 409,
  GENERATION_IN_PROGRESS: 409, REGENERATION_LIMIT_REACHED: 429, IMAGE_CHANGED: 409, DUPLICATE_REQUEST: 409,
  AI_LIMIT_REACHED: 429, AI_GLOBAL_LIMIT_REACHED: 429, AI_UNAVAILABLE: 503, STORAGE_UNAVAILABLE: 503,
  IMAGE_NOT_UNDERSTANDABLE: 422, BUSINESS_IMAGE_MISMATCH: 422, PROVIDER_TIMEOUT: 504, PROVIDER_UNAVAILABLE: 503, INVALID_MODEL_OUTPUT: 502,
  GENERATION_UNSAFE: 422, PROPOSALS_NOT_DISTINCT: 422, UNKNOWN_ERROR: 500,
};

export interface PublicationRow {
  id: string;
  businessId: string;
  imagePath: string | null;
  imageMime: NormalizedMime | null;
  imageBytes: number | null;
  imageNormalized: boolean;
}

export type ClaimStatus = "claimed" | "busy" | "limit" | "stale" | "not_found";
export type ReserveStatus = "reserved" | "fn_limit" | "global_limit" | "invalid" | "disabled";
export type Outcome = "completed" | "consumed" | "released";
export interface Completed { generationId: string; generatedAt: string; generationsUsed: number }

export interface ModelRequest {
  stage: "vision" | "writer";
  messages: ChatMessage[];
  schema: { name: string; strict: boolean; schema: unknown };
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}
export type ModelResult = { ok: true; raw: string } | { ok: false; billed: boolean; failure: "timeout" | "rate_limited" | "server" | "client" | "empty" };

export interface ProposalDeps {
  loadPublication(userId: string, publicationId: string): Promise<PublicationRow | null>;
  loadBusiness(userId: string, businessId: string): Promise<Record<string, unknown> | null>;
  claim(publicationId: string, userId: string, claimId: string, imagePath: string): Promise<ClaimStatus>;
  release(publicationId: string, userId: string, claimId: string): Promise<boolean>;
  complete(publicationId: string, userId: string, claimId: string, imagePath: string, lang: Lang, proposals: Proposal[]): Promise<Completed | null>;
  downloadImage(path: string): Promise<Uint8Array | null>;
  reserve(reservationId: string, userId: string, fn: typeof LEDGER_FUNCTION): Promise<ReserveStatus>;
  settle(reservationId: string, userId: string, outcome: Outcome): Promise<boolean>;
  callModel(req: ModelRequest): Promise<ModelResult>;
  log(event: string, detail: Record<string, unknown>): void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const fail = (code: ErrorCode, extra: Record<string, unknown> = {}) => json({ ok: false, code, ...extra }, STATUS[code]);

export interface GenerateInput { publicationId: string; requestId: string; lang: Lang }

export function parseInput(raw: string | null): GenerateInput | null {
  if (raw === null || raw.length > MAX_BODY_BYTES) return null;
  let b: unknown;
  try {
    b = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const o = b as Record<string, unknown>;
  if (Object.keys(o).sort().join() !== "lang,publication_id,request_id") return null;
  if (typeof o.publication_id !== "string" || typeof o.request_id !== "string" || (o.lang !== "es" && o.lang !== "en")) return null;
  const publicationId = o.publication_id.toLowerCase();
  const requestId = o.request_id.toLowerCase();
  if (!UUID.test(publicationId) || !UUID.test(requestId)) return null;
  return { publicationId, requestId, lang: o.lang };
}

export function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

type PipelineResult =
  | { kind: "ok"; proposals: Proposal[]; envelope: GroundingEnvelope }
  | { kind: "insufficient"; reason: InsufficientReason }
  | { kind: "mismatch"; notice: MismatchNotice }
  | { kind: "error"; code: ErrorCode; consistency?: Consistency };

interface Meter { calls: number; billed: boolean; repairs: number }

const providerCode = (f: Extract<ModelResult, { ok: false }>["failure"]): ErrorCode =>
  f === "timeout" ? "PROVIDER_TIMEOUT" : f === "empty" ? "INVALID_MODEL_OUTPUT" : "PROVIDER_UNAVAILABLE";
const retryable = (f: Extract<ModelResult, { ok: false }>["failure"]) => f !== "client";

async function call(deps: ProposalDeps, meter: Meter, req: ModelRequest): Promise<ModelResult> {
  meter.calls++;
  const res = await deps.callModel(req);
  if (res.ok || res.billed) meter.billed = true;
  return res;
}

export async function runPipeline(
  deps: ProposalDeps, meter: Meter, lang: Lang, facts: NonNullable<ReturnType<typeof buildFacts>>, image: { dataUrl: string; orientation: number },
): Promise<PipelineResult> {
  const vreq: ModelRequest = {
    stage: "vision", messages: visionMessages(lang, facts, image.orientation, image.dataUrl),
    schema: VISUAL_SCHEMA, maxTokens: VISION.maxTokens, temperature: VISION.temperature, timeoutMs: VISION.timeoutMs,
  };
  let visual = null;
  let lastFailure: ErrorCode = "INVALID_MODEL_OUTPUT";
  for (let i = 0; i < VISION.maxCalls && !visual; i++) {
    const res = await call(deps, meter, vreq);
    if (!res.ok) {
      lastFailure = providerCode(res.failure);
      if (!retryable(res.failure)) break;
      continue;
    }
    visual = parseVisual(res.raw);
    if (!visual) lastFailure = "INVALID_MODEL_OUTPUT";
  }
  if (!visual) return { kind: "error", code: lastFailure };

  const reason = insufficiency(visual);
  if (reason) return { kind: "insufficient", reason };
  const envelope = buildEnvelope(lang, facts, visual, isClaim);
  if (!envelope.image.subject) return { kind: "insufficient", reason: "no_clear_subject" };
  if (envelope.consistency === "MATERIAL_MISMATCH") return { kind: "mismatch", notice: mismatchNotice(lang, envelope) };

  const base = writerMessages(envelope);
  let messages = base;
  let rejection: ErrorCode = "INVALID_MODEL_OUTPUT";
  for (let i = 0; i < WRITER.maxCalls; i++) {
    const res = await call(deps, meter, {
      stage: "writer", messages, schema: PROPOSALS_SCHEMA,
      maxTokens: WRITER.maxTokens, temperature: WRITER.temperature, timeoutMs: WRITER.timeoutMs,
    });
    if (!res.ok) {
      rejection = providerCode(res.failure);
      if (!retryable(res.failure)) break;
      messages = base;
      continue;
    }
    const proposals = parseProposals(res.raw);
    if (!proposals) {
      rejection = "INVALID_MODEL_OUTPUT";
      messages = base;
      continue;
    }
    const review = reviewSet(proposals, envelope);
    if (!review.safety.length && !review.differentiation.length) return { kind: "ok", proposals, envelope };
    rejection = review.safety.length ? "GENERATION_UNSAFE" : "PROPOSALS_NOT_DISTINCT";
    meter.repairs++;
    messages = repairMessages(base, res.raw, [...review.safety, ...review.differentiation]);
  }
  return { kind: "error", code: rejection, consistency: envelope.consistency };
}

export async function generate(userId: string, rawBody: string | null, deps: ProposalDeps): Promise<Response> {
  const input = parseInput(rawBody);
  if (!input) return fail("INVALID_REQUEST");

  const pub = await deps.loadPublication(userId, input.publicationId);
  if (!pub) return fail("NOT_FOUND");
  if (!pub.imagePath || !pub.imageMime) return fail("IMAGE_REQUIRED");
  if (!pub.imageNormalized) return fail("IMAGE_NOT_NORMALIZED");
  const facts = buildFacts(await deps.loadBusiness(userId, pub.businessId));
  if (!facts) return fail("BUSINESS_CONTEXT_MISSING");

  const claim = await deps.claim(pub.id, userId, input.requestId, pub.imagePath);
  if (claim === "busy") return fail("GENERATION_IN_PROGRESS");
  if (claim === "limit") return fail("REGENERATION_LIMIT_REACHED");
  if (claim === "stale") return fail("IMAGE_CHANGED");
  if (claim !== "claimed") return fail("NOT_FOUND");

  try {
    const bytes = await deps.downloadImage(pub.imagePath);
    if (!bytes) return fail("STORAGE_UNAVAILABLE");
    // Defense in depth: only bytes that are already a normalization fixed point ever reach the provider.
    const check = normalizeImage(bytes, pub.imageMime);
    if (!check.ok || bytes.length !== pub.imageBytes || check.bytes.length !== bytes.length || !check.bytes.every((v, k) => v === bytes[k])) {
      deps.log("not_normalized", {});
      return fail("IMAGE_NOT_NORMALIZED");
    }

    const reserved = await deps.reserve(input.requestId, userId, LEDGER_FUNCTION);
    if (reserved === "fn_limit") return fail("AI_LIMIT_REACHED");
    if (reserved === "global_limit") return fail("AI_GLOBAL_LIMIT_REACHED");
    if (reserved === "invalid") return fail("DUPLICATE_REQUEST");
    if (reserved !== "reserved") return fail("AI_UNAVAILABLE");

    const meter: Meter = { calls: 0, billed: false, repairs: 0 };
    let completed = false;
    try {
      const result = await runPipeline(deps, meter, input.lang, facts, {
        dataUrl: `data:${pub.imageMime};base64,${toBase64(bytes)}`,
        orientation: check.orientation,
      });
      deps.log("pipeline", {
        result: result.kind, code: result.kind === "error" ? result.code : null,
        consistency: result.kind === "ok" ? result.envelope.consistency : result.kind === "mismatch" ? "MATERIAL_MISMATCH" : result.kind === "error" ? result.consistency ?? null : null,
        calls: meter.calls, repairs: meter.repairs, billed: meter.billed,
      });

      if (result.kind === "insufficient") {
        return fail("IMAGE_NOT_UNDERSTANDABLE", { reason: result.reason, message: INSUFFICIENT_MESSAGE[input.lang] });
      }
      // Nothing is stored and the generation counter is untouched; the paid vision call settles as consumed below.
      if (result.kind === "mismatch") return fail("BUSINESS_IMAGE_MISMATCH", { mismatch: result.notice });
      if (result.kind === "error") return fail(result.code);

      const saved = await deps.complete(pub.id, userId, input.requestId, pub.imagePath, input.lang, result.proposals);
      if (!saved) return fail("IMAGE_CHANGED");
      completed = true;
      return json({
        ok: true,
        publication: {
          id: pub.id, status: "proposals_ready", lang: input.lang, generationId: saved.generationId,
          generatedAt: saved.generatedAt, generationsUsed: saved.generationsUsed, generationsLimit: GENERATIONS_LIMIT,
        },
        proposals: result.proposals,
        grounding: { observed: [result.envelope.image.subject, ...result.envelope.image.observed], uncertain: result.envelope.uncertain },
      });
    } finally {
      await deps.settle(input.requestId, userId, completed ? "completed" : meter.billed ? "consumed" : "released");
    }
  } finally {
    await deps.release(pub.id, userId, input.requestId);
  }
}
