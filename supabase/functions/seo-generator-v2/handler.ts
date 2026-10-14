import {
  LEDGER_FUNCTION, MAX_BODY_BYTES, MAX_PROVIDER_CALLS, buildMessages, missingEssentials, parseInput, parseModelOutput,
  sanitizeFacts, violations,
} from './logic.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

export type ReserveResult =
  | { status: 'reserved'; fn_used: number; global_used: number }
  | { status: 'fn_limit'; fn_used: number; global_used: number }
  | { status: 'global_limit'; fn_used: number; global_used: number }
  | { status: 'disabled' }
  | { status: 'invalid' };

export type ModelResult = { ok: true; raw: string } | { ok: false; retryable: boolean };

export type AiOutcome = 'completed' | 'consumed' | 'released';

export interface Deps {
  loadBusiness(userId: string, businessId: string): Promise<Record<string, unknown> | null>;
  reserve(reservationId: string, userId: string, fn: typeof LEDGER_FUNCTION): Promise<ReserveResult>;
  settle(reservationId: string, userId: string, outcome: AiOutcome): Promise<boolean>;
  callModel(messages: ReturnType<typeof buildMessages>): Promise<ModelResult>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

export async function generate(userId: string, rawBody: string, deps: Deps): Promise<Response> {
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413);
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return json({ error: 'invalid_input' }, 422); }

  const parsed = parseInput(body);
  if (!parsed.ok) return json({ error: parsed.error }, 422);
  const input = parsed.input;

  const row = await deps.loadBusiness(userId, input.businessId);
  if (!row) return json({ error: 'not_found' }, 404);
  const facts = sanitizeFacts(row);
  const missing = missingEssentials(facts, input);
  if (missing.length) return json({ error: 'profile_incomplete', missing }, 422);

  const r = await deps.reserve(input.requestId, userId, LEDGER_FUNCTION);
  if (r.status === 'fn_limit') return json({ error: 'seo_limit' }, 429);
  if (r.status === 'global_limit') return json({ error: 'global_limit' }, 429);
  if (r.status === 'invalid') return json({ error: 'duplicate_request' }, 409);
  if (r.status !== 'reserved') return json({ error: 'unavailable' }, 503);

  const messages = buildMessages(facts, input);
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
      const result = parseModelOutput(res.raw, input.format);
      if (result && violations(result, facts, input.topic).length === 0) {
        await deps.settle(input.requestId, userId, 'completed');
        return json({ status: 'generated', format: input.format, result });
      }
    }
  } catch {
    lastRetryable = true;
  }

  // Provider failure costs the user nothing; a billed but rejected output is consumed to cap spend on abusive topics.
  await deps.settle(input.requestId, userId, billed ? 'consumed' : 'released');
  return json({ error: billed ? 'generation_failed' : 'ai_unavailable', retryable: lastRetryable }, 502);
}
