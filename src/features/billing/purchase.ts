import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { browserStore, fireOnce, trackPurchase } from '../../lib/pixel';
import { fetchBillingStatus } from './repository';
import { CHECKOUT_MARK_KEY, PLAN_PRICE } from './conversion';
import type { BillingStatus } from './model';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Db = Pick<SupabaseClient, 'from' | 'rpc' | 'functions'>;

export interface SubscriptionRow {
  subscription_id: string | null;
  status: string | null;
  current_period_start: number | null;
}

/** A checkout older than this cannot be the one that produced the subscription the user is returning with. */
export const PURCHASE_WINDOW_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export function purchaseKey(subscriptionId: string) {
  return `pixel:purchase:${subscriptionId}`;
}

/**
 * A Purchase needs all of: billing reports a paid subscription, the payment system's row is active,
 * this browser started a checkout recently, and the subscription period began after that checkout.
 * A Premium user who never checked out from this browser, or whose subscription predates it, never qualifies.
 */
export function isNewConfirmedSubscription(input: {
  status: Pick<BillingStatus, 'state' | 'hasPremium' | 'clockOffsetMs'> | null;
  row: SubscriptionRow | null;
  checkoutStartedAt: number | null;
  clientNow: number;
}): input is typeof input & { row: SubscriptionRow & { subscription_id: string } } {
  const { status, row, checkoutStartedAt, clientNow } = input;
  if (!status || !status.hasPremium || status.state !== 'SUBSCRIPTION_ACTIVE') return false;
  if (!row || row.status !== 'active' || !row.subscription_id || typeof row.current_period_start !== 'number') return false;
  if (checkoutStartedAt === null || !Number.isFinite(checkoutStartedAt)) return false;
  const serverNow = clientNow + status.clockOffsetMs;
  const checkoutAt = checkoutStartedAt + status.clockOffsetMs;
  const periodStart = row.current_period_start * 1000;
  if (serverNow - checkoutAt > PURCHASE_WINDOW_MS) return false;
  return periodStart >= checkoutAt - CLOCK_SKEW_MS && periodStart <= serverNow + CLOCK_SKEW_MS;
}

function readMark(store: Store | null): number | null {
  try {
    const raw = store?.getItem(CHECKOUT_MARK_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

async function loadSubscription(db: Db): Promise<SubscriptionRow | null> {
  const { data, error } = await db
    .from('stripe_subscriptions')
    .select('subscription_id, status, current_period_start')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as SubscriptionRow;
}

/** Called once after the Stripe return has been reconciled; never polls. Returns true only when it sent the event. */
export async function trackPurchaseAfterCheckout(
  db: Db = supabase,
  store: Store | null = browserStore() as Store | null,
  clientNow: number = Date.now(),
): Promise<boolean> {
  const checkoutStartedAt = readMark(store);
  if (checkoutStartedAt === null) return false;
  try {
    const [status, row] = await Promise.all([fetchBillingStatus(db), loadSubscription(db)]);
    const input = { status, row, checkoutStartedAt, clientNow };
    if (!isNewConfirmedSubscription(input)) return false;
    const sent = fireOnce(purchaseKey(input.row.subscription_id), () => trackPurchase(PLAN_PRICE), store);
    try { store?.removeItem(CHECKOUT_MARK_KEY); } catch { /* the per-subscription key still blocks repeats */ }
    return sent;
  } catch {
    return false;
  }
}
