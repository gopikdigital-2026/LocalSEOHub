/**
 * A2.4.2-0 — generalized AI usage ledger. Database rules are asserted on the migration source;
 * the same rules were executed sequentially against the real database in a rolled-back block
 * (see auditoria-a2/A2_4_2_0_INFORME.md). True parallel concurrency is NOT exercised here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../../../..');
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const FN_DIR = join(ROOT, 'supabase/functions');
const migrationFiles = readdirSync(MIGRATIONS).sort();
const ledgerFile = migrationFiles.find((f) => f.includes('a2420_generalized_ai_usage_ledger'))!;
const sql = readFileSync(join(MIGRATIONS, ledgerFile), 'utf8');
const code = sql.slice(sql.indexOf('*/') + 2);
const a231 = readFileSync(join(MIGRATIONS, migrationFiles.find((f) => f.includes('a231_ai_reservation'))!), 'utf8');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const fnBody = (name: string) => {
  const start = code.indexOf(`FUNCTION public.${name}(`);
  return code.slice(start, code.indexOf('$$;', start));
};
const reserve = fnBody('reserve_ai_usage');
const settle = fnBody('settle_ai_usage');
const reconcile = fnBody('reconcile_ai_usage');

const LIVE = ['weekly-content', 'business-improvement'];
const FUTURE = ['seo-generator', 'business-advisor', 'voice-simulator'];
const COLUMNS = ['weekly_content_used', 'business_improvement_used', 'seo_generator_used', 'business_advisor_used', 'voice_simulator_used'];
const RETIRED = [
  'analyze-competitor-url', 'audit-maps-profile', 'audit-reviews', 'execute-tip-content',
  'generate-business-audit', 'generate-content-plan', 'generate-countermeasure', 'generate-gbp-description',
  'generate-geo-audit', 'generate-pitch', 'generate-seo', 'generate-voice-script', 'scan-directories',
  'simulate-campaign',
];

const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

