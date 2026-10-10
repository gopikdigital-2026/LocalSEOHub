import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMPATIBLE_RULES as SERVER_RULES, MAX_ATTEMPTS, MAX_GENERATIONS, MAX_OUTPUT_TOKENS, MAX_PROVIDER_CALLS, MODEL,
  MONTHLY_REQUESTS, isDeclaredService, normalizeKeyPart, resolveTarget, sanitizeFacts,
} from '../../../../supabase/functions/business-improvement/logic.ts';
import { COMPATIBLE_RULES, improvementTarget } from '../model';

const ROOT = join(__dirname, '../../../..');
const MIGRATIONS = join(ROOT, 'supabase/migrations');
const OLD = '20261010131105_v072_business_improvement_drafts.sql';
const V072 = '20261010131430_v072_business_improvement_drafts.sql';
const FIX = '20261010133614_fix0721_business_improvement_defensive_validation.sql';
const read = (f: string) => readFileSync(join(MIGRATIONS, f), 'utf8');
const stripComments = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');

const fixSql = stripComments(read(FIX));
const reserveBody = fixSql.slice(
  fixSql.indexOf('CREATE OR REPLACE FUNCTION public.reserve_business_improvement'),
  fixSql.indexOf('DROP FUNCTION IF EXISTS'),
);

function sqlRuleMap(sql: string): Record<string, string> {
  const start = sql.indexOf('FUNCTION public.business_improvement_rule_kind');
  const block = sql.slice(start, sql.indexOf('$$;', start));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/WHEN '([a-z_]+)' THEN '([a-z_]+)'/g)) out[m[1]] = m[2];
  return out;
}

const RESERVE_7 = 'reserve_business_improvement(uuid, uuid, uuid, text, text, integer, boolean)';
const RESERVE_6 = 'reserve_business_improvement(uuid, uuid, uuid, text, text, integer)';

describe('FIX 07.2.1 - incompatible rules', () => {
  it('SQL mapping contains exactly the three compatible rules, identical to server and client', () => {
    const map = sqlRuleMap(fixSql);
    expect(map).toEqual(SERVER_RULES);
    expect(map).toEqual(COMPATIBLE_RULES);
    expect(Object.keys(map)).toHaveLength(3);
  });

  it('reserve rejects any rule outside the mapping before touching drafts or usage', () => {
    const check = reserveBody.indexOf("v_kind IS NULL OR v_kind <> p_kind");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(reserveBody.indexOf('INSERT INTO public.business_improvement_drafts'));
    expect(check).toBeLessThan(reserveBody.indexOf('INSERT INTO public.business_improvement_usage'));
  });

  it('server and client refuse non-compatible rules', () => {
    for (const rule of ['connect_google_business', 'respond_reviews', '', 'optimize_services_keywords:x', '__proto__']) {
      expect(resolveTarget(rule, {})).toBeNull();
      expect(improvementTarget({ ruleId: rule, metadata: {} })).toBeNull();
    }
    for (const rule of ['constructor', 'toString', 'hasOwnProperty']) {
      expect(resolveTarget(rule, {})).toBeNull();
      expect(improvementTarget({ ruleId: rule, metadata: {} })).toBeNull();
      expect(Object.keys(sqlRuleMap(fixSql))).not.toContain(rule);
    }
  });
});

describe('FIX 07.2.1 - altered kinds', () => {
  it('kind comes from the action rule in the database, never from the request', () => {
    expect(reserveBody).toMatch(/v_kind := public\.business_improvement_rule_kind\(v_action\.rule_id\)/);
    expect(reserveBody).toMatch(/VALUES \(p_user_id, p_business_id, p_semantic_key, v_kind, p_action_id\)/);
    expect(reserveBody).toMatch(/IF v_row\.kind <> v_kind THEN\s+RETURN jsonb_build_object\('status', 'invalid'\)/);
  });

  it('every rule maps to one single kind', () => {
    const map = sqlRuleMap(fixSql);
    for (const [rule, kind] of Object.entries(map)) {
      const others = (['business_description', 'service_description', 'faq'] as const).filter((k) => k !== kind);
      for (const other of others) expect(map[rule]).not.toBe(other);
      expect(resolveTarget(rule, { evidence: { service: 'Tartas' } })?.kind).toBe(kind);
    }
  });
});

