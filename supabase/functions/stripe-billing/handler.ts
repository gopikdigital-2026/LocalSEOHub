import {
  BLOCKING_STATUSES,
  ENTITLED_STATUSES,
  type StripeSubscriptionLike,
  type SubscriptionSnapshot,
  billingReturnUrl,
  pickSubscription,
  safeErrorMessage,
  toSnapshot,
  transitionsBetween,
} from "./logic.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export type BillingAction = "checkout" | "portal" | "payment_method" | "cancel" | "resume" | "sync";
const ACTIONS = new Set<BillingAction>(["checkout", "portal", "payment_method", "cancel", "resume", "sync"]);

export interface BillingUser {
  id: string;
  email: string | null;
}

export interface BillingDeps {
  getUser(authorization: string): Promise<BillingUser | null>;
  findCustomer(userId: string): Promise<string | null>;
  createCustomer(user: BillingUser): Promise<string>;
  listSubscriptions(customerId: string): Promise<StripeSubscriptionLike[]>;
  resolvePrice(): Promise<{ ok: true; priceId: string } | { ok: false; reason: string }>;
  findOpenCheckout(customerId: string, priceId: string): Promise<string | null>;
  /** Unix seconds when the in-app trial ends, or null when no trial is running. */
  trialEndsAt(userId: string): Promise<number | null>;
  createCheckout(params: { customerId: string; priceId: string; userId: string; successUrl: string; cancelUrl: string; billingAnchor: number | null }): Promise<string>;
  createPortal(customerId: string, returnUrl: string, flow: "payment_method_update" | null): Promise<string>;
  setCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<void>;
  applySnapshot(snapshot: SubscriptionSnapshot): Promise<{ applied: boolean; previous_status: string | null; previous_cancel_at_period_end: boolean | null }>;
  track(userId: string, name: string, properties: Record<string, unknown>): Promise<void>;
  siteUrl: string | undefined;
  now?: () => Date;
  log?: (message: string) => void;
}

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

export function createBillingHandler(deps: BillingDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((m: string) => console.error(m));

  async function reconcile(userId: string, customerId: string): Promise<StripeSubscriptionLike | null> {
    const fetchedAt = now();
    const subs = await deps.listSubscriptions(customerId);
    const chosen = pickSubscription(subs);
    const snapshot = toSnapshot(customerId, chosen, fetchedAt);
    const result = await deps.applySnapshot(snapshot);
    if (result.applied) {
      const transitions = transitionsBetween(
        { status: result.previous_status, cancelAtPeriodEnd: !!result.previous_cancel_at_period_end },
        { status: snapshot.p_status, cancelAtPeriodEnd: snapshot.p_cancel_at_period_end },
      );
      for (const t of transitions) await deps.track(userId, t.name, t.properties);
    }
    return chosen;
  }

  return async function handle(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });
    if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405);

    try {
      const authorization = req.headers.get("Authorization");
      if (!authorization) return reply({ error: "unauthorized" }, 401);
      const user = await deps.getUser(authorization);
      if (!user) return reply({ error: "unauthorized" }, 401);

      let action: unknown;
      try {
        action = (await req.json())?.action;
      } catch {
        return reply({ error: "invalid_request" }, 400);
      }
      if (typeof action !== "string" || !ACTIONS.has(action as BillingAction)) {
        return reply({ error: "invalid_request" }, 400);
      }

      const existingCustomer = await deps.findCustomer(user.id);

      if (action === "checkout") {
        const successUrl = billingReturnUrl(deps.siteUrl, "success");
        const cancelUrl = billingReturnUrl(deps.siteUrl, "cancel");
        if (!successUrl || !cancelUrl) return reply({ error: "billing_unavailable" }, 503);

        if (existingCustomer) {
          const subs = await deps.listSubscriptions(existingCustomer);
          if (subs.some((s) => BLOCKING_STATUSES.has(s.status))) {
            await reconcile(user.id, existingCustomer);
            return reply({ error: "already_subscribed" }, 409);
          }
        }

        const price = await deps.resolvePrice();
        if (!price.ok) {
          log(`checkout refused: ${price.reason}`);
          return reply({ error: "billing_unavailable" }, 503);
        }

        const customerId = existingCustomer ?? (await deps.createCustomer(user));
        const open = await deps.findOpenCheckout(customerId, price.priceId);
        if (open) return reply({ url: open, reused: true });

        const trialEnd = await deps.trialEndsAt(user.id);
        // Subscribing mid-trial must not charge before the trial ends, so the first invoice is anchored there.
        const billingAnchor = trialEnd !== null && trialEnd * 1000 - now().getTime() > 60 * 60 * 1000 ? trialEnd : null;
        const url = await deps.createCheckout({ customerId, priceId: price.priceId, userId: user.id, successUrl, cancelUrl, billingAnchor });
        await deps.track(user.id, "checkout_started", { source: "server" });
        return reply({ url });
      }

      if (!existingCustomer) {
        if (action === "sync") return reply({ ok: true, synced: false });
        return reply({ error: "no_subscription" }, 404);
      }

      if (action === "portal" || action === "payment_method") {
        const returnUrl = billingReturnUrl(deps.siteUrl, "portal");
        if (!returnUrl) return reply({ error: "billing_unavailable" }, 503);
        const url = await deps.createPortal(existingCustomer, returnUrl, action === "payment_method" ? "payment_method_update" : null);
        return reply({ url });
      }

      if (action === "sync") {
        await reconcile(user.id, existingCustomer);
        return reply({ ok: true, synced: true });
      }

      const current = pickSubscription(await deps.listSubscriptions(existingCustomer));
      if (!current || !ENTITLED_STATUSES.has(current.status)) return reply({ error: "no_subscription" }, 404);

      const wantCancel = action === "cancel";
      if (!!current.cancel_at_period_end === wantCancel) {
        await reconcile(user.id, existingCustomer);
        return reply({ ok: true, unchanged: true });
      }

      await deps.setCancelAtPeriodEnd(current.id, wantCancel);
      await reconcile(user.id, existingCustomer);
      return reply({ ok: true });
    } catch (err) {
      log(`billing action failed: ${safeErrorMessage(err)}`);
      return reply({ error: "billing_failed" }, 500);
    }
  };
}
