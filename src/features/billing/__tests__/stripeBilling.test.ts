import { describe, expect, it, vi } from 'vitest';
import { createBillingHandler, type BillingDeps } from '../../../../supabase/functions/stripe-billing/handler.ts';
import { billingReturnUrl, validatePrice, type StripePriceLike } from '../../../../supabase/functions/stripe-billing/logic.ts';
import type { StripeSubscriptionLike } from '../../../../supabase/functions/stripe-billing/logic.ts';

const NOW = new Date('2024-03-01T12:00:00Z');

function sub(over: Partial<StripeSubscriptionLike> = {}): StripeSubscriptionLike {
  return {
    id: 'sub_1', status: 'active', created: 1, cancel_at_period_end: false, current_period_start: 1, current_period_end: 2,
    items: { data: [{ price: { id: 'price_ok' } }] }, ...over,
  } as StripeSubscriptionLike;
}

function deps(over: Partial<BillingDeps> = {}) {
  return {
    siteUrl: 'https://app.localseohub.com',
    getUser: vi.fn(async () => ({ id: 'user-1', email: 'a@b.c' })),
    findCustomer: vi.fn(async () => 'cus_1' as string | null),
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
    log: () => {},
    ...over,
  };
}

const call = (body: unknown, auth: string | null = 'Bearer token') =>
  new Request('https://x/stripe-billing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  });

describe('stripe billing function', () => {
  it('B1. requires a signed-in user; an anon key alone is rejected', async () => {
    expect((await createBillingHandler(deps())(call({ action: 'checkout' }, null))).status).toBe(401);
    const d = deps({ getUser: vi.fn(async () => null) });
    const res = await createBillingHandler(d)(call({ action: 'checkout' }, 'Bearer anon-key'));
    expect(res.status).toBe(401);
    expect(d.createCheckout).not.toHaveBeenCalled();
  });

  it('B2. rejects unknown actions and answers preflight with CORS headers', async () => {
    expect((await createBillingHandler(deps())(call({ action: 'grant_premium' }))).status).toBe(400);
    const pre = await createBillingHandler(deps())(new Request('https://x', { method: 'OPTIONS' }));
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('B3. ignores any client-sent price or return URL', async () => {
    const d = deps();
    await createBillingHandler(d)(call({ action: 'checkout', price_id: 'price_cheap', success_url: 'https://evil.example' }));
    const params = vi.mocked(d.createCheckout).mock.calls[0][0];
    expect(params.priceId).toBe('price_ok');
    expect(params.successUrl).toBe('https://app.localseohub.com/facturacion?checkout=success');
    expect(params.cancelUrl).toBe('https://app.localseohub.com/facturacion?checkout=cancel');
  });

  it('B4. refuses a second subscription and reconciles instead', async () => {
    for (const status of ['active', 'trialing', 'past_due', 'unpaid']) {
      const d = deps({ listSubscriptions: vi.fn(async () => [sub({ status })]) });
      const res = await createBillingHandler(d)(call({ action: 'checkout' }));
      expect(res.status).toBe(409);
      expect(d.createCheckout).not.toHaveBeenCalled();
      expect(d.applySnapshot).toHaveBeenCalled();
    }
  });

  it('B5. refuses checkout when the price cannot be verified', async () => {
    const d = deps({ resolvePrice: vi.fn(async () => ({ ok: false as const, reason: 'price_wrong_amount' })) });
    const res = await createBillingHandler(d)(call({ action: 'checkout' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'billing_unavailable' });
    expect(d.createCustomer).not.toHaveBeenCalled();
  });

  it('B6. reuses an open checkout instead of creating duplicates', async () => {
    const d = deps({ findOpenCheckout: vi.fn(async () => 'https://checkout.stripe.com/c/pay/cs_open') });
    const res = await createBillingHandler(d)(call({ action: 'checkout' }));
    expect((await res.json()).url).toMatch(/cs_open/);
    expect(d.createCheckout).not.toHaveBeenCalled();
  });

  it('B7. subscribing mid-trial anchors the first charge to the trial end; no trial is ever created in Stripe', async () => {
    const trialEnd = Math.floor(NOW.getTime() / 1000) + 3 * 86400;
    const d = deps({ trialEndsAt: vi.fn(async () => trialEnd) });
    await createBillingHandler(d)(call({ action: 'checkout' }));
    expect(vi.mocked(d.createCheckout).mock.calls[0][0].billingAnchor).toBe(trialEnd);
    const expired = deps();
    await createBillingHandler(expired)(call({ action: 'checkout' }));
    expect(vi.mocked(expired.createCheckout).mock.calls[0][0].billingAnchor).toBeNull();
  });

  it('B8. cancel schedules end-of-period cancellation; resume reverses it; both reconcile', async () => {
    const d = deps({ listSubscriptions: vi.fn(async () => [sub()]) });
    await createBillingHandler(d)(call({ action: 'cancel' }));
    expect(d.setCancelAtPeriodEnd).toHaveBeenCalledWith('sub_1', true);
    expect(d.applySnapshot).toHaveBeenCalled();
    const r = deps({ listSubscriptions: vi.fn(async () => [sub({ cancel_at_period_end: true })]) });
    await createBillingHandler(r)(call({ action: 'resume' }));
    expect(r.setCancelAtPeriodEnd).toHaveBeenCalledWith('sub_1', false);
  });

  it('B9. portal and cancel need an existing customer; errors stay generic', async () => {
    const none = deps({ findCustomer: vi.fn(async () => null) });
    expect((await createBillingHandler(none)(call({ action: 'portal' }))).status).toBe(404);
    expect((await createBillingHandler(none)(call({ action: 'sync' }))).status).toBe(200);
    const boom = deps({ createPortal: vi.fn(async () => { throw new Error('No configuration provided; sk_live_x'); }) });
    const res = await createBillingHandler(boom)(call({ action: 'payment_method' }));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toMatch(/configuration|sk_live/);
  });
});

describe('billing logic', () => {
  const good: StripePriceLike = { id: 'p', active: true, currency: 'eur', unit_amount: 999, livemode: false, type: 'recurring', recurring: { interval: 'month', interval_count: 1 } };

  it('P1. only accepts EUR 9.99 monthly in the matching environment', () => {
    expect(validatePrice(good, false)).toEqual({ ok: true });
    expect(validatePrice({ ...good, currency: 'usd' }, false).ok).toBe(false);
    expect(validatePrice({ ...good, unit_amount: 990 }, false).ok).toBe(false);
    expect(validatePrice({ ...good, recurring: { interval: 'year', interval_count: 1 } }, false).ok).toBe(false);
    expect(validatePrice(good, true)).toEqual({ ok: false, reason: 'price_wrong_environment' });
    expect(validatePrice(null, false).ok).toBe(false);
  });

  it('P2. return URLs are fixed paths on a safe origin', () => {
    expect(billingReturnUrl('http://evil.example', 'success')).toBeNull();
    expect(billingReturnUrl(undefined, 'success')).toBeNull();
    expect(billingReturnUrl('https://app.x.com/some/path?q=1', 'portal')).toBe('https://app.x.com/facturacion?checkout=portal');
  });
});
