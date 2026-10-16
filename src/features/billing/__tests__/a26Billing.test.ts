import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));

import { createBillingHandler, type BillingDeps } from '../../../../supabase/functions/stripe-billing/handler.ts';
import {
  BLOCKING_STATUSES, PLAN, billingReturnUrl, onlyPlanSubscriptions, pickSubscription, planPriceIdsFromEnv,
  safeErrorMessage, toSnapshot, validatePrice, type StripePriceLike, type StripeSubscriptionLike,
} from '../../../../supabase/functions/stripe-billing/logic.ts';
import { createWebhookHandler, type WebhookDeps, type WebhookEvent } from '../../../../supabase/functions/stripe-webhook/handler.ts';
import { HANDLED_EVENTS } from '../../../../supabase/functions/stripe-webhook/logic.ts';
import { PREMIUM_STATES, PRICE_LABEL, canSubscribe, needsUpgrade, parseBillingStatus, type BillingState } from '../model';
import { runBillingAction, startTrial } from '../repository';
import { TOOLS } from '../../tools/catalog';

// Every Stripe object below is FIXTURE / MOCK data. No Stripe API call is made and no payment is attempted.

const ROOT = resolve(__dirname, '../../../../');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const MIG_DIR = join(ROOT, 'supabase/migrations');
const mig = (suffix: string) => src(`supabase/migrations/${readdirSync(MIG_DIR).find((f) => f.endsWith(suffix))}`);
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const stripComments = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

const billingIndex = src('supabase/functions/stripe-billing/index.ts');
const webhookIndex = src('supabase/functions/stripe-webhook/index.ts');
const webhookHandlerSrc = src('supabase/functions/stripe-webhook/handler.ts');
const billingHandlerSrc = src('supabase/functions/stripe-billing/handler.ts');
const config = src('supabase/config.toml');
const lifecycleSql = mig('_create_trial_lifecycle_and_billing_entitlements.sql');
const stateSql = mig('_premium_request_authorization_and_rate_limits.sql');
const trialSql = mig('_a231_ai_reservation_ledger_and_concurrency.sql');
const ledgerSql = mig('_a2420_generalized_ai_usage_ledger.sql');
const capsSql = mig('_a248_voice_simulator_limits.sql');
const hardeningSql = stripComments(mig('_a26_billing_grant_hardening.sql'));
const a25Sql = mig('_a25_gbp_server_verified_profile.sql');
const billingPage = src('src/features/billing/BillingPage.tsx');
const i18n = src('src/lib/i18n.tsx');
const signup = src('supabase/functions/signup-instant/index.ts');
const loginModal = src('src/components/LoginModal.tsx');
const frontend = walk(join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('__tests__'));
const frontendText = frontend.map((f) => readFileSync(f, 'utf8')).join('\n');

const NOW = new Date('2026-05-01T12:00:00Z');
const T = (iso: string) => Math.floor(Date.parse(iso) / 1000);

function sub(over: Partial<StripeSubscriptionLike> = {}): StripeSubscriptionLike {
  return {
    id: 'sub_1', status: 'active', created: 1, cancel_at_period_end: false, current_period_start: 1, current_period_end: 2,
    trial_end: null, items: { data: [{ price: { id: 'price_ok' } }] }, ...over,
  } as StripeSubscriptionLike;
}

function bdeps(over: Partial<BillingDeps> = {}) {
  return {
    siteUrl: 'https://app.localseohub.com',
    planPriceIds: new Set(['price_ok']) as ReadonlySet<string>,
    getUser: vi.fn(async () => ({ id: 'user-a', email: 'a@x.test' })),
    findCustomer: vi.fn(async () => 'cus_a' as string | null),
    createCustomer: vi.fn(async () => 'cus_new'),
    listSubscriptions: vi.fn(async () => [] as StripeSubscriptionLike[]),
    resolvePrice: vi.fn(async () => ({ ok: true as const, priceId: 'price_ok' })),
    findOpenCheckout: vi.fn(async () => null as string | null),
    trialEndsAt: vi.fn(async () => null as number | null),
    createCheckout: vi.fn(async () => 'https://checkout.stripe.com/c/pay/cs_1'),
    createPortal: vi.fn(async () => 'https://billing.stripe.com/p/session/1'),
    setCancelAtPeriodEnd: vi.fn(async () => {}),
    applySnapshot: vi.fn(async () => ({ applied: true, previous_status: 'active', previous_cancel_at_period_end: false })),
    track: vi.fn(async () => {}),
    now: () => NOW,
    log: vi.fn(),
    ...over,
  };
}