describe('A2.4.2-0 — one generalized AI ledger', () => {
  it('1. weekly-content keeps its 40 cap, its own counter and its hardcoded caller', () => {
    expect(reserve).toContain("WHEN 'weekly-content' THEN 40");
    expect(reserve).toContain("weekly_content_used = weekly_content_used + (p_function = 'weekly-content')::int");
    expect(a231).toContain("reserve_ai_usage(v_token, p_user_id, 'weekly-content')");
    expect(code).not.toMatch(/FUNCTION public\.reserve_weekly_content/);
  });

  it('2. business-improvement keeps its 40 cap, its own counter and its hardcoded caller', () => {
    expect(reserve).toContain("WHEN 'business-improvement' THEN 40");
    expect(reserve).toContain("business_improvement_used = business_improvement_used + (p_function = 'business-improvement')::int");
    expect(a231).toContain("reserve_ai_usage(v_token, p_user_id, 'business-improvement')");
    expect(code).not.toMatch(/FUNCTION public\.reserve_business_improvement/);
  });

  it('3. future tools are recognised by the ledger but disabled (cap 0, no row touched)', () => {
    for (const f of [...LIVE, ...FUTURE]) expect(code).toContain(`'${f}'`);
    for (const f of FUTURE) expect(reserve).toContain(`WHEN '${f}' THEN 0`);
    const disabled = reserve.indexOf("'disabled'");
    expect(disabled).toBeGreaterThan(0);
    expect(disabled).toBeLessThan(reserve.indexOf('INSERT INTO public.ai_usage_monthly'));
  });

  it('4. an unknown function name is rejected before any write, and blocked by a CHECK', () => {
    const invalid = reserve.indexOf("IF v_fn_cap IS NULL THEN");
    expect(invalid).toBeGreaterThan(0);
    expect(invalid).toBeLessThan(reserve.indexOf('INSERT INTO'));
    expect(code).toMatch(/ai_usage_reservations_function_check\s+CHECK \(function IN \('weekly-content', 'business-improvement', 'seo-generator', 'business-advisor', 'voice-simulator'\)\)/);
    expect(reserve).not.toMatch(/\bELSE\b/);
  });

  it('5. user A cannot affect user B: every lookup and write is scoped to p_user_id, service_role only', () => {
    expect(settle).toContain('WHERE id = p_reservation_id AND user_id = p_user_id');
    expect(reserve.match(/WHERE user_id = p_user_id/g)!.length).toBeGreaterThanOrEqual(3);
    for (const f of ['reserve_ai_usage(uuid, uuid, text)', 'settle_ai_usage(uuid, uuid, text)', 'reconcile_ai_usage()']) {
      expect(code).toContain(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated`);
      expect(code).toContain(`GRANT EXECUTE ON FUNCTION public.${f} TO service_role`);
    }
  });

  it('6. reservation is atomic: the month row is locked before counting and before inserting', () => {
    const lock = reserve.indexOf('FOR UPDATE');
    expect(lock).toBeGreaterThan(0);
    expect(lock).toBeLessThan(reserve.indexOf('v_global_used :='));
    expect(lock).toBeLessThan(reserve.indexOf('INSERT INTO public.ai_usage_reservations'));
  });

  it('7. concurrency (static): limits are checked under the row lock; settle uses the same lock order', () => {
    expect(reserve.indexOf('FOR UPDATE')).toBeLessThan(reserve.indexOf('IF v_fn_used >= v_fn_cap'));
    const monthLock = settle.indexOf('FROM public.ai_usage_monthly');
    const resLock = settle.lastIndexOf('FOR UPDATE');
    expect(monthLock).toBeLessThan(resLock);
  });

  it('8. idempotency: a reused reservation id never counts twice', () => {
    const insert = reserve.indexOf('ON CONFLICT (id) DO NOTHING');
    expect(insert).toBeGreaterThan(0);
    const notFound = reserve.indexOf('IF NOT FOUND THEN', insert);
    expect(notFound).toBeGreaterThan(insert);
    expect(notFound).toBeLessThan(reserve.indexOf('UPDATE public.ai_usage_monthly SET'));
  });

  it('9. settlement: only completed/consumed/released, only from reserved (or expired, never released)', () => {
    expect(settle).toContain("p_outcome NOT IN ('completed', 'consumed', 'released')");
    expect(settle).toContain("IF v_res.status = 'reserved' THEN");
    expect(settle).toContain("ELSIF v_res.status = 'expired' AND p_outcome <> 'released' THEN");
  });

  it('10. release decrements only the reservation own counter in its own month; reconcile covers all counters', () => {
    for (const c of COLUMNS) {
      expect(settle).toMatch(new RegExp(`${c} = GREATEST\\(${c} - \\(v_res\\.function = '[a-z-]+'\\)::int, 0\\)`));
      expect(reconcile).toMatch(new RegExp(`${c} = GREATEST\\(m\\.${c}, l\\.[a-z]{2}\\)`));
    }
    expect(settle).toContain('period_start = v_res.period_start');
    expect(reconcile).toContain("interval '10 minutes'");
  });

  it('11. no negative counters: decrements are clamped and every new counter has a >= 0 CHECK', () => {
    expect(code).toContain('CHECK (seo_generator_used >= 0 AND business_advisor_used >= 0 AND voice_simulator_used >= 0)');
    expect(code).not.toContain('DROP CONSTRAINT IF EXISTS ai_usage_monthly_non_negative');
    expect(settle.match(/GREATEST\(/g)).toHaveLength(COLUMNS.length);
  });

  it('12. the global cap stays 80 and sums every counter, so new names never raise the budget', () => {
    expect(reserve).toContain('c_global constant integer := 80');
    expect(reserve.match(/:= \d+/g)).toEqual([':= 80']);
    const global = reserve.slice(reserve.indexOf('v_global_used :='), reserve.indexOf(';', reserve.indexOf('v_global_used :=')));
    for (const c of COLUMNS) expect(global).toContain(`v_row.${c}`);
    const caps = [...reserve.matchAll(/WHEN '[a-z-]+' THEN (\d+)/g)].map((m) => Number(m[1]));
    expect(caps.reduce((a, b) => a + b, 0)).toBe(80);
  });
});

describe('A2.4.2-0 — nothing new is reachable', () => {
  it('13. the 14 retired Edge Functions still answer 410 Gone', () => {
    for (const fn of RETIRED) {
      const body = readFileSync(join(FN_DIR, fn, 'index.ts'), 'utf8');
      expect(body).toContain('status: 410');
      expect(body).not.toMatch(/openai|fetch\(/i);
    }
  });

  it('14. /herramientas executes no AI itself; only the SEO, Maps, Twin, GEO and Advisor cards are enabled (A2.4.6)', () => {
    const page = src('src/features/tools/ToolsPage.tsx');
    const catalog = src('src/features/tools/catalog.ts');
    expect(catalog.match(/enabled:\s*true,/g)).toHaveLength(5);
    expect(page).not.toMatch(/fetch\(|functions\.invoke|supabase|onClick/);
    expect(page).toContain('disabled');
  });

  it('15. no AI provider is called from the frontend and no ledger RPC is referenced there', () => {
    const files = walk(join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('__tests__'));
    for (const f of files) {
      const s = readFileSync(f, 'utf8');
      expect(s, f).not.toMatch(/api\.openai\.com|LocalSEO_KEY|reserve_ai_usage|settle_ai_usage|reconcile_ai_usage/);
      expect(s, f).not.toMatch(/functions\.invoke\(['"](seo-generator|business-advisor|voice-simulator)['"]/);
    }
    for (const f of FUTURE) expect(readdirSync(FN_DIR)).not.toContain(f);
  });

  it('16. signup/trial unchanged: this migration never touches signup, trial or billing', () => {
    expect(code).not.toMatch(/start_trial|billing_state_for|signup|auth\.users\b(?! ?\()/);
    const signup = src('supabase/functions/signup-instant/index.ts');
    expect(signup).toMatch(/email_confirm:\s*true/);
    expect(signup).toContain('const IP_LIMIT = { limit: 10, windowSeconds: 3600 }');
    expect(signup).toContain('const GLOBAL_CREATED_LIMIT = { limit: 50, windowSeconds: 3600 }');
  });

  it('17. the migration preserves existing data: additive only, no reset, no deletes, latest in order', () => {
    expect(migrationFiles.indexOf(ledgerFile)).toBeGreaterThanOrEqual(migrationFiles.length - 3);
    expect(code).not.toMatch(/DROP\s+(TABLE|COLUMN)|TRUNCATE|DELETE\s+FROM|ALTER\s+COLUMN|RENAME/i);
    for (const c of COLUMNS.slice(2)) expect(code).toContain(`ADD COLUMN IF NOT EXISTS ${c} integer NOT NULL DEFAULT 0`);
    expect(code).not.toMatch(/SET (weekly_content_used|business_improvement_used) = 0/);
  });
});
