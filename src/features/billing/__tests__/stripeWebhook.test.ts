import { describe, expect, it, vi } from 'vitest';
import { createWebhookHandler, type WebhookDeps, type WebhookEvent } from '../../../../supabase/functions/stripe-webhook/handler.ts';
import { pickSubscription, safeErrorMessage, toSnapshot, transitionsBetween } from '../../../../supabase/functions/stripe-webhook/logic.ts';
import type { StripeSubscriptionLike } from '../../../../supabase/functions/stripe-webhook/logic.ts';

function sub(over: Partial<StripeSubscriptionLike> = {}): StripeSubscriptionLike {
  return {
    id: 'sub_1', status: 'active', created: 100, cancel_at_period_end: false,
    current_period_start: 1000, current_period_end: 2000, trial_end: null,
    items: { data: [{ price: { id: 'price_x' } }] },
    default_payment_method: { card: { brand: 'visa', last4: '4242' } },
    ...over,
  } as StripeSubscriptionLike;
}

function event(type: string, object: Record<string, unknown> = { customer: 'cus_1' }): WebhookEvent {
  return { id: 'evt_1', type, created: 1700000000, data: { object } };
}

function deps(over: Partial<WebhookDeps> = {}) {
  const d = {
    verify: vi.fn(async () => event('customer.subscription.updated')),
    claimEvent: vi.fn(async () => 'new' as const),
    finishEvent: vi.fn(async () => {}),
    listSubscriptions: vi.fn(async () => [sub()]),
    applySnapshot: vi.fn(async () => ({ applied: true, previous_status: 'not_started', previous_cancel_at_period_end: false })),
    resolveUserId: vi.fn(async () => 'user-1'),
    track: vi.fn(async () => {}),
    planPriceIds: new Set(['price_x']) as ReadonlySet<string>,
    now: () => new Date('2024-01-01T00:00:00Z'),
    log: () => {},
    ...over,
  };
  return d;
}

const post = (headers: Record<string, string> = { 'stripe-signature': 't=1,v1=abc' }) =>
  new Request('https://x/stripe-webhook', { method: 'POST', headers, body: '{"raw":true}' });

