import {
  HANDLED_EVENTS,
  type StripeSubscriptionLike,
  type SubscriptionSnapshot,
  pickSubscription,
  safeErrorMessage,
  toSnapshot,
  transitionsBetween,
} from "./logic.ts";

export interface WebhookEvent {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
}

export type ClaimResult = "new" | "retry" | "duplicate" | "busy";

export interface WebhookDeps {
  verify(body: string, signature: string): Promise<WebhookEvent>;
  claimEvent(event: WebhookEvent, customerId: string | null): Promise<ClaimResult>;
  finishEvent(eventId: string, status: "processed" | "failed" | "ignored", error?: string): Promise<void>;
  listSubscriptions(customerId: string): Promise<StripeSubscriptionLike[]>;
  applySnapshot(snapshot: SubscriptionSnapshot): Promise<{ applied: boolean; previous_status: string | null; previous_cancel_at_period_end: boolean | null }>;
  resolveUserId(customerId: string): Promise<string | null>;
  track(userId: string | null, name: string, properties: Record<string, unknown>): Promise<void>;
  now?: () => Date;
  log?: (message: string) => void;
}

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function customerOf(obj: Record<string, unknown>): string | null {
  const c = obj.customer;
  if (typeof c === "string") return c;
  if (c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string") return (c as { id: string }).id;
  return null;
}

export function createWebhookHandler(deps: WebhookDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((m: string) => console.error(m));

  return async function handle(req: Request): Promise<Response> {
    if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

    const signature = req.headers.get("stripe-signature");
    if (!signature) return reply({ error: "Missing signature" }, 400);

    const body = await req.text();
    let event: WebhookEvent;
    try {
      event = await deps.verify(body, signature);
    } catch {
      return reply({ error: "Invalid signature" }, 400);
    }

    if (!HANDLED_EVENTS.has(event.type)) return reply({ received: true, ignored: true });

    const obj = event.data.object ?? {};
    const customerId = customerOf(obj);

    let claim: ClaimResult;
    try {
      claim = await deps.claimEvent(event, customerId);
    } catch (err) {
      log(`webhook claim failed for ${event.id}: ${safeErrorMessage(err)}`);
      return reply({ error: "Temporary failure" }, 500);
    }
    if (claim === "duplicate") return reply({ received: true, duplicate: true });
    if (claim === "busy") return reply({ error: "Event in progress" }, 409);

    try {
      if (!customerId) {
        await deps.finishEvent(event.id, "ignored");
        return reply({ received: true, ignored: true });
      }
      if (event.type === "checkout.session.completed" && obj.mode !== "subscription") {
        await deps.finishEvent(event.id, "ignored");
        return reply({ received: true, ignored: true });
      }

      const userId = await deps.resolveUserId(customerId);

      const fetchedAt = now();
      const subs = await deps.listSubscriptions(customerId);
      const chosen = pickSubscription(subs);
      const snapshot = toSnapshot(customerId, chosen, fetchedAt);
      const result = await deps.applySnapshot(snapshot);

      if (event.type === "checkout.session.completed") {
        await deps.track(userId, "checkout_completed", { payment_status: String(obj.payment_status ?? "unknown") });
      }
      if (event.type === "invoice.payment_failed") {
        await deps.track(userId, "payment_failed", { billing_reason: String(obj.billing_reason ?? "unknown") });
      }

      if (result.applied) {
        const transitions = transitionsBetween(
          { status: result.previous_status, cancelAtPeriodEnd: !!result.previous_cancel_at_period_end },
          { status: snapshot.p_status, cancelAtPeriodEnd: snapshot.p_cancel_at_period_end },
        );
        for (const t of transitions) await deps.track(userId, t.name, t.properties);
      }

      await deps.finishEvent(event.id, "processed");
      return reply({ received: true });
    } catch (err) {
      const message = safeErrorMessage(err);
      log(`webhook processing failed for ${event.id}: ${message}`);
      try {
        await deps.finishEvent(event.id, "failed", message);
      } catch {
        // the retry from Stripe will reclaim the event
      }
      return reply({ error: "Processing failed" }, 500);
    }
  };
}
