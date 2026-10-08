import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { createWebhookHandler, type WebhookEvent } from './handler.ts';
import { type StripeSubscriptionLike, planPriceIdsFromEnv } from './logic.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  appInfo: { name: 'Bolt Integration', version: '1.0.0' },
});
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const STALE_PROCESSING_MS = 2 * 60 * 1000;

const handle = createWebhookHandler({
  planPriceIds: planPriceIdsFromEnv(Deno.env.get('STRIPE_PRICE_ID')),

  async verify(body, signature) {
    const event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    return event as unknown as WebhookEvent;
  },

  async claimEvent(event, customerId) {
    const { error } = await supabase.from('stripe_webhook_events').insert({
      event_id: event.id,
      event_type: event.type,
      stripe_created_at: new Date(event.created * 1000).toISOString(),
      customer_id: customerId,
      status: 'processing',
      attempts: 1,
    });
    if (!error) return 'new';
    if (error.code !== '23505') throw error;

    const { data, error: readError } = await supabase
      .from('stripe_webhook_events')
      .select('status, attempts, received_at, processed_at')
      .eq('event_id', event.id)
      .maybeSingle();
    if (readError || !data) throw readError ?? new Error('event claim lookup failed');
    if (data.status === 'processed' || data.status === 'ignored') return 'duplicate';

    const lastTouch = new Date(data.processed_at ?? data.received_at).getTime();
    if (data.status === 'processing' && Date.now() - lastTouch < STALE_PROCESSING_MS) return 'busy';

    const { data: reclaimed, error: updateError } = await supabase
      .from('stripe_webhook_events')
      .update({ status: 'processing', attempts: (data.attempts ?? 1) + 1, processed_at: new Date().toISOString() })
      .eq('event_id', event.id)
      .eq('status', data.status)
      .eq('attempts', data.attempts)
      .select('event_id');
    if (updateError) throw updateError;
    return reclaimed && reclaimed.length > 0 ? 'retry' : 'busy';
  },

  async finishEvent(eventId, status, lastError) {
    const { error } = await supabase
      .from('stripe_webhook_events')
      .update({ status, last_error: lastError ?? null, processed_at: new Date().toISOString() })
      .eq('event_id', eventId);
    if (error) throw error;
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

  async resolveUserId(customerId) {
    const { data, error } = await supabase
      .from('stripe_customers')
      .select('user_id')
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data?.user_id ?? null;
  },

  async track(userId, name, properties) {
    const { error } = await supabase.from('analytics_events').insert({
      session_id: 'stripe-webhook',
      user_id: userId,
      event_name: name,
      properties: { ...properties, source: 'stripe_webhook' },
    });
    if (error) console.error(`analytics insert failed for ${name}`);
  },
});

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch {
    return new Response(JSON.stringify({ error: 'Processing failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
