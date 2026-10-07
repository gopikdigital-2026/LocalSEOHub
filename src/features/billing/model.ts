export type BillingState =
  | 'TRIAL_NOT_STARTED'
  | 'TRIAL_ACTIVE'
  | 'TRIAL_EXPIRED'
  | 'SUBSCRIPTION_ACTIVE'
  | 'SUBSCRIPTION_CANCELING'
  | 'SUBSCRIPTION_PAST_DUE'
  | 'SUBSCRIPTION_CANCELED'
  | 'PAYMENT_PENDING';

const STATES: ReadonlySet<string> = new Set<BillingState>([
  'TRIAL_NOT_STARTED', 'TRIAL_ACTIVE', 'TRIAL_EXPIRED', 'SUBSCRIPTION_ACTIVE',
  'SUBSCRIPTION_CANCELING', 'SUBSCRIPTION_PAST_DUE', 'SUBSCRIPTION_CANCELED', 'PAYMENT_PENDING',
]);

export const PREMIUM_STATES: ReadonlySet<BillingState> = new Set<BillingState>([
  'TRIAL_ACTIVE', 'SUBSCRIPTION_ACTIVE', 'SUBSCRIPTION_CANCELING',
]);

export const PRICE_LABEL = { es: '9,99 €/mes', en: '€9.99/month' } as const;

export interface BillingStatus {
  state: BillingState;
  hasPremium: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  /** Server clock minus client clock in ms, so countdowns never trust a wrong device clock. */
  clockOffsetMs: number;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

export function parseBillingStatus(raw: unknown, clientNow: number = Date.now()): BillingStatus {
  if (!raw || typeof raw !== 'object') throw new Error('invalid billing status');
  const r = raw as Record<string, unknown>;
  if (typeof r.state !== 'string' || !STATES.has(r.state)) throw new Error('invalid billing state');
  const state = r.state as BillingState;
  const serverNow = str(r.server_now);
  const offset = serverNow ? Date.parse(serverNow) - clientNow : 0;
  return {
    state,
    hasPremium: r.has_premium === true && PREMIUM_STATES.has(state),
    trialStartedAt: str(r.trial_started_at),
    trialEndsAt: str(r.trial_ends_at),
    subscriptionStatus: str(r.subscription_status),
    cancelAtPeriodEnd: r.cancel_at_period_end === true,
    currentPeriodEnd: str(r.current_period_end),
    clockOffsetMs: Number.isFinite(offset) ? offset : 0,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type TrialCountdown =
  | { kind: 'days'; days: number; endsAt: Date }
  | { kind: 'today'; endsAt: Date }
  | { kind: 'ended'; endsAt: Date };

export function trialCountdown(endsAtIso: string, nowMs: number): TrialCountdown {
  const endsAt = new Date(endsAtIso);
  const remaining = endsAt.getTime() - nowMs;
  if (remaining <= 0) return { kind: 'ended', endsAt };
  if (remaining <= DAY_MS) return { kind: 'today', endsAt };
  return { kind: 'days', days: Math.ceil(remaining / DAY_MS), endsAt };
}

export function serverNow(status: Pick<BillingStatus, 'clockOffsetMs'>, clientNow: number = Date.now()): number {
  return clientNow + status.clockOffsetMs;
}

export function needsUpgrade(state: BillingState): boolean {
  return state === 'TRIAL_EXPIRED' || state === 'SUBSCRIPTION_CANCELED';
}

export function formatBillingDate(iso: string, lang: 'es' | 'en', withTime = false): string {
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(iso));
}

export class PremiumRequiredError extends Error {
  constructor() {
    super('premium_required');
    this.name = 'PremiumRequiredError';
  }
}
