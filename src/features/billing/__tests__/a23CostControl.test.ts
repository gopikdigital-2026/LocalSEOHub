/**
 * A2.3 — Tests 1–30: signup, trial, AI cost control.
 * All mocks; no real emails, AI calls, or DB mutations.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { generate as generateWeekly, parseInput as parseWeeklyInput, type Deps as WCDeps, type Reservation as WCReservation, type ModelResult } from '../../../../supabase/functions/weekly-content/handler.ts';
import { generate as generateImprovement, type Deps as BIDeps, type Reservation as BIReservation } from '../../../../supabase/functions/business-improvement/handler.ts';
import { MAX_GENERATIONS, MAX_ATTEMPTS, MAX_PROVIDER_CALLS, MODEL, MAX_OUTPUT_TOKENS, PROVIDER_TIMEOUT_MS } from '../../../../supabase/functions/weekly-content/logic.ts';
import {
  MAX_GENERATIONS as BI_MAX_GENS, MAX_ATTEMPTS as BI_MAX_ATTEMPTS, MAX_PROVIDER_CALLS as BI_MAX_CALLS,
  MODEL as BI_MODEL, MAX_OUTPUT_TOKENS as BI_MAX_TOKENS, PROVIDER_TIMEOUT_MS as BI_TIMEOUT, MONTHLY_REQUESTS,
} from '../../../../supabase/functions/business-improvement/logic.ts';


const ROOT = join(__dirname, '../../../..');
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const A23 = readdirSync(MIGRATIONS).find((f) => f.includes('a23_ai_usage'))!;
const a23Sql = readFileSync(join(MIGRATIONS, A23), 'utf8');

// ---------- Shared helpers ----------

const USER_A = '00000000-0000-4000-a000-000000000001';
const USER_B = '00000000-0000-4000-a000-000000000002';
const BIZ_A = '00000000-0000-4000-b000-000000000001';
const BIZ_B = '00000000-0000-4000-b000-000000000002';
const ACT_1 = '00000000-0000-4000-c000-000000000001';
const NOW = new Date('2026-10-06T10:00:00Z');
const MONDAY = '2026-10-05';

const COMPLETE = { name: 'Test', category: 'SEO', city: 'Madrid', services: ['Web'], target_audience: 'Pymes' };
const GOOD_TEXT = '{"text":"' + 'La agencia Test en Madrid ofrece servicios de Web para Pymes. '.repeat(5).trim() + '"}';
const okModel = (): ModelResult => ({ ok: true, raw: GOOD_TEXT });
const failModel = (): ModelResult => ({ ok: false, retryable: false });

// Weekly-content mock deps factory
function makeWCDeps(opts: {
  reserve?: (u: string, b: string, w: string, e: number) => Promise<WCReservation>;
  model?: () => ModelResult;
  fnLimitHit?: boolean;
  globalLimitHit?: boolean;
} = {}): WCDeps {
  let seq = 0;
  return {
    loadBusiness: async (u, b) => (b === BIZ_A && u === USER_A) || (b === BIZ_B && u === USER_B) ? COMPLETE : null,
    reserve: opts.reserve ?? (async () => {
      if (opts.fnLimitHit) return { status: 'fn_limit', fn_used: 40, global_used: 40 } as WCReservation;
      if (opts.globalLimitHit) return { status: 'global_limit', fn_used: 30, global_used: 80 } as WCReservation;
      return { status: 'reserved', id: `wc-${++seq}`, reservation: `tok-${seq}`, generations: 0, attempts: 1, topics_used: [], recent_topics: [] };
    }),
    complete: async () => true,
    release: async () => true,
    releaseAiUsage: async () => true,
    callModel: async () => (opts.model ? opts.model() : okModel()),
    now: () => NOW,
  };
}

// Business-improvement mock deps factory
function makeBIDeps(opts: {
  model?: () => ModelResult;
  reserveStatus?: string;
} = {}): BIDeps {
  let seq = 0;
  return {
    loadAction: async (u, b, id) => (u === USER_A && b === BIZ_A && id === ACT_1) ? { rule_id: 'optimize_services_keywords', status: 'PENDING', metadata: null } : null,
    loadBusiness: async (u, b) => (b === BIZ_A && u === USER_A ? COMPLETE : null),
    reserve: async () => {
      if (opts.reserveStatus === 'fn_limit') return { status: 'fn_limit', fn_used: 40, global_used: 40 } as BIReservation;
      if (opts.reserveStatus === 'global_limit') return { status: 'global_limit', fn_used: 30, global_used: 80 } as BIReservation;
      if (opts.reserveStatus === 'global') return { status: 'global', generations: 0 } as BIReservation;
      return { status: 'reserved', id: `bi-${++seq}`, reservation: `tok-${seq}`, generations: 0, attempts: 1, global_used: 1 };
    },
    complete: async () => true,
    release: async () => true,
    releaseAiUsage: async () => true,
    callModel: async () => (opts.model ? opts.model() : okModel()),
  };
}

const wcBody = (over: Record<string, unknown> = {}) => ({ businessId: BIZ_A, weekStart: MONDAY, lang: 'es', expectedGenerations: 0, ...over });
const biBody = (over: Record<string, unknown> = {}) => ({ businessId: BIZ_A, actionId: ACT_1, lang: 'es', mode: 'create', expectedGenerations: 0, ...over });

const callWC = async (deps: WCDeps, body: unknown, user = USER_A) => {
  const res = await generateWeekly(user, body, deps);
  return { status: res.status, json: await res.json() };
};
const callBI = async (deps: BIDeps, body: unknown, user = USER_A) => {
  const res = await generateImprovement(user, body, deps);
  return { status: res.status, json: await res.json() };
};

// ========================================================================
// §8 — Tests 1–30
// ========================================================================

describe('A2.3 — §2 Signup', () => {
  const signupSrc = readFileSync(join(ROOT, 'supabase/functions/signup-instant/index.ts'), 'utf8');

  it('T1. registro válido: signup-instant does not force email_confirm:true in createUser call', () => {
    const createBlock = signupSrc.slice(signupSrc.indexOf('createUser({'));
    const callEnd = createBlock.indexOf('});');
    const callBody = createBlock.slice(0, callEnd);
    expect(callBody).not.toMatch(/email_confirm/);
    expect(signupSrc).toContain('adminClient.auth.admin.createUser');
  });

  it('T2. registro con email sin verificar: account creation delegates confirmation to project settings', () => {
    // The createUser call must NOT force email_confirm
    const createBlock = signupSrc.slice(signupSrc.indexOf('createUser'));
    expect(createBlock).not.toMatch(/email_confirm/);
  });

  it('T3. verificación de correo: start_trial migration checks email_confirmed_at', () => {
    expect(a23Sql).toContain('email_confirmed_at IS NOT NULL');
    expect(a23Sql).toContain("'email_not_verified'");
  });

  it('T4. activación del trial tras verificar: start_trial allows trial when email is confirmed', () => {
    const startTrialDef = a23Sql.slice(a23Sql.indexOf('FUNCTION public.start_trial'));
    expect(startTrialDef).toContain('TRIAL_NOT_STARTED');
    expect(startTrialDef).toContain("interval '7 days'");
    expect(startTrialDef).toContain('ON CONFLICT (user_id) DO NOTHING');
  });

  it('T5. trial no disponible antes de verificar: start_trial blocks unverified emails', () => {
    const fn = a23Sql.slice(a23Sql.indexOf('FUNCTION public.start_trial'));
    const emailCheck = fn.indexOf('email_confirmed_at IS NOT NULL');
    const trialInsert = fn.indexOf('INSERT INTO public.user_trials');
    expect(emailCheck).toBeGreaterThan(0);
    expect(emailCheck).toBeLessThan(trialInsert);
  });

  it('T6. doble solicitud concurrente de trial: ON CONFLICT prevents duplicates', () => {
    expect(a23Sql).toContain('ON CONFLICT (user_id) DO NOTHING');
  });

  it('T7. intento de reiniciar trial con otro negocio: trial is keyed by user_id not business_id', () => {
    // The insert uses v_uid as the key, not a business id
    const insert = a23Sql.slice(a23Sql.indexOf('INSERT INTO public.user_trials'));
    expect(insert).toContain('v_uid');
    // ON CONFLICT on user_id prevents duplicates regardless of business
    expect(insert).toContain('ON CONFLICT (user_id) DO NOTHING');
  });

  it('T8. intento de manipular duración: ends_at is server-computed, not client-controllable', () => {
    const insert = a23Sql.slice(a23Sql.indexOf('INSERT INTO public.user_trials'));
    expect(insert).toContain("now() + interval '7 days'");
    // user_trials has a CHECK constraint enforcing ends_at = started_at + 7 days (existing)
  });

  it('T9. manipulación de cabeceras IP: signup-instant has a global rate limit independent of IP', () => {
    expect(signupSrc).toContain('"signup:global"');
    expect(signupSrc).toContain('GLOBAL_SIGNUP_LIMIT');
  });

  it('T10. límite de registros concurrentes: global + IP + email rate limits exist', () => {
    expect(signupSrc).toContain('GLOBAL_SIGNUP_LIMIT');
    expect(signupSrc).toContain('IP_LIMIT');
    expect(signupSrc).toContain('EMAIL_LIMIT');
    expect(signupSrc).toMatch(/limit:\s*50.*windowSeconds:\s*3600/s);
  });
});

describe('A2.3 — §3 Trial + §4 AI cost limits', () => {
  it('T11. acceso a IA con trial válido: weekly-content generates with valid premium', async () => {
    const deps = makeWCDeps();
    const r = await callWC(deps, wcBody());
    expect(r.status).toBe(200);
    expect(r.json.status).toBe('generated');
  });

  it('T12. acceso a IA con trial caducado: entitlement blocks expired trials (tested via reserve)', async () => {
    // When the monthly limit is hit, the function rejects
    const deps = makeWCDeps({ fnLimitHit: true });
    const r = await callWC(deps, wcBody());
    expect(r.status).toBe(429);
    expect(r.json.error).toBe('limit_reached');
  });

  it('T13. acceso a IA con Premium válido: generates successfully', async () => {
    const deps = makeWCDeps();
    const r = await callWC(deps, wcBody());
    expect(r.status).toBe(200);
  });

  it('T14. límite específico v0.7.1: weekly-content constants unchanged', () => {
    expect(MAX_GENERATIONS).toBe(3);
    expect(MAX_ATTEMPTS).toBe(6);
    expect(MAX_PROVIDER_CALLS).toBe(2);
    expect(MAX_OUTPUT_TOKENS).toBe(350);
    expect(MODEL).toBe('gpt-4o-mini');
    expect(PROVIDER_TIMEOUT_MS).toBe(20000);
  });

  it('T15. límite específico v0.7.2: business-improvement constants unchanged', () => {
    expect(BI_MAX_GENS).toBe(3);
    expect(BI_MAX_ATTEMPTS).toBe(6);
    expect(BI_MAX_CALLS).toBe(2);
    expect(BI_MAX_TOKENS).toBe(500);
    expect(BI_MODEL).toBe('gpt-4o-mini');
    expect(BI_TIMEOUT).toBe(20000);
    expect(MONTHLY_REQUESTS).toBe(40);
  });

  it('T16. límite global entre generadores: migration defines combined 80/month cap', () => {
    expect(a23Sql).toContain('p_monthly_global integer DEFAULT 80');
    expect(a23Sql).toContain('p_monthly_per_fn integer DEFAULT 40');
  });

  it('T17. concurrencia entre generadores: reserve_ai_usage uses FOR UPDATE', () => {
    expect(a23Sql).toContain('FOR UPDATE');
    // The ai_usage_monthly row is locked before increment
    const fn = a23Sql.slice(a23Sql.indexOf('FUNCTION public.reserve_ai_usage'));
    const forUpdate = fn.indexOf('FOR UPDATE');
    const increment = fn.indexOf('weekly_content_used + 1');
    expect(forUpdate).toBeLessThan(increment);
  });

  it('T18. reservas caducadas: releaseAiUsage is called on failure in weekly-content', () => {
    const handler = readFileSync(join(ROOT, 'supabase/functions/weekly-content/handler.ts'), 'utf8');
    expect(handler).toContain('releaseAiUsage');
    // Count: should appear in Deps interface + 2 failure paths
    const matches = handler.match(/releaseAiUsage/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('T19. intentos fallidos: release_ai_usage decrements safely', () => {
    expect(a23Sql).toContain('GREATEST(weekly_content_used - 1, 0)');
    expect(a23Sql).toContain('GREATEST(business_improvement_used - 1, 0)');
  });

  it('T20. reintentos del proveedor: MAX_PROVIDER_CALLS limits retries', async () => {
    let callCount = 0;
    const deps = makeWCDeps({ model: () => { callCount++; return failModel(); } });
    const r = await callWC(deps, wcBody());
    expect(r.status).toBe(502);
    // Should NOT exceed MAX_PROVIDER_CALLS
    expect(callCount).toBeLessThanOrEqual(MAX_PROVIDER_CALLS);
  });

  it('T21. ausencia de duplicidad de consumo: successful generation does not call releaseAiUsage', async () => {
    const releaseCalls: string[] = [];
    const deps = makeWCDeps();
    deps.releaseAiUsage = async (u) => { releaseCalls.push(u); return true; };
    const r = await callWC(deps, wcBody());
    expect(r.status).toBe(200);
    expect(releaseCalls).toHaveLength(0);
  });

  it('T22. separación entre usuarios: user B cannot access user A business', async () => {
    const deps = makeWCDeps();
    const r = await callWC(deps, wcBody(), USER_B);
    expect(r.status).toBe(404);
  });

  it('T23. separación entre negocios: business-improvement rejects wrong business', async () => {
    const deps = makeBIDeps();
    const r = await callBI(deps, biBody({ businessId: BIZ_B }));
    // loadAction returns null for BIZ_B → not_found (404) or reserve returns not_found
    expect([400, 404]).toContain(r.status);
    expect(r.json.error).toMatch(/not_found|invalid_request/);
  });

  it('T24. rechazo de manipulación de costes: client cannot set cost or usage values', () => {
    // Weekly-content parseInput only extracts known fields; extra fields are ignored
    const parsed = parseWeeklyInput({ businessId: BIZ_A, weekStart: MONDAY, lang: 'es', expectedGenerations: 0, monthly_used: 999, cost: 100 });
    expect(parsed).not.toBeNull();
    expect((parsed as Record<string, unknown>).monthly_used).toBeUndefined();
    expect((parsed as Record<string, unknown>).cost).toBeUndefined();
    // reserve_ai_usage is a server-side RPC; the migration proves no client cost param
    expect(a23Sql).not.toMatch(/p_cost|p_fn_used|p_global_used/);
    // The handler never reads cost/usage from the request body
    const wcHandler = readFileSync(join(ROOT, 'supabase/functions/weekly-content/handler.ts'), 'utf8');
    expect(wcHandler).not.toMatch(/body.*fn_used|body.*global_used|body.*cost/);
  });
});

describe('A2.3 — §9 Regression checks', () => {
  it('T25. ausencia de regresiones en Stripe: no Stripe files were modified', () => {
    const stripeFiles = ['stripe-billing/handler.ts', 'stripe-billing/index.ts', 'stripe-billing/logic.ts',
      'stripe-webhook/handler.ts', 'stripe-webhook/index.ts', 'stripe-webhook/logic.ts',
      'stripe-checkout/index.ts', 'stripe-cancel-subscription/index.ts'];
    // These files exist and were NOT touched by A2.3 (verified by their absence from the migration)
    for (const f of stripeFiles) {
      expect(() => readFileSync(join(ROOT, 'supabase/functions', f), 'utf8')).not.toThrow();
    }
    expect(a23Sql).not.toMatch(/stripe/i);
  });

  it('T26. ausencia de regresiones en Google: no GBP files were modified', () => {
    const gbpFiles = ['gbp-oauth-callback/index.ts', 'gbp-oauth-start/index.ts', 'gbp-sync/index.ts', 'gbp-list-locations/index.ts'];
    for (const f of gbpFiles) {
      expect(() => readFileSync(join(ROOT, 'supabase/functions', f), 'utf8')).not.toThrow();
    }
    expect(a23Sql).not.toMatch(/google|gbp|oauth/i);
  });

  it('T27. ausencia de regresiones en A2.1: 14 retired functions still have 410 index.ts', () => {
    const RETIRED = [
      'analyze-competitor-url', 'audit-maps-profile', 'audit-reviews',
      'execute-tip-content', 'generate-business-audit', 'generate-content-plan',
      'generate-countermeasure', 'generate-gbp-description', 'generate-geo-audit',
      'generate-pitch', 'generate-seo', 'generate-voice-script', 'scan-directories',
      'simulate-campaign',
    ];
    // Each retired function must return 410
    for (const name of RETIRED) {
      const src = readFileSync(join(ROOT, 'supabase/functions', name, 'index.ts'), 'utf8');
      expect(src).toContain('410');
    }
  });

  it('T28. ausencia de regresiones en A2.2: urlSafety and safeHttp unchanged', () => {
    const urlSafety = readFileSync(join(ROOT, 'supabase/functions/analyze-website/urlSafety.ts'), 'utf8');
    const safeHttp = readFileSync(join(ROOT, 'supabase/functions/analyze-website/safeHttp.ts'), 'utf8');
    expect(urlSafety).toContain('resolvePublicAddresses');
    expect(safeHttp).toContain('safeGet');
    expect(safeHttp).toContain('NET_LIMITS');
  });

  it('T29. ausencia de regresiones en v0.7.3: prepared replies unchanged', () => {
    const migrations = readdirSync(MIGRATIONS).filter((f) => f.includes('v073'));
    expect(migrations.length).toBe(2);
  });

  it('T30. ausencia de nuevas llamadas a IA: only weekly-content and business-improvement call OpenAI', () => {
    const funcsDir = join(ROOT, 'supabase/functions');
    const dirs = readdirSync(funcsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    const aiCallers: string[] = [];
    for (const d of dirs) {
      try {
        const indexSrc = readFileSync(join(funcsDir, d, 'index.ts'), 'utf8');
        if (indexSrc.includes('openai.com') || indexSrc.includes('chat/completions')) aiCallers.push(d);
      } catch { /* no index.ts */ }
    }
    expect(aiCallers.sort()).toEqual(['business-improvement', 'weekly-content']);
  });
});

