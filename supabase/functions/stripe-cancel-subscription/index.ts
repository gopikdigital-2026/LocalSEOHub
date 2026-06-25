import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  appInfo: { name: 'Bolt Integration', version: '1.0.0' },
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const { data: customer } = await supabase
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (!customer?.customer_id) return json({ error: 'No customer found' }, 404);

    const { data: sub } = await supabase
      .from('stripe_subscriptions')
      .select('subscription_id, cancel_at_period_end')
      .eq('customer_id', customer.customer_id)
      .maybeSingle();

    if (!sub?.subscription_id) return json({ error: 'No active subscription found' }, 404);

    if (sub.cancel_at_period_end) return json({ error: 'Subscription is already scheduled for cancellation' }, 400);

    const updated = await stripe.subscriptions.update(sub.subscription_id, {
      cancel_at_period_end: true,
    });

    await supabase
      .from('stripe_subscriptions')
      .update({ cancel_at_period_end: true, status: updated.status })
      .eq('customer_id', customer.customer_id);

    return json({
      success: true,
      cancel_at_period_end: true,
      current_period_end: updated.current_period_end,
    });
  } catch (err: any) {
    console.error('Cancel subscription error:', err);
    return json({ error: err.message }, 500);
  }
});
