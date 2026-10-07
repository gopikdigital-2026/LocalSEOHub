export const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

export const ENTITLED_STATUSES = new Set(["active", "trialing"]);
const ENDED_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired"]);

const STATUS_PRIORITY = ["active", "trialing", "past_due", "incomplete", "unpaid", "paused", "canceled", "incomplete_expired"];

export interface StripeSubscriptionLike {
  id: string;
  status: string;
  created: number;
  cancel_at_period_end: boolean;
  current_period_start?: number | null;
  current_period_end?: number | null;
  trial_end?: number | null;
  items: { data: Array<{ price: { id: string }; current_period_start?: number; current_period_end?: number }> };
  default_payment_method?: string | { card?: { brand?: string; last4?: string } | null } | null;
}

export interface SubscriptionSnapshot {
  p_customer_id: string;
  p_subscription_id: string | null;
  p_price_id: string | null;
  p_status: string;
  p_current_period_start: number | null;
  p_current_period_end: number | null;
  p_trial_end: number | null;
  p_cancel_at_period_end: boolean;
  p_payment_method_brand: string | null;
  p_payment_method_last4: string | null;
  p_synced_at: string;
}

export function pickSubscription<T extends StripeSubscriptionLike>(subs: T[]): T | null {
  if (subs.length === 0) return null;
  const rank = (s: T) => {
    const i = STATUS_PRIORITY.indexOf(s.status);
    return i === -1 ? STATUS_PRIORITY.length : i;
  };
  return [...subs].sort((a, b) => rank(a) - rank(b) || b.created - a.created)[0];
}

export function toSnapshot(customerId: string, sub: StripeSubscriptionLike | null, syncedAt: Date): SubscriptionSnapshot {
  const synced = syncedAt.toISOString();
  if (!sub) {
    return {
      p_customer_id: customerId,
      p_subscription_id: null,
      p_price_id: null,
      p_status: "not_started",
      p_current_period_start: null,
      p_current_period_end: null,
      p_trial_end: null,
      p_cancel_at_period_end: false,
      p_payment_method_brand: null,
      p_payment_method_last4: null,
      p_synced_at: synced,
    };
  }
  const item = sub.items.data[0];
  const pm = sub.default_payment_method;
  const card = pm && typeof pm !== "string" ? pm.card ?? null : null;
  return {
    p_customer_id: customerId,
    p_subscription_id: sub.id,
    p_price_id: item?.price.id ?? null,
    p_status: sub.status,
    p_current_period_start: sub.current_period_start ?? item?.current_period_start ?? null,
    p_current_period_end: sub.current_period_end ?? item?.current_period_end ?? null,
    p_trial_end: sub.trial_end ?? null,
    p_cancel_at_period_end: sub.cancel_at_period_end,
    p_payment_method_brand: card?.brand ?? null,
    p_payment_method_last4: card?.last4 ?? null,
    p_synced_at: synced,
  };
}

export interface Transition {
  name: "subscription_activated" | "subscription_canceled";
  properties: Record<string, string | boolean>;
}

export function transitionsBetween(
  prev: { status: string | null; cancelAtPeriodEnd: boolean },
  next: { status: string; cancelAtPeriodEnd: boolean },
): Transition[] {
  const out: Transition[] = [];
  const wasEntitled = prev.status !== null && ENTITLED_STATUSES.has(prev.status);
  const isEntitled = ENTITLED_STATUSES.has(next.status);
  if (!wasEntitled && isEntitled) {
    out.push({ name: "subscription_activated", properties: { status: next.status } });
  }
  if (isEntitled && next.cancelAtPeriodEnd && !(wasEntitled && prev.cancelAtPeriodEnd)) {
    out.push({ name: "subscription_canceled", properties: { at_period_end: true } });
  }
  const wasEnded = prev.status !== null && ENDED_STATUSES.has(prev.status);
  const alreadyCounted = wasEntitled && prev.cancelAtPeriodEnd;
  if (ENDED_STATUSES.has(next.status) && !wasEnded && !alreadyCounted && prev.status !== null && prev.status !== "not_started") {
    out.push({ name: "subscription_canceled", properties: { at_period_end: false, status: next.status } });
  }
  return out;
}

export function safeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/(sk|rk|whsec|pk)_(live|test)?_?[A-Za-z0-9]+/g, "[redacted]").slice(0, 300);
}