describe('FIX 07.2.1 - manipulated semantic keys', () => {
  it('the key must equal the key derived by the database (no prefix matching)', () => {
    expect(reserveBody).not.toMatch(/LIKE/i);
    expect(reserveBody).toMatch(/v_expected_key := v_action\.rule_id \|\| ':' \|\| v_service_part/);
    expect(reserveBody).toMatch(/v_expected_key := v_action\.rule_id;/);
    expect(reserveBody).toMatch(/IF p_semantic_key <> v_expected_key THEN\s+RETURN jsonb_build_object\('status', 'invalid'\)/);
  });

  it('service keys come from the action evidence and must be a declared service (first 8, like the server)', () => {
    expect(reserveBody).toMatch(/jsonb_typeof\(v_action\.metadata -> 'evidence' -> 'service'\) IS DISTINCT FROM 'string'/);
    expect(reserveBody).toMatch(/business_improvement_key_part\(v_action\.metadata -> 'evidence' ->> 'service'\)/);
    expect(reserveBody).toMatch(/unnest\(coalesce\(b\.services, '\{\}'::text\[\]\)\) WITH ORDINALITY/);
    expect(reserveBody).toMatch(/ORDER BY ord\s+LIMIT 8/);
    const facts = sanitizeFacts({ services: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'Noveno'] });
    expect(facts.services).toHaveLength(8);
    expect(isDeclaredService(facts, 'Noveno')).toBe(false);
  });

  it('service drafts per business are capped so rotating names cannot create unlimited counters', () => {
    expect(reserveBody).toMatch(/kind = 'service_description'\) >= 16 THEN\s+RETURN jsonb_build_object\('status', 'limit'/);
    const capAt = reserveBody.indexOf(">= 16");
    expect(capAt).toBeLessThan(reserveBody.indexOf('INSERT INTO public.business_improvement_drafts'));
    expect(reserveBody).toMatch(/NOT EXISTS \(SELECT 1 FROM public\.business_improvement_drafts WHERE business_id = p_business_id AND semantic_key = p_semantic_key\)/);
  });

  it('equivalent spellings collapse to one key, matching values observed in the database', () => {
    const dbObserved: Array<[string, string]> = [
      ['Tartas por encargo', 'tartas por encargo'],
      ['  TARTAS   por  encargo ', 'tartas por encargo'],
      ['Tartas\tpor\nencargo', 'tartas por encargo'],
      ['Ｔａｒｔａｓ por encargo', 'tartas por encargo'],
      ['Tartas\u00a0por encargo', 'tartas por encargo'],
      ['Peluquería CANINA', 'peluquería canina'],
    ];
    for (const [input, key] of dbObserved) {
      expect(resolveTarget('improve_service_description', { evidence: { service: input } })?.semanticKey)
        .toBe(`improve_service_description:${key}`);
    }
    expect(normalizeKeyPart('ab '.repeat(50)).length).toBeLessThanOrEqual(100);
  });

  it('forged or empty service evidence never yields a key', () => {
    for (const service of ['', '   ', '\u0000\u0007', 42, ['x'], { a: 1 }, null]) {
      expect(resolveTarget('improve_service_description', { evidence: { service } })).toBeNull();
    }
  });

  it('SQL key normalisation mirrors the server steps', () => {
    const fn = fixSql.slice(fixSql.indexOf('FUNCTION public.business_improvement_key_part'), fixSql.indexOf('CREATE OR REPLACE FUNCTION public.reserve'));
    expect(fn).toMatch(/\[\\x01-\\x1f\\x7f\]/);
    expect(fn).toMatch(/NFKC/);
    expect(fn).toMatch(/lower\(/);
    expect(fn).toMatch(/, 80\)/);
    expect(fn).toMatch(/, 100\)/);
    expect(fn).toMatch(/IMMUTABLE/);
  });
});

describe('FIX 07.2.1 - ownership, status and permissions are kept', () => {
  it('ownership and action status checks remain', () => {
    expect(reserveBody).toMatch(/WHERE id = p_business_id AND user_id = p_user_id/);
    expect(reserveBody).toMatch(/WHERE id = p_action_id AND user_id = p_user_id AND business_id = p_business_id/);
    expect(reserveBody).toMatch(/v_action\.status NOT IN \('PENDING', 'IN_PROGRESS'\)/);
    expect(reserveBody).toMatch(/IF v_row\.user_id <> p_user_id THEN/);
    expect(reserveBody).toMatch(/SECURITY DEFINER\s+SET search_path = public/);
  });

  it('only service_role can execute the functions', () => {
    expect(fixSql).not.toMatch(/GRANT[^;]*TO[^;]*\b(anon|authenticated|PUBLIC)\b/);
    for (const fn of [RESERVE_7, 'complete_business_improvement(uuid, uuid, uuid, text, text, text, text)',
      'release_business_improvement(uuid, uuid, uuid)', 'business_improvement_rule_kind(text)', 'business_improvement_key_part(text)']) {
      expect(fixSql).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon, authenticated;`);
      expect(fixSql).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role;`);
    }
  });

  it('no tables, policies or data are changed', () => {
    expect(fixSql).not.toMatch(/\b(CREATE|ALTER|DROP) (TABLE|POLICY)\b/);
    expect(fixSql).not.toMatch(/\bDELETE FROM\b|\bTRUNCATE\b/);
    expect(fixSql).not.toMatch(/\b(BEGIN|COMMIT|ROLLBACK);/);
  });
});

