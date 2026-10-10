import {
  MAX_PROVIDER_CALLS, buildMessages, cleanSource, declaredText, isDeclaredService, missingFor, parseModelOutput,
  resolveTarget, sanitizeFacts, supportsImprove, type Kind, type Lang, type Mode,
} from './logic.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

export type Reservation =
  | { status: 'reserved'; id: string; reservation: string; generations: number; attempts: number; global_used: number }
  | { status: 'attempts'; generations: number; attempts: number }
  | { status: 'stale'; generations: number }
  | { status: 'limit'; generations: number }
  | { status: 'busy'; generations: number }
  | { status: 'edited'; generations: number }
  | { status: 'global'; generations: number }
  | { status: 'closed' }
  | { status: 'not_found' }
  | { status: 'invalid' };

export type ModelResult = { ok: true; raw: string } | { ok: false; retryable: boolean };

export interface ActionRow {
  rule_id: string;
  status: string;
  metadata: unknown;
}

export interface ReserveArgs {
  userId: string;
  businessId: string;
  actionId: string;
  semanticKey: string;
  kind: Kind;
  expected: number;
  allowOverwrite: boolean;
}

export interface Deps {
  loadAction(userId: string, businessId: string, actionId: string): Promise<ActionRow | null>;
  loadBusiness(userId: string, businessId: string): Promise<Record<string, unknown> | null>;
  reserve(args: ReserveArgs): Promise<Reservation>;
  complete(id: string, userId: string, reservation: string, content: string, lang: Lang, mode: Mode, source: string): Promise<boolean>;
  release(id: string, userId: string, reservation: string): Promise<boolean>;
  callModel(messages: ReturnType<typeof buildMessages>): Promise<ModelResult>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPEN = new Set(['PENDING', 'IN_PROGRESS']);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

export interface GenerateInput {
  businessId: string;
  actionId: string;
  lang: Lang;
  mode: Mode;
  sourceText: string | null;
  expectedGenerations: number;
  allowOverwrite: boolean;
}

export function parseInput(body: unknown): GenerateInput | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.businessId !== 'string' || !UUID.test(b.businessId)) return null;
  if (typeof b.actionId !== 'string' || !UUID.test(b.actionId)) return null;
  if (b.lang !== 'es' && b.lang !== 'en') return null;
  if (b.mode !== 'create' && b.mode !== 'improve') return null;
  if (typeof b.expectedGenerations !== 'number' || !Number.isInteger(b.expectedGenerations)
    || b.expectedGenerations < 0 || b.expectedGenerations > 3) return null;
  if (b.allowOverwrite !== undefined && typeof b.allowOverwrite !== 'boolean') return null;
  let sourceText: string | null = null;
  if (b.mode === 'improve') {
    sourceText = cleanSource(b.sourceText);
    if (!sourceText) return null;
  } else if (b.sourceText !== undefined && b.sourceText !== null && b.sourceText !== '') {
    return null;
  }
  return {
    businessId: b.businessId, actionId: b.actionId, lang: b.lang, mode: b.mode, sourceText,
    expectedGenerations: b.expectedGenerations, allowOverwrite: b.allowOverwrite === true,
  };
}

export async function generate(userId: string, body: unknown, deps: Deps): Promise<Response> {
  const input = parseInput(body);
  if (!input) return json({ error: 'invalid_request' }, 400);

  const action = await deps.loadAction(userId, input.businessId, input.actionId);
  if (!action) return json({ error: 'not_found' }, 404);
  const target = resolveTarget(action.rule_id, action.metadata);
  if (!target) return json({ error: 'incompatible_action' }, 422);
  if (input.mode === 'improve' && !supportsImprove(target.kind)) return json({ error: 'invalid_request' }, 400);
  if (!OPEN.has(action.status)) return json({ error: 'action_closed' }, 409);

  const row = await deps.loadBusiness(userId, input.businessId);
  if (!row) return json({ error: 'not_found' }, 404);
  const facts = sanitizeFacts(row);
  if (target.service && !isDeclaredService(facts, target.service)) return json({ error: 'service_not_declared' }, 422);
  const missing = missingFor(target.kind, input.mode, facts);
  if (missing.length) return json({ error: 'profile_incomplete', missing }, 422);

  const r = await deps.reserve({
    userId, businessId: input.businessId, actionId: input.actionId, semanticKey: target.semanticKey,
    kind: target.kind, expected: input.expectedGenerations, allowOverwrite: input.allowOverwrite,
  });
  if (r.status === 'not_found') return json({ error: 'not_found' }, 404);
  if (r.status === 'invalid') return json({ error: 'incompatible_action' }, 422);
  if (r.status === 'closed') return json({ error: 'action_closed' }, 409);
  if (r.status === 'stale') return json({ status: 'stale', generations: r.generations });
  if (r.status === 'limit') return json({ error: 'limit_reached', generations: r.generations }, 429);
  if (r.status === 'busy') return json({ error: 'in_progress' }, 409);
  if (r.status === 'attempts') return json({ error: 'attempts_exhausted', generations: r.generations }, 429);
  if (r.status === 'edited') return json({ error: 'edited_conflict' }, 409);
  if (r.status === 'global') return json({ error: 'global_limit' }, 429);

  const messages = buildMessages(target.kind, input.mode, facts, target.service, input.sourceText, input.lang);
  const declared = declaredText(facts, input.sourceText);

  let content: string | null = null;
  let providerDown = false;
  try {
    for (let attempt = 0; attempt < MAX_PROVIDER_CALLS && !content; attempt++) {
      const res = await deps.callModel(messages);
      if (!res.ok) {
        providerDown = true;
        if (!res.retryable) break;
        continue;
      }
      providerDown = false;
      const parsed = parseModelOutput(res.raw, target.kind, input.mode, declared);
      if (parsed.ok) content = parsed.content;
    }
  } catch {
    providerDown = true;
  }

  if (!content) {
    await deps.release(r.id, userId, r.reservation).catch(() => false);
    return json({ error: providerDown ? 'ai_unavailable' : 'generation_failed' }, 502);
  }

  const saved = await deps
    .complete(r.id, userId, r.reservation, content, input.lang, input.mode, input.sourceText ?? '')
    .catch(() => false);
  if (!saved) {
    await deps.release(r.id, userId, r.reservation).catch(() => false);
    return json({ error: 'save_failed' }, 500);
  }
  return json({ status: 'generated', generations: r.generations + 1 });
}
