import {
  MAX_PROVIDER_CALLS, buildMessages, chooseService, chooseTopic, isCurrentWeek, missingEssentials, parseModelOutput,
  sanitizeFacts, type Lang, type Topic,
} from './logic.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

export type Reservation =
  | { status: 'reserved'; id: string; reservation: string; generations: number; attempts: number; topics_used: string[]; recent_topics: string[] }
  | { status: 'attempts'; generations: number; attempts: number }
  | { status: 'stale'; generations: number }
  | { status: 'limit'; generations: number }
  | { status: 'busy'; generations: number }
  | { status: 'fn_limit'; fn_used: number; global_used: number }
  | { status: 'global_limit'; fn_used: number; global_used: number }
  | { status: 'not_found' }
  | { status: 'invalid' };

export type ModelResult = { ok: true; raw: string } | { ok: false; retryable: boolean };

export interface Deps {
  loadBusiness(userId: string, businessId: string): Promise<Record<string, unknown> | null>;
  reserve(userId: string, businessId: string, week: string, expected: number): Promise<Reservation>;
  complete(id: string, userId: string, reservation: string, content: string, topic: Topic, lang: Lang): Promise<boolean>;
  release(id: string, userId: string, reservation: string): Promise<boolean>;
  releaseAiUsage(userId: string): Promise<boolean>;
  callModel(messages: ReturnType<typeof buildMessages>): Promise<ModelResult>;
  now(): Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

export interface GenerateInput {
  businessId: string;
  weekStart: string;
  lang: Lang;
  expectedGenerations: number;
}

export function parseInput(body: unknown): GenerateInput | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.businessId !== 'string' || !UUID.test(b.businessId)) return null;
  if (typeof b.weekStart !== 'string') return null;
  if (b.lang !== 'es' && b.lang !== 'en') return null;
  if (typeof b.expectedGenerations !== 'number' || !Number.isInteger(b.expectedGenerations)
    || b.expectedGenerations < 0 || b.expectedGenerations > 3) return null;
  return { businessId: b.businessId, weekStart: b.weekStart, lang: b.lang, expectedGenerations: b.expectedGenerations };
}

export async function generate(userId: string, body: unknown, deps: Deps): Promise<Response> {
  const input = parseInput(body);
  if (!input) return json({ error: 'invalid_request' }, 400);
  if (!isCurrentWeek(input.weekStart, deps.now())) return json({ error: 'invalid_week' }, 400);

  const row = await deps.loadBusiness(userId, input.businessId);
  if (!row) return json({ error: 'not_found' }, 404);
  const facts = sanitizeFacts(row);
  const missing = missingEssentials(facts);
  if (missing.length) return json({ error: 'profile_incomplete', missing }, 422);

  const r = await deps.reserve(userId, input.businessId, input.weekStart, input.expectedGenerations);
  if (r.status === 'not_found') return json({ error: 'not_found' }, 404);
  if (r.status === 'invalid') return json({ error: 'invalid_week' }, 400);
  if (r.status === 'fn_limit') return json({ error: 'limit_reached' }, 429);
  if (r.status === 'global_limit') return json({ error: 'limit_reached' }, 429);
  if (r.status === 'stale') return json({ status: 'stale', generations: r.generations });
  if (r.status === 'limit') return json({ error: 'limit_reached', generations: r.generations }, 429);
  if (r.status === 'busy') return json({ error: 'in_progress' }, 409);
  if (r.status === 'attempts') return json({ error: 'attempts_exhausted', generations: r.generations }, 429);

  const seed = `${input.businessId}:${input.weekStart}:${r.generations}`;
  const topic = chooseTopic(facts, seed, r.topics_used, r.recent_topics);
  const messages = buildMessages(facts, topic, chooseService(facts, seed), input.lang);

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
      const parsed = parseModelOutput(res.raw, facts);
      if (parsed.ok) content = parsed.content;
    }
  } catch {
    providerDown = true;
  }

  if (!content) {
    await deps.release(r.id, userId, r.reservation).catch(() => false);
    await deps.releaseAiUsage(userId).catch(() => false);
    return json({ error: providerDown ? 'ai_unavailable' : 'generation_failed' }, 502);
  }

  const saved = await deps.complete(r.id, userId, r.reservation, content, topic, input.lang).catch(() => false);
  if (!saved) {
    await deps.release(r.id, userId, r.reservation).catch(() => false);
    await deps.releaseAiUsage(userId).catch(() => false);
    return json({ error: 'save_failed' }, 500);
  }
  return json({ status: 'generated', generations: r.generations + 1 });
}