describe('FIX 07.2.1 - migrations in order', () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

  it('both v0.7.2 files are kept and run before the fix', () => {
    expect(files).toContain(OLD);
    expect(files).toContain(V072);
    expect(files.indexOf(OLD)).toBeLessThan(files.indexOf(V072));
    expect(files.indexOf(V072)).toBeLessThan(files.indexOf(FIX));
    expect(files.filter((f) => /_(v072|fix0721)_/.test(f)).pop()).toBe(FIX);
  });

  it('the obsolete 6-argument reserve is removed on both clean and existing installs', () => {
    expect(read(OLD)).toContain(`GRANT EXECUTE ON FUNCTION public.${RESERVE_6} TO service_role;`);
    expect(read(V072)).toContain(`DROP FUNCTION IF EXISTS public.${RESERVE_6};`);
    expect(fixSql).toContain(`DROP FUNCTION IF EXISTS public.${RESERVE_6};`);
  });

  it('the current definition of each function is the last file that defines it', () => {
    const last: Record<string, string> = {};
    for (const f of files) {
      for (const m of stripComments(read(f)).matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(/g)) last[m[1]] = f;
    }
    // A2.3.1 restores the fix0721 body (lost in A2.3) and adds the identified AI reservation
    expect(last.reserve_business_improvement).toMatch(/a231_ai_reservation/);
    const def = stripComments(read(last.reserve_business_improvement));
    const body = def.slice(def.indexOf('FUNCTION public.reserve_business_improvement('));
    for (const lit of ['business_improvement_rule_kind', 'business_improvement_key_part', "'closed'", "'edited'", "'stale'", "'busy'", "'attempts'", '>= 16']) {
      expect(body).toContain(lit);
    }
    expect(last.business_improvement_rule_kind).toBe(FIX);
    expect(last.business_improvement_key_part).toBe(FIX);
    expect(last.complete_business_improvement).toBe(V072);
    expect(last.release_business_improvement).toBe(V072);
    expect(last.business_improvement_drafts_before_update).toBe(V072);
  });

  it('the fix keeps the same 7-argument signature and is idempotent', () => {
    expect(fixSql).toMatch(/CREATE OR REPLACE FUNCTION public\.reserve_business_improvement\(\s*p_user_id uuid, p_business_id uuid, p_action_id uuid, p_semantic_key text, p_kind text,\s*p_expected_generations integer, p_allow_overwrite boolean\s*\)/);
    expect(fixSql.match(/CREATE FUNCTION/g)).toBeNull();
    expect(read(FIX)).toMatch(/Current definitions after this migration/);
  });
});

describe('FIX 07.2.1 - consumption limits unchanged', () => {
  it('server constants', () => {
    expect([MAX_GENERATIONS, MAX_ATTEMPTS, MONTHLY_REQUESTS, MAX_PROVIDER_CALLS, MAX_OUTPUT_TOKENS, MODEL])
      .toEqual([3, 6, 40, 2, 500, 'gpt-4o-mini']);
  });

  it('SQL limits are identical before and after the fix', () => {
    const v072 = stripComments(read(V072));
    const v072Reserve = v072.slice(v072.indexOf('CREATE OR REPLACE FUNCTION public.reserve_business_improvement'), v072.indexOf('CREATE OR REPLACE FUNCTION public.complete_business_improvement'));
    for (const literal of ['v_row.generations >= 3', "interval '90 seconds'", 'v_row.attempts >= 6', 'WHERE u.requests < 40',
      'attempts = attempts + 1', "date_trunc('month', timezone('utc', now()))", 'p_allow_overwrite IS NOT TRUE']) {
      expect(v072Reserve).toContain(literal);
      expect(reserveBody).toContain(literal);
    }
  });
});
