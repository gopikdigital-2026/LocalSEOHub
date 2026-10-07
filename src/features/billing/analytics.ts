import { track } from '../../lib/analytics';
import type { BillingState } from './model';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function once(store: Store | null, key: string, fire: () => void) {
  try {
    if (store?.getItem(key)) return;
    store?.setItem(key, '1');
  } catch {
    // storage unavailable: fall through and fire once for this call
  }
  fire();
}

const local = () => (typeof localStorage === 'undefined' ? null : localStorage);
const session = () => (typeof sessionStorage === 'undefined' ? null : sessionStorage);

export function trackTrialStarted(userId: string, store: Store | null = local()) {
  once(store, `billing:${userId}:trial_started`, () => track('trial_started', { trial_days: 7 }));
}

export function trackTrialExpired(userId: string, trialEndsAt: string, store: Store | null = local()) {
  once(store, `billing:${userId}:trial_expired:${trialEndsAt}`, () => track('trial_expired', {}));
}

export function trackPaywallViewed(userId: string, surface: string, state: BillingState, store: Store | null = session()) {
  once(store, `billing:${userId}:paywall:${surface}:${state}`, () => track('paywall_viewed', { surface, state }));
}