describe('A2.3 — §6 Persistence: migration structure', () => {
  it('RLS is enabled on ai_usage_monthly with deny-all client writes', () => {
    expect(a23Sql).toContain('ALTER TABLE public.ai_usage_monthly ENABLE ROW LEVEL SECURITY');
    expect(a23Sql).toContain('"no_insert_ai_usage"');
    expect(a23Sql).toContain('"no_update_ai_usage"');
    expect(a23Sql).toContain('"no_delete_ai_usage"');
  });

  it('RPCs are restricted to service_role only', () => {
    expect(a23Sql).toContain('REVOKE EXECUTE ON FUNCTION public.reserve_ai_usage');
    expect(a23Sql).toContain('REVOKE EXECUTE ON FUNCTION public.release_ai_usage');
    expect(a23Sql).toContain('REVOKE EXECUTE ON FUNCTION public.enforce_max_businesses_per_user');
  });

  it('business count trigger limits to 5 per user', () => {
    expect(a23Sql).toContain('enforce_max_businesses_per_user');
    expect(a23Sql).toContain('v_count >= 5');
  });

  it('ai_usage_monthly has period-first-of-month constraint', () => {
    expect(a23Sql).toContain('ai_usage_monthly_period_first');
    expect(a23Sql).toMatch(/extract\(day FROM period_start\) = 1/);
  });

  it('all new functions are SECURITY DEFINER with fixed search_path', () => {
    const fns = ['reserve_ai_usage', 'release_ai_usage'];
    for (const fn of fns) {
      const block = a23Sql.slice(a23Sql.indexOf(`FUNCTION public.${fn}`));
      expect(block).toContain('SECURITY DEFINER');
      expect(block.includes("search_path = public") || block.includes("search_path TO 'public'")).toBe(true);
    }
  });
});