describe('stripe webhook', () => {
  it('W1. rejects requests without a signature before touching anything', async () => {
    const d = deps();
    const res = await createWebhookHandler(d)(post({}));
    expect(res.status).toBe(400);
    expect(d.verify).not.toHaveBeenCalled();
    expect(d.claimEvent).not.toHaveBeenCalled();
  });

  it('W2. rejects an invalid signature and verifies against the exact raw body', async () => {
    const d = deps({ verify: vi.fn(async () => { throw new Error('No signatures found matching sk_test_secret'); }) });
    const res = await createWebhookHandler(d)(post());
    expect(res.status).toBe(400);
    expect(await res.text()).not.toMatch(/sk_test/);
    expect(d.verify).toHaveBeenCalledWith('{"raw":true}', 't=1,v1=abc');
    expect(d.applySnapshot).not.toHaveBeenCalled();
  });

  it('W3. a duplicate delivery returns 200 and is not processed again', async () => {
    const d = deps({ claimEvent: vi.fn(async () => 'duplicate' as const) });
    const res = await createWebhookHandler(d)(post());
    expect(res.status).toBe(200);
    expect(d.listSubscriptions).not.toHaveBeenCalled();
    expect(d.track).not.toHaveBeenCalled();
  });

  it('W4. an event being processed elsewhere asks Stripe to retry later', async () => {
    const d = deps({ claimEvent: vi.fn(async () => 'busy' as const) });
    expect((await createWebhookHandler(d)(post())).status).toBe(409);
    expect(d.applySnapshot).not.toHaveBeenCalled();
  });

  it('W5. reconciles from Stripe instead of trusting the event payload', async () => {
    const d = deps({ verify: vi.fn(async () => event('customer.subscription.updated', { customer: 'cus_1', status: 'canceled' })) });
    await createWebhookHandler(d)(post());
    expect(d.listSubscriptions).toHaveBeenCalledWith('cus_1');
    expect(d.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({ p_status: 'active', p_customer_id: 'cus_1' }));
    expect(d.finishEvent).toHaveBeenCalledWith('evt_1', 'processed');
  });

  it('W6. a stale (out-of-order) snapshot is not applied and emits no lifecycle analytics', async () => {
    const d = deps({ applySnapshot: vi.fn(async () => ({ applied: false, previous_status: 'active', previous_cancel_at_period_end: false })) });
    const res = await createWebhookHandler(d)(post());
    expect(res.status).toBe(200);
    expect(d.track).not.toHaveBeenCalled();
  });

  it('W7. activation is tracked once from the status change, separately from checkout completion', async () => {
    const d = deps({ verify: vi.fn(async () => event('checkout.session.completed', { customer: 'cus_1', mode: 'subscription', payment_status: 'paid', customer_email: 'a@b.c' })) });
    await createWebhookHandler(d)(post());
    const names = vi.mocked(d.track).mock.calls.map((c) => c[1]);
    expect(names).toEqual(['checkout_completed', 'subscription_activated']);
    expect(JSON.stringify(vi.mocked(d.track).mock.calls)).not.toMatch(/a@b\.c/);
  });

  it('W8. payment failures are tracked and processing failures return 500 with a redacted log', async () => {
    const failing = deps({ verify: vi.fn(async () => event('invoice.payment_failed', { customer: 'cus_1', billing_reason: 'subscription_cycle' })) });
    await createWebhookHandler(failing)(post());
    expect(vi.mocked(failing.track).mock.calls.map((c) => c[1])).toContain('payment_failed');

    const d = deps({ listSubscriptions: vi.fn(async () => { throw new Error('Invalid API Key provided: sk_live_abc123'); }) });
    const res = await createWebhookHandler(d)(post());
    expect(res.status).toBe(500);
    const [, status, message] = vi.mocked(d.finishEvent).mock.calls[0];
    expect(status).toBe('failed');
    expect(message).not.toMatch(/sk_live_abc123/);
  });

  it('W9. ignores unrelated events and one-off payment checkouts', async () => {
    const other = deps({ verify: vi.fn(async () => event('charge.refunded')) });
    expect((await createWebhookHandler(other)(post())).status).toBe(200);
    expect(other.claimEvent).not.toHaveBeenCalled();
    const payment = deps({ verify: vi.fn(async () => event('checkout.session.completed', { customer: 'cus_1', mode: 'payment' })) });
    await createWebhookHandler(payment)(post());
    expect(payment.finishEvent).toHaveBeenCalledWith('evt_1', 'ignored');
    expect(payment.applySnapshot).not.toHaveBeenCalled();
  });

  it('W10. each of the six configured events reconciles a known customer from Stripe', async () => {
    for (const type of ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated',
      'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed']) {
      const d = deps({ verify: vi.fn(async () => event(type, { customer: 'cus_1', mode: 'subscription' })) });
      expect((await createWebhookHandler(d)(post())).status).toBe(200);
      expect(d.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({ p_status: 'active', p_price_id: 'price_x' }));
      expect(d.finishEvent).toHaveBeenCalledWith('evt_1', 'processed');
    }
  });

  it('W11. customers that do not belong to LocalSEOHub are ignored without writing a subscription', async () => {
    const d = deps({ resolveUserId: vi.fn(async () => null) });
    expect((await createWebhookHandler(d)(post())).status).toBe(200);
    expect(d.listSubscriptions).not.toHaveBeenCalled();
    expect(d.applySnapshot).not.toHaveBeenCalled();
    expect(d.finishEvent).toHaveBeenCalledWith('evt_1', 'ignored');
  });

  it('W12. an active subscription to another product never grants Premium', async () => {
    const foreign = sub({ id: 'sub_autohook', items: { data: [{ price: { id: 'price_autohook' } }] } });
    const d = deps({ listSubscriptions: vi.fn(async () => [foreign]) });
    await createWebhookHandler(d)(post());
    expect(d.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({ p_status: 'not_started', p_subscription_id: null, p_price_id: null }));
    expect(d.track).not.toHaveBeenCalledWith('user-1', 'subscription_activated', expect.anything());

    const mixed = deps({ listSubscriptions: vi.fn(async () => [foreign, sub({ id: 'sub_local', status: 'canceled' })]) });
    await createWebhookHandler(mixed)(post());
    expect(mixed.applySnapshot).toHaveBeenCalledWith(expect.objectContaining({ p_subscription_id: 'sub_local', p_status: 'canceled' }));
  });
});

describe('subscription logic', () => {
  it('L1. prefers the entitled subscription, then the newest', () => {
    const picked = pickSubscription([sub({ id: 'old', status: 'canceled', created: 900 }), sub({ id: 'live', status: 'active', created: 10 })]);
    expect(picked?.id).toBe('live');
    expect(pickSubscription([sub({ id: 'a', status: 'canceled', created: 1 }), sub({ id: 'b', status: 'canceled', created: 2 })])?.id).toBe('b');
    expect(pickSubscription([])).toBeNull();
  });

  it('L2. no subscription at all maps to not_started without inventing data', () => {
    const snap = toSnapshot('cus_1', null, new Date('2024-01-01T00:00:00Z'));
    expect(snap.p_status).toBe('not_started');
    expect(snap.p_subscription_id).toBeNull();
    expect(snap.p_synced_at).toBe('2024-01-01T00:00:00.000Z');
  });

  it('L3. a scheduled cancellation that later ends counts as one cancellation', () => {
    const scheduled = transitionsBetween({ status: 'active', cancelAtPeriodEnd: false }, { status: 'active', cancelAtPeriodEnd: true });
    expect(scheduled.map((t) => t.name)).toEqual(['subscription_canceled']);
    const ended = transitionsBetween({ status: 'active', cancelAtPeriodEnd: true }, { status: 'canceled', cancelAtPeriodEnd: false });
    expect(ended).toEqual([]);
    const immediate = transitionsBetween({ status: 'past_due', cancelAtPeriodEnd: false }, { status: 'canceled', cancelAtPeriodEnd: false });
    expect(immediate.map((t) => t.name)).toEqual(['subscription_canceled']);
  });

  it('L4. redacts every kind of Stripe secret', () => {
    expect(safeErrorMessage(new Error('bad whsec_abc and rk_live_def and sk_test_ghi'))).not.toMatch(/whsec_abc|rk_live_def|sk_test_ghi/);
  });
});