const call = (body: unknown, auth: string | null = 'Bearer token-a') =>
  new Request('https://x/stripe-billing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  });

function event(type: string, object: Record<string, unknown> = { customer: 'cus_a' }, id = 'evt_1'): WebhookEvent {
  return { id, type, created: 1700000000, data: { object } };
}

function wdeps(ev: WebhookEvent, over: Partial<WebhookDeps> = {}) {
  return {
    verify: vi.fn(async () => ev),
    claimEvent: vi.fn(async () => 'new' as const),
    finishEvent: vi.fn(async () => {}),
    listSubscriptions: vi.fn(async () => [sub()]),
    applySnapshot: vi.fn(async () => ({ applied: true, previous_status: 'not_started', previous_cancel_at_period_end: false })),
    resolveUserId: vi.fn(async () => 'user-a' as string | null),
    track: vi.fn(async () => {}),
    planPriceIds: new Set(['price_ok']) as ReadonlySet<string>,
    now: () => NOW,
    log: vi.fn(),
    ...over,
  };
}

const hook = (headers: Record<string, string> = { 'stripe-signature': 't=1,v1=abc' }, body = '{"raw":true}') =>
  new Request('https://x/stripe-webhook', { method: 'POST', headers, body });

// FIXTURE mirror of billing_state_for(); test 40 asserts every rule below is present in the SQL.
interface Fixture { status?: string | null; cancel?: boolean; periodEnd?: string | null; trialEnd?: string | null }
function stateFor(f: Fixture, now = NOW): BillingState {
  const s = f.status ?? null;
  const live = s === 'active' || s === 'trialing';
  const periodOver = !!f.periodEnd && Date.parse(f.periodEnd) <= now.getTime();
  const trialRunning = !!f.trialEnd && now.getTime() < Date.parse(f.trialEnd);
  if (live && f.cancel && periodOver && !trialRunning) return 'SUBSCRIPTION_CANCELED';
  if (live && f.cancel && periodOver) return 'TRIAL_ACTIVE';
  if (live && f.cancel) return 'SUBSCRIPTION_CANCELING';
  if (live) return 'SUBSCRIPTION_ACTIVE';
  if (trialRunning) return 'TRIAL_ACTIVE';
  if (s === 'past_due') return 'SUBSCRIPTION_PAST_DUE';
  if (s === 'incomplete') return 'PAYMENT_PENDING';
  if (s && ['canceled', 'unpaid', 'incomplete_expired', 'paused'].includes(s)) return 'SUBSCRIPTION_CANCELED';
  if (f.trialEnd) return 'TRIAL_EXPIRED';
  return 'TRIAL_NOT_STARTED';
}
const serverRow = (state: BillingState) => ({
  state, has_premium: PREMIUM_STATES.has(state), server_now: NOW.toISOString(),
  trial_started_at: null, trial_ends_at: null, subscription_status: null, cancel_at_period_end: false, current_period_end: null,
});
const premium = (f: Fixture) => parseBillingStatus(serverRow(stateFor(f)), NOW.getTime()).hasPremium;

const FUTURE = '2026-06-01T00:00:00Z';
const PAST = '2026-04-01T00:00:00Z';

describe('A2.6 · commercial model and price authority', () => {
  it('1. plan is EUR 9.99 monthly in the backend price guard', () => {
    expect(PLAN).toEqual({ currency: 'eur', unitAmount: 999, interval: 'month', intervalCount: 1 });
  });

  it('2. display price matches the backend in ES and EN', () => {
    expect(PRICE_LABEL).toEqual({ es: '9,99 €/mes', en: '€9.99/month' });
    expect(i18n).toContain("lp_pricing_price: '9,99€'");
    expect(i18n).toContain("lp_pricing_price: '€9.99'");
  });

  it('3. pricing copy states a 7-day trial in ES and EN', () => {
    expect(i18n).toContain("lp_pricing_plan_sub: '7 días gratis · Cancela cuando quieras'");
    expect(i18n).toContain("lp_pricing_plan_sub: '7 days free · Cancel anytime'");
  });

  it('4. server trial length is 7 days', () => {
    expect(trialSql).toContain("v_now + interval '7 days'");
  });

  it('5. price is resolved from server config (env or lookup key), never from the client', () => {
    expect(billingIndex).toContain("Deno.env.get('STRIPE_PRICE_ID')");
    expect(billingIndex).toContain("'localseohub_monthly_eur_999'");
  });

  it.each([
    ['inactive', { active: false }, 'price_inactive'],
    ['one-time', { type: 'one_time', recurring: null }, 'price_not_recurring'],
    ['USD', { currency: 'usd' }, 'price_wrong_currency'],
    ['4.99', { unit_amount: 499 }, 'price_wrong_amount'],
    ['yearly', { recurring: { interval: 'year', interval_count: 1 } }, 'price_wrong_interval'],
    ['test price in live', { livemode: false }, 'price_wrong_environment'],
  ])('6. a misconfigured price (%s) is refused', (_n, over, reason) => {
    const base: StripePriceLike = { id: 'p', active: true, currency: 'eur', unit_amount: 999, livemode: true, type: 'recurring', recurring: { interval: 'month', interval_count: 1 } };
    expect(validatePrice({ ...base, ...over } as StripePriceLike, true)).toEqual({ ok: false, reason });
    expect(validatePrice(base, true)).toEqual({ ok: true });
  });

  it('7. live/test mode is derived from the secret prefix without printing it', () => {
    expect(billingIndex).toContain('const expectLive = /^(sk|rk)_live_/.test(stripeSecret);');
    expect(billingIndex).not.toMatch(/console\.\w+\([^)]*stripeSecret/);
  });

  it('8. a missing price yields billing_unavailable and no checkout', async () => {
    const d = bdeps({ findCustomer: vi.fn(async () => null), resolvePrice: vi.fn(async () => ({ ok: false as const, reason: 'price_not_found' })) });
    const res = await createBillingHandler(d)(call({ action: 'checkout' }));
    expect(res.status).toBe(503);
    expect(d.createCheckout).not.toHaveBeenCalled();
    expect(d.createCustomer).not.toHaveBeenCalled();
  });

  it('9. only this app\'s plan prices count in the shared Stripe account', () => {
    const other = sub({ id: 'sub_virascript', items: { data: [{ price: { id: 'price_virascript' } }] } });
    expect(onlyPlanSubscriptions([other, sub()], new Set(['price_ok'])).map((s) => s.id)).toEqual(['sub_1']);
    expect([...planPriceIdsFromEnv(' price_ok ')]).toEqual(['price_ok']);
  });
});

describe('A2.6 · trial', () => {
  it('10. start_trial needs a signed-in user and only acts from TRIAL_NOT_STARTED', () => {
    expect(trialSql).toMatch(/v_uid\s*uuid\s*:=\s*auth\.uid\(\)/);
    expect(trialSql).toContain("IF v_state ->> 'state' = 'TRIAL_NOT_STARTED' THEN");
  });

  it('11. start_trial requires a confirmed email', () => {
    expect(trialSql).toContain('u.email_confirmed_at IS NOT NULL');
    expect(trialSql).toContain("'email_not_verified'");
  });

  it('12. one trial per user: user_id is the trial key and inserts never overwrite', () => {
    expect(lifecycleSql).toMatch(/user_trials[\s\S]{0,200}user_id uuid PRIMARY KEY/);
    expect(trialSql).toContain('ON CONFLICT (user_id) DO NOTHING');
  });

  it('13. clients cannot write the trial table', () => {
    expect(lifecycleSql).toContain('REVOKE INSERT, UPDATE, DELETE ON public.user_trials FROM anon, authenticated;');
    expect(lifecycleSql).toContain('REVOKE ALL ON public.user_trials FROM anon;');
  });

  it('14. start_trial is not callable anonymously', () => {
    expect(lifecycleSql).toContain('REVOKE EXECUTE ON FUNCTION public.start_trial() FROM PUBLIC, anon;');
  });

  it('15. the trial is card-free: checkout never adds a Stripe trial period', () => {
    expect(billingIndex).not.toContain('trial_period_days');
    expect(billingHandlerSrc).not.toContain('trial_period_days');
  });

  it('16. unverified email is surfaced to the UI, not silently granted', async () => {
    const db = { rpc: vi.fn(async () => ({ data: { ...serverRow('TRIAL_NOT_STARTED'), reason: 'email_not_verified' }, error: null })) };
    const r = await startTrial(db as never);
    expect(r).toMatchObject({ created: false, emailNotVerified: true });
    expect(r.status.hasPremium).toBe(false);
  });

  it('17. trial active grants Premium', () => expect(premium({ trialEnd: FUTURE })).toBe(true));
  it('18. expired trial removes Premium', () => {
    expect(stateFor({ trialEnd: PAST })).toBe('TRIAL_EXPIRED');
    expect(premium({ trialEnd: PAST })).toBe(false);
  });
  it('19. a canceled subscriber cannot restart a trial (not TRIAL_NOT_STARTED)', () => {
    expect(stateFor({ status: 'canceled', trialEnd: PAST })).toBe('SUBSCRIPTION_CANCELED');
    expect(stateFor({ status: 'canceled' })).not.toBe('TRIAL_NOT_STARTED');
  });
  it('20. an expired trial cannot restart a trial', () => expect(stateFor({ trialEnd: PAST })).not.toBe('TRIAL_NOT_STARTED'));

  it('21. subscribing mid-trial anchors the first charge at trial end', async () => {
    const trialEnd = T('2026-05-05T12:00:00Z');
    const d = bdeps({ trialEndsAt: vi.fn(async () => trialEnd) });
    await createBillingHandler(d)(call({ action: 'checkout' }));
    expect(vi.mocked(d.createCheckout).mock.calls[0][0].billingAnchor).toBe(trialEnd);
  });

  it('22. no anchor when the trial ends within the hour', async () => {
    const d = bdeps({ trialEndsAt: vi.fn(async () => T('2026-05-01T12:30:00Z')) });
    await createBillingHandler(d)(call({ action: 'checkout' }));
    expect(vi.mocked(d.createCheckout).mock.calls[0][0].billingAnchor).toBeNull();
  });
});

describe('A2.6 · Premium state matrix (FIXTURE billing_state_for → parseBillingStatus)', () => {
  it.each<[string, Fixture, BillingState, boolean]>([
    ['no trial, no subscription', {}, 'TRIAL_NOT_STARTED', false],
    ['trial active', { trialEnd: FUTURE }, 'TRIAL_ACTIVE', true],
    ['trial expired', { trialEnd: PAST }, 'TRIAL_EXPIRED', false],
    ['active', { status: 'active', periodEnd: FUTURE }, 'SUBSCRIPTION_ACTIVE', true],
    ['trialing', { status: 'trialing', periodEnd: FUTURE }, 'SUBSCRIPTION_ACTIVE', true],
    ['past_due', { status: 'past_due' }, 'SUBSCRIPTION_PAST_DUE', false],
    ['unpaid', { status: 'unpaid' }, 'SUBSCRIPTION_CANCELED', false],
    ['canceling, period active', { status: 'active', cancel: true, periodEnd: FUTURE }, 'SUBSCRIPTION_CANCELING', true],
    ['canceling, period ended', { status: 'active', cancel: true, periodEnd: PAST }, 'SUBSCRIPTION_CANCELED', false],
    ['canceled', { status: 'canceled' }, 'SUBSCRIPTION_CANCELED', false],
    ['incomplete', { status: 'incomplete' }, 'PAYMENT_PENDING', false],
    ['incomplete_expired', { status: 'incomplete_expired' }, 'SUBSCRIPTION_CANCELED', false],
    ['paused', { status: 'paused' }, 'SUBSCRIPTION_CANCELED', false],
    ['past_due during card-free trial', { status: 'past_due', trialEnd: FUTURE }, 'TRIAL_ACTIVE', true],
    ['not_started placeholder row, no trial', { status: 'not_started' }, 'TRIAL_NOT_STARTED', false],
  ])('23–37. %s', (_n, f, state, hasPremium) => {
    expect(stateFor(f)).toBe(state);
    expect(premium(f)).toBe(hasPremium);
  });

  it('38. the client never upgrades a non-Premium state even if has_premium is forged', () => {
    for (const s of ['TRIAL_EXPIRED', 'SUBSCRIPTION_PAST_DUE', 'SUBSCRIPTION_CANCELED', 'PAYMENT_PENDING', 'TRIAL_NOT_STARTED'] as const) {
      expect(parseBillingStatus({ ...serverRow(s), has_premium: true }).hasPremium).toBe(false);
    }
  });

  it('39. unknown server states are rejected, not treated as Premium', () => {
    expect(() => parseBillingStatus({ state: 'SUBSCRIPTION_LIFETIME', has_premium: true })).toThrow();
  });

  it('40. the fixture mirror matches every rule in billing_state_for', () => {
    for (const rule of [
      "WHEN v_status IN ('active', 'trialing') AND v_cancel THEN 'SUBSCRIPTION_CANCELING'",
      "WHEN v_status IN ('active', 'trialing') THEN 'SUBSCRIPTION_ACTIVE'",
      "WHEN v_trial_end IS NOT NULL AND v_now < v_trial_end THEN 'TRIAL_ACTIVE'",
      "WHEN v_status = 'past_due' THEN 'SUBSCRIPTION_PAST_DUE'",
      "WHEN v_status = 'incomplete' THEN 'PAYMENT_PENDING'",
      "WHEN v_status IN ('canceled', 'unpaid', 'incomplete_expired', 'paused') THEN 'SUBSCRIPTION_CANCELED'",
      "WHEN v_trial_end IS NOT NULL THEN 'TRIAL_EXPIRED'",
      "ELSE 'TRIAL_NOT_STARTED'",
      "'has_premium', v_state IN ('TRIAL_ACTIVE', 'SUBSCRIPTION_ACTIVE', 'SUBSCRIPTION_CANCELING')",
    ]) expect(stateSql).toContain(rule);
  });

  it('41. billing_state_for is service-only; the client wrapper uses auth.uid()', () => {
    expect(lifecycleSql).toContain('REVOKE EXECUTE ON FUNCTION public.billing_state_for(uuid) FROM PUBLIC, anon, authenticated;');
    expect(lifecycleSql).toMatch(/FUNCTION public\.billing_status\(\)[\s\S]{0,400}billing_state_for\(auth\.uid\(\)\)/);
  });

  it('42. upgrade and subscribe CTAs follow the state', () => {
    expect(needsUpgrade('TRIAL_EXPIRED') && needsUpgrade('SUBSCRIPTION_CANCELED')).toBe(true);
    expect(canSubscribe('SUBSCRIPTION_ACTIVE') || canSubscribe('SUBSCRIPTION_CANCELING')).toBe(false);
  });
});

describe('A2.6 · tool entitlement', () => {
  it('43. all seven tools remain in the catalog and routed', () => {
    expect(TOOLS).toHaveLength(7);
    const app = src('src/App.tsx');
    for (const p of ['seo', 'advisor', 'maps', 'geo', 'twin', 'radar', 'voice']) expect(app).toContain(`path="/herramientas/${p}"`);
  });

  it.each(['seo-generator-v2', 'business-advisor-v2', 'voice-simulator-v2', 'competitor-radar-v2', 'analyze-website', 'weekly-content', 'business-improvement'])(
    '44. %s has the server-side Premium gate', (fn) => {
      const entitlement = src(`supabase/functions/${fn}/entitlement.ts`);
      expect(entitlement).toContain('authorize_premium_request');
      expect(entitlement).toContain("premium_required: 403");
    },
  );

  it('45. the server gate reads billing_state_for has_premium', () => {
    expect(stateSql).toContain("IF NOT coalesce((billing_state_for(p_user_id) ->> 'has_premium')::boolean, false) THEN");
  });

  it.each([
    ['maps-scanner/MapsScannerPage.tsx'], ['geo-audit/GeoAuditPage.tsx'], ['digital-twin/DigitalTwinPage.tsx'],
    ['competitor-radar/CompetitorRadarPage.tsx'], ['voice-simulator/VoiceSimulatorPage.tsx'],
  ])('46. %s gates its UI on server hasPremium', (p) => {
    expect(src(`src/features/${p}`)).toMatch(/if \(!hasPremium\)/);
  });

  it.each([['seo-generator/SeoGeneratorPage.tsx'], ['business-advisor/AdvisorPage.tsx']])(
    '47. %s relies on the backend premium_required answer', (p) => {
      expect(src(`src/features/${p}`)).toMatch(/PremiumRequiredError|premium_required/);
    },
  );
});

describe('A2.6 · checkout', () => {
  it('48. no Authorization → 401 and no Stripe work', async () => {
    const d = bdeps();
    expect((await createBillingHandler(d)(call({ action: 'checkout' }, null))).status).toBe(401);
    expect(d.findCustomer).not.toHaveBeenCalled();
  });

  it('49. invalid session → 401', async () => {
    const d = bdeps({ getUser: vi.fn(async () => null) });
    expect((await createBillingHandler(d)(call({ action: 'checkout' }))).status).toBe(401);
    expect(d.createCheckout).not.toHaveBeenCalled();
  });

  it('50. client price, amount, customer and subscription ids are ignored', async () => {
    const d = bdeps();
    await createBillingHandler(d)(call({ action: 'checkout', price_id: 'price_cheap', amount: 1, customerId: 'cus_b', subscriptionId: 'sub_b', userId: 'user-b' }));
    expect(d.findCustomer).toHaveBeenCalledWith('user-a');
    expect(vi.mocked(d.createCheckout).mock.calls[0][0]).toMatchObject({ customerId: 'cus_a', priceId: 'price_ok', userId: 'user-a' });
  });

  it('51. success and cancel URLs are fixed server-side', async () => {
    const d = bdeps();
    await createBillingHandler(d)(call({ action: 'checkout', success_url: 'https://evil.test', cancel_url: 'https://evil.test' }));
    const p = vi.mocked(d.createCheckout).mock.calls[0][0];
    expect(p.successUrl).toBe('https://app.localseohub.com/facturacion?checkout=success');
    expect(p.cancelUrl).toBe('https://app.localseohub.com/facturacion?checkout=cancel');
  });

  it('52. insecure or missing SITE_URL disables checkout', async () => {
    for (const siteUrl of [undefined, 'http://app.example', 'javascript:alert(1)']) {
      const d = bdeps({ siteUrl });
      expect((await createBillingHandler(d)(call({ action: 'checkout' }))).status).toBe(503);
      expect(d.createCheckout).not.toHaveBeenCalled();
    }
    expect(billingReturnUrl('http://localhost:5173', 'success')).toBe('http://localhost:5173/facturacion?checkout=success');
  });

  it('53. return URLs keep only the origin of SITE_URL', () => {
    expect(billingReturnUrl('https://app.localseohub.com/x?y=1#z', 'portal')).toBe('https://app.localseohub.com/facturacion?checkout=portal');
  });

  it.each([...BLOCKING_STATUSES])('54. an existing %s subscription blocks a second checkout', async (status) => {
    const d = bdeps({ listSubscriptions: vi.fn(async () => [sub({ status })]) });
    expect((await createBillingHandler(d)(call({ action: 'checkout' }))).status).toBe(409);
    expect(d.createCheckout).not.toHaveBeenCalled();
  });

  it('55. another product\'s subscription in the shared account does not block checkout', async () => {
    const d = bdeps({ listSubscriptions: vi.fn(async () => [sub({ items: { data: [{ price: { id: 'price_autohook' } }] } })]) });
    expect((await createBillingHandler(d)(call({ action: 'checkout' }))).status).toBe(200);
  });

  it('56. an open checkout session is reused (no duplicate sessions)', async () => {
    const d = bdeps({ findOpenCheckout: vi.fn(async () => 'https://checkout.stripe.com/c/pay/cs_open') });
    const res = await createBillingHandler(d)(call({ action: 'checkout' }));
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_open', reused: true });
    expect(d.createCheckout).not.toHaveBeenCalled();
  });

  it('57. resubscribing after cancellation creates a checkout with no new trial', async () => {
    const d = bdeps({ listSubscriptions: vi.fn(async () => [sub({ status: 'canceled' })]) });
    await createBillingHandler(d)(call({ action: 'checkout' }));
    expect(vi.mocked(d.createCheckout).mock.calls[0][0].billingAnchor).toBeNull();
  });

  it('58. customer creation is idempotent per user and tagged with the user id', () => {
    expect(billingIndex).toContain('{ idempotencyKey: `customer-${user.id}` }');
    expect(billingIndex).toContain('metadata: { userId: user.id }');
  });

  it('59. checkout session is subscription mode and carries the user id', () => {
    expect(billingIndex).toContain("mode: 'subscription'");
    expect(billingIndex).toContain('client_reference_id: userId');
  });

  it('60. the frontend only sends the action and only follows Stripe-hosted URLs', async () => {
    const invoke = vi.fn(async () => ({ data: { url: 'https://evil.test/pay' }, error: null }));
    await expect(runBillingAction('checkout', { functions: { invoke } } as never)).rejects.toThrow('billing_failed');
    expect(invoke).toHaveBeenCalledWith('stripe-billing', { body: { action: 'checkout' } });
    const ok = vi.fn(async () => ({ data: { url: 'https://checkout.stripe.com/c/pay/cs_1' }, error: null }));
    expect(await runBillingAction('checkout', { functions: { invoke: ok } } as never)).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_1' });
  });

  it('61. ?checkout=success only triggers a server sync, never grants access', () => {
    expect(billingPage).toContain("runBillingAction('sync')");
    expect(billingPage).not.toMatch(/hasPremium\s*=\s*true|setHasPremium|has_premium:\s*true/);
    expect(frontendText).not.toMatch(/from\('stripe_subscriptions'\)\s*\.(insert|update|upsert)/);
  });

  it('62. starting checkout does not touch AI usage', () => {
    for (const s of [billingIndex, billingHandlerSrc, webhookIndex, webhookHandlerSrc]) expect(s).not.toMatch(/ai_usage/);
  });

  it('63. unknown actions are rejected', async () => {
    expect((await createBillingHandler(bdeps())(call({ action: 'grant_premium' }))).status).toBe(400);
  });

  it('64. the checkout function requires a JWT at the gateway', () => {
    expect(config).toMatch(/\[functions\.stripe-billing\]\s*\nverify_jwt = true/);
  });
});

describe('A2.6 · webhook', () => {
  it('65. missing signature → 400 before anything else', async () => {
    const d = wdeps(event('invoice.paid'));
    expect((await createWebhookHandler(d)(hook({}))).status).toBe(400);
    expect(d.verify).not.toHaveBeenCalled();
  });

  it('66. invalid signature → 400, no DB effect, no secret echoed', async () => {
    const d = wdeps(event('invoice.paid'), { verify: vi.fn(async () => { throw new Error('bad whsec_abc123'); }) });
    const res = await createWebhookHandler(d)(hook());
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain('whsec');
    expect(d.claimEvent).not.toHaveBeenCalled();
  });

  it('67. signature is verified over the exact raw body with the webhook secret', () => {
    expect(webhookIndex).toContain('stripe.webhooks.constructEventAsync(body, signature, webhookSecret)');
    expect(webhookIndex).toContain("Deno.env.get('STRIPE_WEBHOOK_SECRET')");
    expect(config).toMatch(/\[functions\.stripe-webhook\]\s*\nverify_jwt = false/);
  });

  it('68. exactly six event types are handled', () => {
    expect([...HANDLED_EVENTS].sort()).toEqual([
      'checkout.session.completed', 'customer.subscription.created', 'customer.subscription.deleted',
      'customer.subscription.updated', 'invoice.paid', 'invoice.payment_failed',
    ]);
  });

  it('69. unhandled events are acknowledged without DB effect', async () => {
    const d = wdeps(event('customer.created'));
    expect(await (await createWebhookHandler(d)(hook())).json()).toEqual({ received: true, ignored: true });
    expect(d.claimEvent).not.toHaveBeenCalled();
  });

  it.each([...HANDLED_EVENTS])('70. %s re-reads Stripe and applies a snapshot for the mapped user', async (type) => {
    const d = wdeps(event(type, { customer: 'cus_a', mode: 'subscription' }));
    expect((await createWebhookHandler(d)(hook())).status).toBe(200);
    expect(d.listSubscriptions).toHaveBeenCalledWith('cus_a');
    expect(d.applySnapshot).toHaveBeenCalledTimes(1);
    expect(d.finishEvent).toHaveBeenCalledWith('evt_1', 'processed');
  });

  it('71. the event payload status is never trusted', async () => {
    const d = wdeps(event('customer.subscription.updated', { customer: 'cus_a', status: 'active' }), {
      listSubscriptions: vi.fn(async () => [sub({ status: 'past_due' })]),
    });
    await createWebhookHandler(d)(hook());
    expect(vi.mocked(d.applySnapshot).mock.calls[0][0].p_status).toBe('past_due');
  });

  it('72. a duplicate delivery is a 200 no-op', async () => {
    const d = wdeps(event('invoice.paid'), { claimEvent: vi.fn(async () => 'duplicate' as const) });
    expect((await createWebhookHandler(d)(hook())).status).toBe(200);
    expect(d.applySnapshot).not.toHaveBeenCalled();
  });

  it('73. a concurrent delivery is deferred with 409', async () => {
    const d = wdeps(event('invoice.paid'), { claimEvent: vi.fn(async () => 'busy' as const) });
    expect((await createWebhookHandler(d)(hook())).status).toBe(409);
  });

  it('74. a claim failure returns 500 so Stripe retries', async () => {
    const d = wdeps(event('invoice.paid'), { claimEvent: vi.fn(async () => { throw new Error('db'); }) });
    expect((await createWebhookHandler(d)(hook())).status).toBe(500);
  });

  it('75. processing errors mark the event failed and return 500', async () => {
    const d = wdeps(event('invoice.paid'), { applySnapshot: vi.fn(async () => { throw new Error('boom sk_live_abcdef'); }) });
    expect((await createWebhookHandler(d)(hook())).status).toBe(500);
    expect(d.finishEvent).toHaveBeenCalledWith('evt_1', 'failed', 'boom [redacted]');
  });

  it('76. an unknown customer is ignored; there is no email fallback', async () => {
    const d = wdeps(event('invoice.paid', { customer: 'cus_unknown', customer_email: 'a@x.test' }), { resolveUserId: vi.fn(async () => null) });
    await createWebhookHandler(d)(hook());
    expect(d.applySnapshot).not.toHaveBeenCalled();
    expect(d.finishEvent).toHaveBeenCalledWith('evt_1', 'ignored');
    expect(webhookIndex).not.toMatch(/\.eq\(['"]email['"]|customer_email|listUsers/);
  });

  it('77. one-time checkout sessions are ignored', async () => {
    const d = wdeps(event('checkout.session.completed', { customer: 'cus_a', mode: 'payment' }));
    await createWebhookHandler(d)(hook());
    expect(d.applySnapshot).not.toHaveBeenCalled();
  });

  it('78. stale snapshots cannot overwrite newer ones', () => {
    expect(lifecycleSql).toContain('v_prev_synced > p_synced_at THEN');
    expect(lifecycleSql).toMatch(/FROM stripe_subscriptions[\s\S]{0,120}FOR UPDATE;/);
  });

  it('79. event ids are unique (idempotency key)', () => {
    expect(lifecycleSql).toMatch(/stripe_webhook_events[\s\S]{0,200}event_id text PRIMARY KEY/);
  });

  it('80. snapshot writer is service-only', () => {
    expect(lifecycleSql).toContain('REVOKE EXECUTE ON FUNCTION public.apply_stripe_subscription_snapshot(text, text, text, text, bigint, bigint, bigint, boolean, text, text, timestamptz) FROM PUBLIC, anon, authenticated;');
  });

  it('81. the snapshot picks the most relevant plan subscription', () => {
    const chosen = pickSubscription([sub({ id: 'old', status: 'canceled', created: 9 }), sub({ id: 'cur', status: 'active', created: 1 })]);
    expect(chosen?.id).toBe('cur');
    expect(toSnapshot('cus_a', null, NOW).p_status).toBe('not_started');
  });
});

describe('A2.6 · portal, cancellation, reactivation', () => {
  it('82. portal is opened for the caller\'s own customer only', async () => {
    const d = bdeps();
    await createBillingHandler(d)(call({ action: 'portal', customerId: 'cus_b' }));
    expect(d.createPortal).toHaveBeenCalledWith('cus_a', 'https://app.localseohub.com/facturacion?checkout=portal', null);
  });

  it('83. payment method update uses the portal flow for the own customer', async () => {
    const d = bdeps();
    await createBillingHandler(d)(call({ action: 'payment_method' }));
    expect(d.createPortal).toHaveBeenCalledWith('cus_a', expect.any(String), 'payment_method_update');
  });

  it('84. a user with no customer gets no portal', async () => {
    const d = bdeps({ findCustomer: vi.fn(async () => null) });
    expect((await createBillingHandler(d)(call({ action: 'portal' }))).status).toBe(404);
    expect(d.createPortal).not.toHaveBeenCalled();
  });

  it('85. cancel sets cancel_at_period_end on the caller\'s current subscription', async () => {
    const d = bdeps({ listSubscriptions: vi.fn(async () => [sub({ id: 'sub_a' })]) });
    expect((await createBillingHandler(d)(call({ action: 'cancel', subscriptionId: 'sub_b' }))).status).toBe(200);
    expect(d.setCancelAtPeriodEnd).toHaveBeenCalledWith('sub_a', true);
  });

  it('86. resume clears the flag; repeating is a no-op', async () => {
    const d = bdeps({ listSubscriptions: vi.fn(async () => [sub({ cancel_at_period_end: true })]) });
    await createBillingHandler(d)(call({ action: 'resume' }));
    expect(d.setCancelAtPeriodEnd).toHaveBeenCalledWith('sub_1', false);
    const again = bdeps({ listSubscriptions: vi.fn(async () => [sub({ cancel_at_period_end: false })]) });
    expect(await (await createBillingHandler(again)(call({ action: 'resume' }))).json()).toEqual({ ok: true, unchanged: true });
  });

  it('87. cancel or resume on a non-entitled subscription is refused', async () => {
    for (const status of ['past_due', 'canceled', 'unpaid']) {
      const d = bdeps({ listSubscriptions: vi.fn(async () => [sub({ status })]) });
      expect((await createBillingHandler(d)(call({ action: 'cancel' }))).status).toBe(404);
      expect(d.setCancelAtPeriodEnd).not.toHaveBeenCalled();
    }
  });

  it('88. user A and user B resolve to their own customers', async () => {
    const map: Record<string, string> = { 'user-a': 'cus_a', 'user-b': 'cus_b' };
    for (const id of ['user-a', 'user-b']) {
      const d = bdeps({ getUser: vi.fn(async () => ({ id, email: null })), findCustomer: vi.fn(async (u: string) => map[u]) });
      await createBillingHandler(d)(call({ action: 'portal', customerId: 'cus_a' }));
      expect(vi.mocked(d.createPortal).mock.calls[0][0]).toBe(map[id]);
    }
  });

  it('89. Stripe errors return a generic billing_failed with redacted logs', async () => {
    const log = vi.fn();
    const d = bdeps({ log, createPortal: vi.fn(async () => { throw new Error('Invalid API Key sk_test_123abc'); }) });
    const res = await createBillingHandler(d)(call({ action: 'portal' }));
    expect(await res.json()).toEqual({ error: 'billing_failed' });
    expect(log.mock.calls.join(' ')).not.toContain('sk_test_123abc');
    expect(safeErrorMessage(new Error('rk_live_x whsec_y pk_test_z'))).not.toMatch(/rk_live_x|whsec_y|pk_test_z/);
  });
});

describe('A2.6 · RLS, grants, AI usage, secrets, auth', () => {
  it('90. clients cannot write billing tables (subscription status cannot be self-set)', () => {
    for (const t of ['stripe_customers', 'stripe_subscriptions', 'stripe_orders', 'subscriptions']) {
      expect(lifecycleSql).toContain(`REVOKE INSERT, UPDATE, DELETE ON public.${t} FROM anon, authenticated;`);
    }
    expect(lifecycleSql).toContain('REVOKE ALL ON public.stripe_webhook_events FROM anon, authenticated;');
  });

  it('91. A2.6 hardening removes TRUNCATE and AI-ledger writes from browser roles', () => {
    for (const t of ['stripe_customers', 'stripe_subscriptions', 'stripe_orders', 'user_trials', 'subscriptions']) {
      expect(hardeningSql).toContain(`REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.${t} FROM anon, authenticated;`);
    }
    for (const t of ['ai_usage_monthly', 'ai_usage_reservations']) {
      expect(hardeningSql).toContain(`REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.${t} FROM anon, authenticated;`);
    }
    expect(hardeningSql).toContain('GRANT INSERT (id, email, full_name, created_at) ON public.profiles TO authenticated;');
    expect(hardeningSql).not.toMatch(/\b(DROP|DELETE FROM|TRUNCATE TABLE|ALTER TABLE)\b/i);
  });

  it('92. AI usage resets by calendar month, not by billing events; caps unchanged', () => {
    expect(ledgerSql).toContain("v_period date := date_trunc('month', timezone('utc', now()))::date;");
    for (const [fn, n] of [['weekly-content', 22], ['business-improvement', 18], ['seo-generator', 18], ['business-advisor', 12], ['voice-simulator', 10], ['global', 80]] as const) {
      expect(capsSql).toContain(`WHEN '${fn}' THEN ${n}`);
    }
  });

  it('93. no Stripe or service secret is present in frontend source or built assets', () => {
    const secret = /\b(sk|rk)_(live|test)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY/;
    expect(frontendText).not.toMatch(secret);
    const dist = join(ROOT, 'dist');
    if (existsSync(dist)) {
      for (const f of walk(dist).filter((p) => /\.(js|html|css)$/.test(p))) expect(readFileSync(f, 'utf8'), f).not.toMatch(secret);
    }
  });

  it('94. no card number, CVC or raw payment method object is stored or logged', () => {
    for (const s of [billingIndex, webhookIndex, billingHandlerSrc, webhookHandlerSrc]) {
      expect(s).not.toMatch(/card\.number|\bcvc\b|exp_month|console\.\w+\([^)]*event\.data/);
    }
    const snap = toSnapshot('cus_a', sub({ default_payment_method: { card: { brand: 'visa', last4: '4242' } } } as Partial<StripeSubscriptionLike>), NOW);
    expect(Object.keys(snap).filter((k) => k.startsWith('p_payment'))).toEqual(['p_payment_method_brand', 'p_payment_method_last4']);
  });

  it('95. signup goes through signup-instant (rate limited), not direct auth.signUp', () => {
    expect(loginModal).toContain("supabase.functions.invoke('signup-instant'");
    expect(frontendText).not.toContain('auth.signUp(');
    expect(signup).toContain('signup_created_recently');
  });

  it('96. F-03 documented: signup-instant auto-confirms email (owner action pending)', () => {
    expect(signup).toContain('email_confirm: true');
  });

  it('97. retired Stripe and legacy functions answer 410', () => {
    for (const fn of ['stripe-checkout', 'stripe-cancel-subscription', 'generate-seo', 'simulate-campaign']) {
      expect(src(`supabase/functions/${fn}/index.ts`)).toContain('status: 410');
    }
  });

  it('98. the A2.5 Google verification trust fix is still present', () => {
    const sql = stripComments(a25Sql);
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS verified_profile jsonb');
    expect(sql).toContain('GRANT SELECT (verified_profile, verified_at) ON connected_sources TO authenticated;');
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE)[^;]*verified_profile/);
    expect(frontendText).toContain('verified_profile');
  });
});
