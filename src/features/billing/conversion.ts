import type { Money } from '../../lib/pixel';

/** Mirrors the server-enforced plan (stripe-billing PLAN: eur, 999 cents, monthly); a test keeps the two in sync. */
export const PLAN_PRICE: Money = { value: 9.99, currency: 'EUR' };

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export const CHECKOUT_MARK_KEY = 'pixel:checkout_started_at';

/** Remembers only when this browser was sent to Checkout, so a later Purchase can prove it follows that checkout. */
export function markCheckoutStarted(store: Store | null, now: number = Date.now()) {
  try {
    store?.setItem(CHECKOUT_MARK_KEY, String(now));
  } catch {
    // storage unavailable: no Purchase will be attributed to this browser
  }
}
