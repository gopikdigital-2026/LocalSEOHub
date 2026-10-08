import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { canSubscribe } from '../model';
import { BillingActionError, runBillingAction } from '../repository';
import { billingCopy } from '../billingCopy';

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));

const src = (p: string) => readFileSync(p, 'utf8');

function db(result: { data?: unknown; error?: unknown }) {
  const invoke = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  return { db: { rpc: vi.fn(), functions: { invoke } } as never, invoke };
}

describe('HOTFIX 05.3 checkout CTAs', () => {
  it('C1. Today has no dead upgrade button and renders the shared plan CTAs', () => {
    const today = src('src/app-v2/routes/TodayPage.tsx');
    expect(today).not.toMatch(/onUpgrade|Pasa a Starter|Mejorar plan/);
    expect(today).toMatch(/<PlanCard \/>/);
    expect(today).toMatch(/<PaywallNotice surface="today" \/>/);
  });

  it('C2. every subscribe CTA uses the same button, which starts Stripe Checkout', () => {
    const notices = src('src/features/billing/BillingNotices.tsx');
    expect(notices.match(/export function SubscribeButton/g)).toHaveLength(1);
    expect(notices).toMatch(/run\('checkout'\)/);
    expect(notices.match(/<SubscribeButton/g)?.length).toBeGreaterThanOrEqual(3);
    expect(notices).toMatch(/role="alert"/);
    expect(src('src/features/billing/BillingPage.tsx')).toMatch(/run\('checkout'\)/);
  });

  it('C3. the redirect stays locked while leaving for Stripe and unlocks on back-navigation', () => {
    const hook = src('src/features/billing/useBillingAction.ts');
    expect(hook).toMatch(/window\.location\.assign\(url\)/);
    expect(hook).toMatch(/if \(!redirecting\) setPending\(null\)/);
    expect(hook).toMatch(/'pageshow'/);
  });

  it('C4. subscribing is offered before, during and after the trial, never while already paying', () => {
    expect(canSubscribe('TRIAL_NOT_STARTED')).toBe(true);
    expect(canSubscribe('TRIAL_ACTIVE')).toBe(true);
    expect(canSubscribe('TRIAL_EXPIRED')).toBe(true);
    expect(canSubscribe('SUBSCRIPTION_ACTIVE')).toBe(false);
    expect(canSubscribe('SUBSCRIPTION_CANCELING')).toBe(false);
    expect(canSubscribe('SUBSCRIPTION_PAST_DUE')).toBe(false);
  });

  it('C5. checkout returns only a Stripe Checkout URL', async () => {
    const ok = db({ data: { url: 'https://checkout.stripe.com/c/pay/cs_live_x' } });
    await expect(runBillingAction('checkout', ok.db)).resolves.toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_live_x' });
    expect(ok.invoke).toHaveBeenCalledWith('stripe-billing', { body: { action: 'checkout' } });

    const evil = db({ data: { url: 'https://evil.example/checkout.stripe.com/' } });
    await expect(runBillingAction('checkout', evil.db)).rejects.toMatchObject({ code: 'billing_failed' });
    const empty = db({ data: null });
    await expect(runBillingAction('checkout', empty.db)).rejects.toBeInstanceOf(BillingActionError);
  });

  it('C6. an expired session maps to an understandable message', async () => {
    const error = { context: new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }) };
    await expect(runBillingAction('checkout', db({ error }).db)).rejects.toMatchObject({ code: 'unauthorized' });
    for (const lang of ['es', 'en'] as const) {
      const c = billingCopy(lang);
      expect(c.errors.unauthorized.length).toBeGreaterThan(10);
      expect(c.errors.billing_failed.length).toBeGreaterThan(10);
      expect(c.openingCheckout.length).toBeGreaterThan(5);
    }
  });
});
