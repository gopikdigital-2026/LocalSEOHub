import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { requirePremium, type EntitlementDecision } from '../../../../supabase/functions/publication-proposals/entitlement.ts';
import { isArmed } from '../../../../supabase/functions/meta-publishing/facebookPublish.ts';
import { parseBillingStatus } from '../model';

const ROOT = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const MIG_DIR = join(ROOT, 'supabase/migrations');
const migFile = readdirSync(MIG_DIR).find((f) => f.endsWith('_a3742_internal_test_entitlement.sql'))!;
const sql = read(`supabase/migrations/${migFile}`);
const code = sql.replace(/\/\*[\s\S]*?\*\//g, '');
const proposalsSql = read(`supabase/migrations/${readdirSync(MIG_DIR).find((f) => f.endsWith('_a372_publication_proposals_engine.sql'))}`);
const laterMigrations = readdirSync(MIG_DIR).filter((f) => f > migFile);

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const CORS = { 'Access-Control-Allow-Origin': '*' };

function gate(decisions: Record<string, EntitlementDecision>) {
  return requirePremium(new Request('https://x', { headers: { Authorization: 'Bearer t' } }), 'publication-proposals', CORS, {
    resolveUserId: async () => USER,
    authorize: async (uid) => decisions[uid] ?? 'premium_required',
  });
}

describe('A3.7.4.2 FIX02 · internal owner/admin E2E entitlement', () => {
  it('is the latest definition of billing_state_for', () => {
    expect(migFile).toBeTruthy();
    for (const f of laterMigrations) expect(read(`supabase/migrations/${f}`)).not.toMatch(/FUNCTION public\.billing_state_for/);
  });

  it('1/2. trial and subscription state rules are byte-identical; free and expired users still resolve non-premium', () => {
    for (const rule of [
      "WHEN v_status IN ('active', 'trialing') AND v_cancel THEN 'SUBSCRIPTION_CANCELING'",
      "WHEN v_status IN ('active', 'trialing') THEN 'SUBSCRIPTION_ACTIVE'",
      "WHEN v_trial_end IS NOT NULL AND v_now < v_trial_end THEN 'TRIAL_ACTIVE'",
      "WHEN v_trial_end IS NOT NULL THEN 'TRIAL_EXPIRED'",
      "ELSE 'TRIAL_NOT_STARTED'",
    ]) expect(code).toContain(rule);
    expect(code).toContain("'has_premium', v_state IN ('TRIAL_ACTIVE', 'SUBSCRIPTION_ACTIVE', 'SUBSCRIPTION_CANCELING') OR v_internal");
  });

  it('3. a real subscription is still allowed through the unchanged gate', async () => {
    expect(await gate({ [USER]: 'ok' })).toEqual({ ok: true, userId: USER });
  });

  it('1/2. premium_required still maps to 403', async () => {
    const r = await gate({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it('4/5/6. only an active, unexpired, unrevoked row of the fixed purpose counts', () => {
    expect(code).toMatch(/e\.user_id = p_user_id/);
    expect(code).toMatch(/e\.purpose = 'internal_owner_e2e'/);
    expect(code).toMatch(/e\.revoked_at IS NULL/);
    expect(code).toMatch(/e\.expires_at > now\(\)/);
    expect(code).toContain("CHECK (expires_at > created_at AND expires_at <= created_at + interval '72 hours')");
    expect(code).toContain("CHECK (purpose = 'internal_owner_e2e')");
  });

  it('7. the grant is keyed on the resolved user id, never on browser input or email', async () => {
    expect(code).toContain('v_internal := public.internal_test_entitlement_active(p_user_id);');
    expect(code).not.toMatch(/email|request\.jwt|user_metadata|app_metadata/i);
    const r = await gate({ [OTHER]: 'ok' });
    expect(r.ok).toBe(false);
  });

  it('8. clients cannot read, grant, extend or revoke it', () => {
    expect(code).toContain('ALTER TABLE public.internal_test_entitlements ENABLE ROW LEVEL SECURITY;');
    expect(code).toContain('REVOKE ALL ON public.internal_test_entitlements FROM PUBLIC, anon, authenticated;');
    expect(code).not.toMatch(/CREATE POLICY|GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)/i);
    expect(code).toContain('REVOKE EXECUTE ON FUNCTION public.internal_test_entitlement_active(uuid) FROM PUBLIC, anon, authenticated;');
    expect(code).toContain('REVOKE EXECUTE ON FUNCTION public.billing_state_for(uuid) FROM PUBLIC, anon, authenticated;');
    expect(code).not.toMatch(/INSERT INTO public\.internal_test_entitlements/);
  });

  it('8. the browser model still refuses to upgrade a non-premium state on its own', () => {
    const s = parseBillingStatus({ state: 'TRIAL_EXPIRED', has_premium: true, internal_test_entitlement: true, server_now: '2026-10-29T00:00:00Z' });
    expect(s.hasPremium).toBe(false);
  });

  it('9. rate limits and per-publication generation caps are untouched', () => {
    expect(read('supabase/functions/publication-proposals/entitlement.ts')).toContain('PREMIUM_RATE_LIMIT = { limit: 30, windowSeconds: 3600 }');
    expect(code).not.toMatch(/authorize_premium_request|consume_rate_limit|claim_publication_generation|reserve_ai_usage/);
    expect(proposalsSql).toContain('IF v_pub.proposal_generations_used >= 4 THEN');
  });

  it('10. publication ownership checks are untouched', () => {
    expect(proposalsSql).toContain('WHERE id = p_publication_id AND user_id = p_user_id');
    expect(code).not.toMatch(/publications/);
  });

  it('11. the entitlement does not arm Meta publishing', () => {
    expect(code).not.toMatch(/META_FACEBOOK|publish/i);
    expect(isArmed(() => undefined, USER)).toBe(false);
  });

  it('12. the entitlement writes no publish attempt', () => {
    expect(code).not.toMatch(/publication_publish_attempts/);
  });
});
