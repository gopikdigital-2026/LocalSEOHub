import {
  LEDGER_FUNCTION, MAX_BODY_BYTES, MAX_PROVIDER_CALLS, buildFacts, buildMessages, hasEnoughContext, parseInput,
  parseModelOutput, violations,
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

export type ProviderFailure = 'rate_limited' | 'timeout' | 'error' | 'not_configured';

export type ModelResult = { ok: true; raw: string } | { ok: false; reason: ProviderFailure };

export type AiOutcome = 'completed' | 'consumed' | 'released';

export interface Deps {
  loadBusiness(userId: string, businessId: string): Promise<Record<string, unknown> | null>;
  reserve(reservationId: string, userId: string, fn: typeof LEDGER_FUNCTION): Promise<ReserveResult>;
  settle(reservationId: string, userId: string, outcome: AiOutcome): Promise<boolean>;
  callModel(messages: ReturnType<typeof buildMessages>): Promise<ModelResult>;
}

const RETRYABLE: ProviderFailure[] = ['rate_limited', 'timeout', 'error'];

const PROVIDER_ERROR: Record<ProviderFailure, { error: string; status: number }> = {
  rate_limited: { error: 'ai_busy', status: 503 },
  timeout: { error: 'ai_timeout', status: 504 },
  error: { error: 'ai_unavailable', status: 502 },
  not_configured: { error: 'ai_unavailable', status: 502 },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

export async function simulate(userId: string, rawBody: string, deps: Deps): Promise<Response> {
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) return json({ error: 'payload_too_large' }, 413);
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { return json({ error: 'invalid_input' }, 422); }

  const parsed = parseInput(body);
  if (!parsed.ok) return json({ error: parsed.error }, 422);
  const input = parsed.input;

  const business = await deps.loadBusiness(userId, input.businessId);
  if (!business) return json({ error: 'not_found' }, 404);
  const facts = buildFacts(business, input.lang);
  if (!hasEnoughContext(facts)) return json({ error: 'profile_incomplete' }, 422);

  const r = await deps.reserve(input.requestId, userId, LEDGER_FUNCTION);
  if (r.status === 'fn_limit') return json({ error: 'voice_limit' }, 429);
  if (r.status === 'global_limit') return json({ error: 'global_limit' }, 429);
  if (r.status === 'invalid') return json({ error: 'duplicate_request' }, 409);
  if (r.status !== 'reserved') return json({ error: 'unavailable' }, 503);

  const messages = buildMessages(facts, input);
  let billed = false;
  let lastFailure: ProviderFailure = 'error';
  try {
    for (let call = 0; call < MAX_PROVIDER_CALLS; call++) {
      const res = await deps.callModel(messages);
      if (!res.ok) {
        lastFailure = res.reason;
        if (!RETRYABLE.includes(res.reason)) break;
        continue;
      }
      billed = true;
      const simulation = parseModelOutput(res.raw, facts);
      if (simulation && violations(simulation, facts, input).length === 0) {
        await deps.settle(input.requestId, userId, 'completed');
        return json({ status: 'simulated', simulation });
      }
    }
  } catch {
    lastFailure = 'error';
  }

  // Provider failures cost the user nothing; a billed but rejected output is consumed to cap spend on abusive prompts.
  await deps.settle(input.requestId, userId, billed ? 'consumed' : 'released');
  if (billed) return json({ error: 'generation_failed', retryable: true }, 502);
  const p = PROVIDER_ERROR[lastFailure];
  return json({ error: p.error, retryable: RETRYABLE.includes(lastFailure) }, p.status);
}
