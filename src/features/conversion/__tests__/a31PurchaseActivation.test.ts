import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackPurchaseAfterCheckout, isNewConfirmedSubscription, purchaseKey, type SubscriptionRow } from '../../billing/purchase';
import { CHECKOUT_MARK_KEY, markCheckoutStarted } from '../../billing/conversion';
import { activationKey, trackFirstValueActivation } from '../activation';
import { advanceActivation } from '../../activation/service';
import type { BusinessRecord } from '../../business-memory/businessRecord';
import { CONSENT_KEY } from '../../../lib/consent';

const root = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

const NOW = Date.parse('2026-10-19T12:00:00Z');
const sec = (ms: number) => Math.floor(ms / 1000);

function memoryStore() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

function billingDb(opts: { state?: string; premium?: boolean; row?: SubscriptionRow | null }) {
  const counts = { rpc: 0, from: 0 };
  const chain = {
    select: () => chain, is: () => chain, order: () => chain, limit: () => chain,
    maybeSingle: async () => ({ data: opts.row ?? null, error: null }),
  };
  const db = {
    rpc: async () => {
      counts.rpc++;
      return { data: { state: opts.state ?? 'SUBSCRIPTION_ACTIVE', has_premium: opts.premium ?? true, server_now: new Date().toISOString() }, error: null };
    },
    from: () => { counts.from++; return chain; },
    functions: {},
  };
  return { db: db as never, counts };
}

let fbq: ReturnType<typeof vi.fn>;
const ls = memoryStore();
// Events reach the pixel only with stored advertising consent (A3.5.1A); clearing keeps that decision.
const grantConsent = () => ls.setItem(CONSENT_KEY, JSON.stringify({ version: 1, advertising: true, decidedAt: '2026-06-01T00:00:00.000Z' }));
grantConsent();
(globalThis as unknown as { localStorage: unknown }).localStorage = { ...ls, clear: () => { ls.m.clear(); grantConsent(); } };
beforeEach(() => {
  fbq = vi.fn();
  (globalThis as unknown as { window: unknown }).window = { fbq };
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});
const purchases = () => fbq.mock.calls.filter((c) => c[1] === 'Purchase');
const activations = () => fbq.mock.calls.filter((c) => c[1] === 'Activation');

const freshRow = (id = 'sub_new', startMs = NOW - 60_000): SubscriptionRow => ({ subscription_id: id, status: 'active', current_period_start: sec(startMs) });

describe('A3.1 Purchase', () => {
  it('?checkout=success without a confirmed subscription: 0 Purchase', async () => {
    const store = memoryStore();
    markCheckoutStarted(store, NOW - 120_000);
    for (const opts of [
      { state: 'TRIAL_ACTIVE', row: null },
      { state: 'PAYMENT_PENDING', premium: false, row: { ...freshRow(), status: 'incomplete' } },
      { state: 'SUBSCRIPTION_ACTIVE', row: null },
    ]) {
      expect(await trackPurchaseAfterCheckout(billingDb(opts).db, store, NOW)).toBe(false);
    }
    expect(purchases()).toHaveLength(0);
    expect(store.m.has(CHECKOUT_MARK_KEY)).toBe(true);
  });

  it('historical Premium with no checkout from this browser: 0 Purchase, not even a read', async () => {
    const { db, counts } = billingDb({ row: freshRow() });
    expect(await trackPurchaseAfterCheckout(db, memoryStore(), NOW)).toBe(false);
    expect(counts).toEqual({ rpc: 0, from: 0 });
    expect(purchases()).toHaveLength(0);
  });

  it('historical subscription older than the checkout: 0 Purchase', async () => {
    const store = memoryStore();
    markCheckoutStarted(store, NOW - 120_000);
    const old = freshRow('sub_old', NOW - 40 * 24 * 3600_000);
    expect(await trackPurchaseAfterCheckout(billingDb({ row: old }).db, store, NOW)).toBe(false);
    expect(purchases()).toHaveLength(0);
  });

  it('stale checkout mark (over 24 h): 0 Purchase', () => {
    expect(isNewConfirmedSubscription({
      status: { state: 'SUBSCRIPTION_ACTIVE', hasPremium: true, clockOffsetMs: 0 },
      row: freshRow(), checkoutStartedAt: NOW - 25 * 3600_000, clientNow: NOW,
    })).toBe(false);
  });

  it('new confirmed subscription: exactly 1 Purchase, 9.99 EUR, no PII', async () => {
    const store = memoryStore();
    markCheckoutStarted(store, NOW - 120_000);
    expect(await trackPurchaseAfterCheckout(billingDb({ row: freshRow() }).db, store, NOW)).toBe(true);
    expect(purchases()).toHaveLength(1);
    expect(fbq).toHaveBeenCalledWith('track', 'Purchase', { value: 9.99, currency: 'EUR' });
    expect(store.m.get(purchaseKey('sub_new'))).toBe('1');
    expect(store.m.has(CHECKOUT_MARK_KEY)).toBe(false);
    expect([...store.m.keys()].join(' ')).not.toMatch(/@|cus_|cs_|https?:/);
  });

  it('repeated fetch, remount, reload and revisiting checkout=success: still 1', async () => {
    const store = memoryStore();
    markCheckoutStarted(store, NOW - 120_000);
    const { db } = billingDb({ row: freshRow() });
    await Promise.all([trackPurchaseAfterCheckout(db, store, NOW), trackPurchaseAfterCheckout(db, store, NOW)]);
    await trackPurchaseAfterCheckout(db, store, NOW + 1000);
    markCheckoutStarted(store, NOW - 60_000);
    await trackPurchaseAfterCheckout(db, store, NOW + 2000);
    expect(purchases()).toHaveLength(1);
  });

  it('two different valid subscriptions: each counted once', async () => {
    const store = memoryStore();
    markCheckoutStarted(store, NOW - 120_000);
    await trackPurchaseAfterCheckout(billingDb({ row: freshRow('sub_a') }).db, store, NOW);
    const later = NOW + 40 * 24 * 3600_000;
    markCheckoutStarted(store, later - 120_000);
    await trackPurchaseAfterCheckout(billingDb({ row: freshRow('sub_b', later - 60_000) }).db, store, later);
    await trackPurchaseAfterCheckout(billingDb({ row: freshRow('sub_b', later - 60_000) }).db, store, later);
    expect(purchases()).toHaveLength(2);
  });

  it('a failed read never fires', async () => {
    const store = memoryStore();
    markCheckoutStarted(store, NOW - 120_000);
    const db = { rpc: async () => ({ data: null, error: new Error('x') }), from: () => { throw new Error('x'); }, functions: {} };
    expect(await trackPurchaseAfterCheckout(db as never, store, NOW)).toBe(false);
    expect(purchases()).toHaveLength(0);
  });

  it('checkout mark is set only next to InitiateCheckout, after a valid Checkout URL', () => {
    const hook = read('src/features/billing/useBillingAction.ts');
    expect(hook.indexOf('markCheckoutStarted(browserStore())')).toBeGreaterThan(hook.indexOf('if (url) {'));
    expect(hook.indexOf('markCheckoutStarted(browserStore())')).toBeLessThan(hook.indexOf('window.location.assign(url)'));
  });

  it('billing core and Stripe functions are untouched by Purchase', () => {
    for (const f of ['src/features/billing/BillingProvider.tsx', 'src/features/billing/model.ts', 'src/features/billing/repository.ts',
      'supabase/functions/stripe-webhook/handler.ts', 'supabase/functions/stripe-billing/handler.ts']) {
      expect(read(f)).not.toMatch(/fbq|trackPurchase|pixel/);
    }
  });
});

