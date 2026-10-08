import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { createBillingHandler } from './handler.ts';
import { type StripePriceLike, type StripeSubscriptionLike, planPriceIdsFromEnv, validatePrice } from './logic.ts';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripe = new Stripe(stripeSecret, { appInfo: { name: 'Bolt Integration', version: '1.0.0' } });
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const PRICE_LOOKUP_KEY = 'localseohub_monthly_eur_999';
const expectLive = /^(sk|rk)_live_/.test(stripeSecret);

async function retrievePrice(id: string): Promise<StripePriceLike | null> {
  try {
    return (await stripe.prices.retrieve(id)) as unknown as StripePriceLike;
  } catch {
    return null;
  }
}

const handle = createBillingHandler({
  siteUrl: Deno.env.get('SITE_URL'),
  planPriceIds: planPriceIdsFromEnv(Deno.env.get('STRIPE_PRICE_ID')),

  async getUser(authorization) {
    const token = authorization.replace(/^Bearer\s+/i, '');
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  },

  async findCustomer(userId) {
    const { data, error } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data?.customer_id ?? null;
  },

  async createCustomer(user) {
    const customer = await stripe.customers.create(
      { email: user.email ?? undefined, metadata: { userId: user.id } },
      { idempotencyKey: `customer-${user.id}` },
    );
    const { error } = await supabase.from('stripe_customers').insert({ user_id: user.id, customer_id: customer.id });
    if (error) {
      if (error.code !== '23505') throw error;
      const { data, error: readError } = await supabase
        .from('stripe_customers')
        .select('customer_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (readError || !data?.customer_id) throw readError ?? new Error('customer mapping conflict');
      return data.customer_id;
    }
    return customer.id;
  },

  async listSubscriptions(customerId) {
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 20,
      expand: ['data.default_payment_method'],
    });
    return subs.data as unknown as StripeSubscriptionLike[];
  },

  async resolvePrice() {
    // Never fall back to another price when one is configured: a wrong fallback would charge for a different product.
    const configured = Deno.env.get('STRIPE_PRICE_ID')?.trim().replace(/^["']|["']$/g, '');
    let price: StripePriceLike | null;
    if (configured) {
      price = await retrievePrice(configured);
      if (!price) return { ok: false as const, reason: 'configured_price_not_found_for_this_stripe_key' };
    } else {
      const byLookup = await stripe.prices.list({ lookup_keys: [PRICE_LOOKUP_KEY], active: true, limit: 1 });
      price = (byLookup.data[0] as unknown as StripePriceLike) ?? null;
      if (!price) return { ok: false as const, reason: 'price_not_configured' };
    }
    const check = validatePrice(price, expectLive);
    return check.ok ? { ok: true as const, priceId: price.id } : { ok: false as const, reason: check.reason };
  },

  async findOpenCheckout(customerId, priceId) {
    const sessions = await stripe.checkout.sessions.list({
      customer: customerId,
      status: 'open',
      limit: 5,
      expand: ['data.line_items'],
    });
    const match = sessions.data.find(
      (s) => s.mode === 'subscription' && s.url && s.line_items?.data.some((li) => li.price?.id === priceId),
    );
    return match?.url ?? null;
  },

  async trialEndsAt(userId) {
    const { data, error } = await supabase.rpc('billing_state_for', { p_user_id: userId });
    if (error) throw error;
    const state = data as { state?: string; trial_ends_at?: string | null } | null;
    if (state?.state !== 'TRIAL_ACTIVE' || !state.trial_ends_at) return null;
    return Math.floor(Date.parse(state.trial_ends_at) / 1000);
  },

  async createCheckout({ customerId, priceId, userId, successUrl, cancelUrl, billingAnchor }) {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { userId },
        ...(billingAnchor ? { billing_cycle_anchor: billingAnchor, proration_behavior: 'none' as const } : {}),
      },
      metadata: { userId },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    if (!session.url) throw new Error('checkout session has no url');
    return session.url;
  },

  async createPortal(customerId, returnUrl, flow) {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      ...(flow ? { flow_data: { type: flow } } : {}),
    });
    return session.url;
  },

  async setCancelAtPeriodEnd(subscriptionId, cancel) {
    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: cancel });
  },

  async applySnapshot(snapshot) {
    const { data, error } = await supabase.rpc('apply_stripe_subscription_snapshot', snapshot);
    if (error) throw error;
    const result = (data ?? {}) as Record<string, unknown>;
    return {
      applied: result.applied === true,
      previous_status: typeof result.previous_status === 'string' ? result.previous_status : null,
      previous_cancel_at_period_end: result.previous_cancel_at_period_end === true,
    };
  },

  async track(userId, name, properties) {
    const { error } = await supabase.from('analytics_events').insert({
      session_id: 'stripe-billing',
      user_id: userId,
      event_name: name,
      properties: { ...properties, source: 'stripe_billing' },
    });
    if (error) console.error(`analytics insert failed for ${name}`);
  },
});

Deno.serve(handle);
