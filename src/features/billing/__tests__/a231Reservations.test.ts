/**
 * A2.3.1 — identified AI reservations, business cap serialization, signup breaker.
 * Handler behaviour is exercised with mocks; database behaviour is asserted on the migration
 * source here and was executed against the real database in a rolled-back block (see report).
 * No real accounts, no OpenAI calls.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  generate as generateWeekly, type AiOutcome, type Deps as WCDeps, type ModelResult, type Reservation as WCReservation,
} from '../../../../supabase/functions/weekly-content/handler.ts';
import {
  generate as generateImprovement, type Deps as BIDeps, type Reservation as BIReservation,
} from '../../../../supabase/functions/business-improvement/handler.ts';
import { MAX_GENERATIONS, MAX_ATTEMPTS, MAX_PROVIDER_CALLS } from '../../../../supabase/functions/weekly-content/logic.ts';
import { MONTHLY_REQUESTS } from '../../../../supabase/functions/business-improvement/logic.ts';

const ROOT = join(__dirname, '../../../..');
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const read = (f: string) => readFileSync(join(MIGRATIONS, f), 'utf8');
const ledgerSql = read(readdirSync(MIGRATIONS).find((f) => f.includes('a231_ai_reservation'))!);
const breakerSql = read(readdirSync(MIGRATIONS).find((f) => f.includes('a231_signup_created'))!);
const signupSrc = readFileSync(join(ROOT, 'supabase/functions/signup-instant/index.ts'), 'utf8');

const fnBody = (name: string) => {
  const start = ledgerSql.indexOf(`FUNCTION public.${name}(`);
  return ledgerSql.slice(start, ledgerSql.indexOf('$$;', start));
};

const USER = '00000000-0000-4000-a000-000000000001';
const BIZ = '00000000-0000-4000-b000-000000000001';
const ACT = '00000000-0000-4000-8000-000000000001';
const NOW = new Date('2026-10-06T10:00:00Z');
const COMPLETE = { name: 'Test', category: 'SEO', city: 'Madrid', services: ['Web'], target_audience: 'Pymes' };
const GOOD = '{"text":"' + 'La agencia Test en Madrid ofrece servicios de Web para Pymes. '.repeat(5).trim() + '"}';

type Settle = { reservation: string; outcome: AiOutcome };

function wcDeps(opts: { model?: () => ModelResult; reserve?: () => Promise<WCReservation>; save?: boolean } = {}) {
  const settled: Settle[] = [];
  let calls = 0;
  let seq = 0;
  const deps: WCDeps = {
    loadBusiness: async () => COMPLETE,
    reserve: opts.reserve ?? (async () => ({
      status: 'reserved', id: `d-${++seq}`, reservation: `res-${seq}`, generations: 0, attempts: 1, topics_used: [], recent_topics: [],
    })),
    complete: async () => opts.save ?? true,
    release: async () => true,
    settleAiUsage: async (_u, reservation, outcome) => { settled.push({ reservation, outcome }); return true; },
    callModel: async () => { calls++; return opts.model ? opts.model() : { ok: true, raw: GOOD }; },
    now: () => NOW,
  };
  return { deps, settled, calls: () => calls };
}

function biDeps(opts: { model?: () => ModelResult; status?: string; save?: boolean } = {}) {
  const settled: Settle[] = [];
  let calls = 0;
  const deps: BIDeps = {
    loadAction: async () => ({ rule_id: 'optimize_services_keywords', status: 'PENDING', metadata: null }),
    loadBusiness: async () => COMPLETE,
    reserve: async () => (opts.status
      ? ({ status: opts.status, fn_used: 40, global_used: 80, generations: 0 } as unknown as BIReservation)
      : { status: 'reserved', id: 'bi-1', reservation: 'bres-1', generations: 0, attempts: 1, global_used: 1 }),
    complete: async () => opts.save ?? true,
    release: async () => true,
    settleAiUsage: async (_u, reservation, outcome) => { settled.push({ reservation, outcome }); return true; },
    callModel: async () => { calls++; return opts.model ? opts.model() : { ok: true, raw: GOOD }; },
  };
  return { deps, settled, calls: () => calls };
}

const wcBody = { businessId: BIZ, weekStart: '2026-10-05', lang: 'es', expectedGenerations: 0 };
const biBody = { businessId: BIZ, actionId: ACT, lang: 'es', mode: 'create', expectedGenerations: 0 };

describe('A2.3.1 §1 — identified, idempotent AI reservations (database rules)', () => {
  it('1. double release: only a reservation still in "reserved" can be released', () => {
    const settle = fnBody('settle_ai_usage');
    expect(settle).toContain("IF v_res.status = 'reserved' THEN");
    expect(settle).toContain("ELSIF v_res.status = 'expired' AND p_outcome <> 'released' THEN");
    expect(settle).toContain('RETURN false');
  });

  it('2. release after complete: released is never accepted from a settled state', () => {
    const settle = fnBody('settle_ai_usage');
    expect(settle).toContain("p_outcome NOT IN ('completed', 'consumed', 'released')");
    const guard = settle.slice(settle.indexOf("IF v_res.status = 'reserved'"), settle.indexOf('UPDATE public.ai_usage_reservations'));
    expect(guard).not.toContain("'completed'");
    expect(guard).toContain('RETURN false');
  });

  it('3. two concurrent reservations of the same user serialize on the month row', () => {
    const reserve = fnBody('reserve_ai_usage');
    expect(reserve.indexOf('FOR UPDATE')).toBeGreaterThan(0);
    expect(reserve.indexOf('FOR UPDATE')).toBeLessThan(reserve.indexOf('INSERT INTO public.ai_usage_reservations'));
    expect(reserve).toContain('ON CONFLICT (id) DO NOTHING');
  });

  it('4. release of another month: the decrement targets the reservation period, not the current month', () => {
    const settle = fnBody('settle_ai_usage');
    expect(settle).toContain('period_start = v_period');
    expect(settle).not.toMatch(/date_trunc\('month'/);
  });

  it('5. abandoned reservation: expires after 10 minutes, stays counted and cannot be released', () => {
    expect(fnBody('reserve_ai_usage')).toContain("interval '10 minutes'");
    expect(fnBody('reconcile_ai_usage')).toContain("interval '10 minutes'");
    expect(fnBody('reconcile_ai_usage')).toMatch(/GREATEST\(m\.weekly_content_used, l\.wc\)/);
  });

  it('a reservation is bound to its owner and the client never supplies ids, counters or states', () => {
    expect(fnBody('settle_ai_usage')).toContain('p_user_id');
    expect(ledgerSql).toContain('"no_insert_ai_reservations"');
    expect(ledgerSql).toContain('"no_update_ai_reservations"');
    expect(ledgerSql).toContain('"no_delete_ai_reservations"');
    expect(ledgerSql).toContain('REVOKE ALL ON FUNCTION public.settle_ai_usage(uuid, uuid, text) FROM PUBLIC, anon, authenticated');
    const clientGrants = [...ledgerSql.matchAll(/GRANT EXECUTE ON FUNCTION public\.(\w+)\([^)]*\) TO (anon|authenticated)/g)].map((m) => m[1]);
    expect(clientGrants).toEqual(['start_trial']);
  });

  it('the AI unit is reserved only after all draft checks pass', () => {
    const wc = fnBody('reserve_weekly_content');
    expect(wc.indexOf('reserve_ai_usage(')).toBeGreaterThan(wc.indexOf("'attempts'"));
    expect(wc.indexOf('reserve_ai_usage(')).toBeLessThan(wc.indexOf('SET generating_since = now()'));
    const bi = fnBody('reserve_business_improvement');
    expect(bi.indexOf('reserve_ai_usage(')).toBeGreaterThan(bi.indexOf("'edited'"));
  });
});

describe('A2.3.1 §1 — handlers settle the exact reservation', () => {
  it('6. provider error: nothing billed, the unit is released and the call count stays bounded', async () => {
    const { deps, settled, calls } = wcDeps({ model: () => ({ ok: false, retryable: true }) });
    const res = await generateWeekly(USER, wcBody, deps);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('ai_unavailable');
    expect(calls()).toBe(MAX_PROVIDER_CALLS);
    expect(settled).toEqual([{ reservation: 'res-1', outcome: 'released' }]);
  });

  it('6b. provider answered but output was rejected: tokens were spent, the unit stays consumed', async () => {
    const { deps, settled } = wcDeps({ model: () => ({ ok: true, raw: '{"text":"short"}' }) });
    const res = await generateWeekly(USER, wcBody, deps);
    expect(res.status).toBe(502);
    expect(settled).toEqual([{ reservation: 'res-1', outcome: 'consumed' }]);
  });

  it('7. persistence error after generating: the unit is consumed, not released', async () => {
    const wc = wcDeps({ save: false });
    expect((await generateWeekly(USER, wcBody, wc.deps)).status).toBe(500);
    expect(wc.settled).toEqual([{ reservation: 'res-1', outcome: 'consumed' }]);
    const bi = biDeps({ save: false });
    expect((await generateImprovement(USER, biBody, bi.deps)).status).toBe(500);
    expect(bi.settled).toEqual([{ reservation: 'bres-1', outcome: 'consumed' }]);
  });

  it('8. both generators at the same time: each settles only its own reservation', async () => {
    const wc = wcDeps();
    const bi = biDeps();
    const [a, b] = await Promise.all([generateWeekly(USER, wcBody, wc.deps), generateImprovement(USER, biBody, bi.deps)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(wc.settled).toEqual([{ reservation: 'res-1', outcome: 'completed' }]);
    expect(bi.settled).toEqual([{ reservation: 'bres-1', outcome: 'completed' }]);
  });

  it('8b. monthly caps answer monthly_limit without calling the AI or settling anything', async () => {
    for (const status of ['fn_limit', 'global_limit'] as const) {
      const wc = wcDeps({ reserve: async () => ({ status, fn_used: 40, global_used: 80 }) });
      const r = await generateWeekly(USER, wcBody, wc.deps);
      expect(r.status).toBe(429);
      expect((await r.json()).error).toBe('monthly_limit');
      expect(wc.calls()).toBe(0);
      expect(wc.settled).toHaveLength(0);
      const bi = biDeps({ status });
      const s = await generateImprovement(USER, biBody, bi.deps);
      expect((await s.json()).error).toBe('monthly_limit');
      expect(bi.calls()).toBe(0);
    }
  });

  it('3b. two simultaneous requests: the busy one never touches the AI or another reservation', async () => {
    let first = true;
    const wc = wcDeps({
      reserve: async () => {
        if (first) { first = false; return { status: 'reserved', id: 'd-1', reservation: 'res-1', generations: 0, attempts: 1, topics_used: [], recent_topics: [] }; }
        return { status: 'busy', generations: 0 };
      },
    });
    const [a, b] = await Promise.all([generateWeekly(USER, wcBody, wc.deps), generateWeekly(USER, wcBody, wc.deps)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(wc.calls()).toBe(1);
    expect(wc.settled).toEqual([{ reservation: 'res-1', outcome: 'completed' }]);
  });

  it('the weekly 3-versions limit keeps its own message, distinct from the monthly cap', async () => {
    const wc = wcDeps({ reserve: async () => ({ status: 'limit', generations: 3 }) });
    expect((await (await generateWeekly(USER, wcBody, wc.deps)).json()).error).toBe('limit_reached');
  });
});

describe('A2.3.1 §2 — maximum five businesses per user', () => {
  const trigger = fnBody('enforce_max_businesses_per_user');

  it('9. concurrent 5th and 6th inserts serialize on a per-user transaction lock before counting', () => {
    expect(trigger).toContain("pg_advisory_xact_lock(hashtextextended('businesses_per_user:' || NEW.user_id::text, 0))");
    expect(trigger.indexOf('pg_advisory_xact_lock')).toBeLessThan(trigger.indexOf('count('));
    expect(trigger).toContain('v_count >= 5');
    expect(trigger).toContain("current_setting('transaction_isolation') <> 'read committed'");
  });

  it('no existing business is modified or deleted', () => {
    expect(ledgerSql).not.toMatch(/DELETE FROM public\.businesses|UPDATE public\.businesses/);
  });
});

describe('A2.3.1 §3 — signup cannot be saturated through the global limit', () => {
  it('10. malicious saturation: per-IP and per-email limits run first, global counts created accounts only', () => {
    const ip = signupSrc.indexOf('signup:ip:');
    const email = signupSrc.indexOf('signup:email:');
    const global = signupSrc.indexOf('await createdRecently(');
    const create = signupSrc.indexOf('admin.createUser(');
    expect(ip).toBeLessThan(email);
    expect(email).toBeLessThan(global);
    expect(global).toBeLessThan(create);
    expect(signupSrc).not.toContain('signup:global');
    expect(breakerSql).toContain("raw_app_meta_data ->> 'signup_source' = 'signup-instant'");
  });

  it('input is validated before any limit is consumed', () => {
    expect(signupSrc.indexOf('invalid_input')).toBeLessThan(signupSrc.indexOf('withinLimit(supabaseUrl'));
  });

  it('11. direct Supabase Auth signups cannot drain the breaker (only server-tagged accounts count)', () => {
    expect(signupSrc).toMatch(/app_metadata:\s*\{\s*signup_source:\s*SIGNUP_SOURCE\s*\}/);
    expect(breakerSql).toContain('REVOKE ALL ON FUNCTION public.signup_created_recently(int) FROM PUBLIC, anon, authenticated');
    expect(breakerSql).toContain('GRANT EXECUTE ON FUNCTION public.signup_created_recently(int) TO service_role');
  });

  it('new accounts remain usable: confirmation is set so the immediate sign-in succeeds', () => {
    expect(signupSrc).toMatch(/email_confirm:\s*true/);
  });
});

describe('A2.3.1 — 12. earlier commercial limits are preserved', () => {
  it('weekly content: 3 versions, 6 attempts, 2 provider calls', () => {
    expect([MAX_GENERATIONS, MAX_ATTEMPTS, MAX_PROVIDER_CALLS]).toEqual([3, 6, 2]);
  });

  it('business improvement: legacy monthly 40 requests, 16 service drafts, 3 versions', () => {
    expect(MONTHLY_REQUESTS).toBe(40);
    const bi = fnBody('reserve_business_improvement');
    expect(bi).toContain('u.requests < 40');
    expect(bi).toContain('>= 16');
  });

  it('monthly AI caps remain 40 per function and 80 combined', () => {
    const reserve = fnBody('reserve_ai_usage');
    expect(reserve).toContain('c_per_fn constant integer := 40');
    expect(reserve).toContain('c_global constant integer := 80');
  });
});