describe('A3.1 Activation', () => {
  const business = {
    id: '11111111-1111-4111-8111-111111111111', name: 'Bar', category: 'bar', city: 'Madrid', primary_goal: 'more_calls',
    created_at: '2026-10-01T00:00:00Z', onboarding_completed: true, onboarding_completed_at: '2026-10-01T00:00:00Z',
  } as unknown as BusinessRecord;

  function progressDb(initial: Record<string, string> = {}) {
    let stored: Record<string, string> = { ...initial };
    let exists = Object.keys(initial).length > 0;
    const db = {
      from: () => {
        const q = {
          select: () => q, eq: () => q,
          maybeSingle: async () => ({ data: exists ? { id: 'p1', milestones: stored } : null, error: null }),
          update: (v: { milestones: Record<string, string> }) => { stored = v.milestones; return { eq: async () => ({ error: null }) }; },
          insert: async (v: { milestones: Record<string, string> }) => { stored = v.milestones; exists = true; return { error: null }; },
        };
        return q;
      },
    };
    return { db: db as never, stored: () => stored };
  }

  const useful = { type: 'action_completed', action: { sourceType: 'BUSINESS_PROFILE' } } as const;

  it('before the first useful result: 0 Activation', async () => {
    localStorage.clear();
    const { db } = progressDb();
    await advanceActivation('u1', business, {}, { type: 'recommendations_available', count: 3 }, null, db);
    await advanceActivation('u1', business, {}, { type: 'action_started', action: { sourceType: 'SOURCE_REQUIRED' } }, null, db);
    expect(activations()).toHaveLength(0);
  });

  it('first useful result: 1 Activation; second result, reload, new session: still 1', async () => {
    localStorage.clear();
    const p = progressDb();
    const first = await advanceActivation('u1', business, {}, useful, null, p.db);
    expect(first.added).toContain('first_value_reached');
    await advanceActivation('u1', business, first.milestones, useful, null, p.db);
    await advanceActivation('u1', business, {}, useful, null, p.db);
    expect(trackFirstValueActivation('u1')).toBe(false);
    expect(activations()).toHaveLength(1);
    expect(fbq).toHaveBeenCalledWith('trackCustom', 'Activation', {});
    expect(localStorage.getItem(activationKey('u1'))).toBe('1');
  });

  it('a second business of the same user does not re-activate', async () => {
    localStorage.clear();
    await advanceActivation('u1', business, {}, useful, null, progressDb().db);
    await advanceActivation('u1', { ...business, id: '22222222-2222-4222-8222-222222222222' } as BusinessRecord, {}, useful, null, progressDb().db);
    expect(activations()).toHaveLength(1);
  });
});
