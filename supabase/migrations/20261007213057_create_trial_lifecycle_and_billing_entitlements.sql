/*
# Trial lifecycle, billing entitlement and Stripe webhook idempotency

## Plain-English summary
LocalSEOHub now has ONE authoritative, server-side record of each user's free trial and a
single database function that decides what a user may do (trial active, trial expired,
subscribed, payment problem...). The browser can read its own status but can never change
trial dates or subscription data. Stripe webhook events are logged so each one is processed
once, and an out-of-date Stripe snapshot can never overwrite a newer one.

## 1. New tables
- `user_trials` - one row per user, created only when the user explicitly starts the trial.
  - `user_id` (uuid, PK, references auth.users) - one trial per account, ever.
  - `started_at`, `ends_at` (timestamptz, UTC) - `ends_at` is always exactly started_at + 7 days (CHECK).
  - `origin` ('explicit' | 'legacy_stripe' | 'manual_review') - how the trial was created.
  - `created_at`.
- `stripe_webhook_events` - processing log keyed by Stripe event id (idempotency + diagnosis).
  - `event_id` (PK), `event_type`, `stripe_created_at`, `customer_id`, `status`
    ('processing' | 'processed' | 'failed' | 'ignored'), `attempts`, `last_error`
    (short message, never secrets), `received_at`, `processed_at`.

## 2. Modified tables
- `stripe_subscriptions`: new `last_synced_at` (timestamptz) used to reject stale snapshots.
- No data is removed or rewritten. Existing rows are untouched.

## 3. New functions
- `billing_state_for(uuid)` (service role only) - computes the effective access state.
- `billing_status()` (signed-in users) - the caller's own state, derived from auth.uid().
- `current_user_has_premium()` (signed-in users) - boolean used by row policies.
- `start_trial()` (signed-in users) - idempotent explicit trial start. Never restarts,
  never starts for someone who already has or had a paid subscription.
- `apply_stripe_subscription_snapshot(...)` (service role only) - atomic upsert of the
  Stripe projection that ignores snapshots older than the stored one and returns the
  previous status so the webhook can detect real transitions.

## 4. Security
- RLS enabled on both new tables. `user_trials`: owner may SELECT only; no client writes.
  `stripe_webhook_events`: no client access at all.
- Client INSERT/UPDATE/DELETE privileges revoked on Stripe-controlled tables
  (stripe_customers, stripe_subscriptions, stripe_orders), the two Stripe views, the unused
  legacy `subscriptions` table, and the legacy billing columns on `profiles`
  (stripe_subscription_status, stripe_customer_id). Reads are unchanged.
- `business_actions`: new RESTRICTIVE insert/update policies require an active trial or
  subscription. Reading actions (and deleting nothing new) stays allowed, so preserved
  work is always visible after the trial ends.

## 5. Existing-user migration
- Users with real Stripe trial evidence (`stripe_subscriptions.trial_end`) get a
  `legacy_stripe` trial row with the original dates. Nobody else is granted or revoked
  anything automatically; other users must start the trial explicitly.
*/

CREATE TABLE IF NOT EXISTS public.user_trials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  origin text NOT NULL DEFAULT 'explicit',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_trials_origin_check CHECK (origin IN ('explicit', 'legacy_stripe', 'manual_review')),
  CONSTRAINT user_trials_seven_days CHECK (ends_at = started_at + interval '7 days')
);

ALTER TABLE public.user_trials ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE ON public.user_trials FROM anon, authenticated;
REVOKE ALL ON public.user_trials FROM anon;

DROP POLICY IF EXISTS "Users can read own trial" ON public.user_trials;
CREATE POLICY "Users can read own trial" ON public.user_trials FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "No client trial inserts" ON public.user_trials;
CREATE POLICY "No client trial inserts" ON public.user_trials FOR INSERT
  TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "No client trial updates" ON public.user_trials;
CREATE POLICY "No client trial updates" ON public.user_trials FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "No client trial deletes" ON public.user_trials;
CREATE POLICY "No client trial deletes" ON public.user_trials FOR DELETE
  TO authenticated USING (false);

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  stripe_created_at timestamptz,
  customer_id text,
  status text NOT NULL DEFAULT 'processing',
  attempts integer NOT NULL DEFAULT 1,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT stripe_webhook_events_status_check CHECK (status IN ('processing', 'processed', 'failed', 'ignored'))
);
CREATE INDEX IF NOT EXISTS stripe_webhook_events_customer_idx ON public.stripe_webhook_events (customer_id);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stripe_webhook_events FROM anon, authenticated;
DROP POLICY IF EXISTS "No client webhook reads" ON public.stripe_webhook_events;
CREATE POLICY "No client webhook reads" ON public.stripe_webhook_events FOR SELECT
  TO authenticated USING (false);
DROP POLICY IF EXISTS "No client webhook inserts" ON public.stripe_webhook_events;
CREATE POLICY "No client webhook inserts" ON public.stripe_webhook_events FOR INSERT
  TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "No client webhook updates" ON public.stripe_webhook_events;
CREATE POLICY "No client webhook updates" ON public.stripe_webhook_events FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "No client webhook deletes" ON public.stripe_webhook_events;
CREATE POLICY "No client webhook deletes" ON public.stripe_webhook_events FOR DELETE
  TO authenticated USING (false);

ALTER TABLE public.stripe_subscriptions ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

REVOKE INSERT, UPDATE, DELETE ON public.stripe_customers FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.stripe_subscriptions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.stripe_orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.stripe_user_subscriptions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.stripe_user_orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM anon, authenticated;
REVOKE UPDATE (stripe_subscription_status, stripe_customer_id) ON public.profiles FROM anon, authenticated;
DO $$
BEGIN
  REVOKE UPDATE ON public.profiles FROM anon, authenticated;
  GRANT UPDATE (email, full_name) ON public.profiles TO authenticated;
END $$;

CREATE OR REPLACE FUNCTION public.billing_state_for(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_trial_start timestamptz;
  v_trial_end timestamptz;
  v_status text;
  v_cancel boolean;
  v_period_end bigint;
  v_stripe_trial_end bigint;
  v_state text;
BEGIN
  SELECT started_at, ends_at INTO v_trial_start, v_trial_end
  FROM user_trials WHERE user_id = p_user_id;

  SELECT ss.status::text, coalesce(ss.cancel_at_period_end, false), ss.current_period_end, ss.trial_end
  INTO v_status, v_cancel, v_period_end, v_stripe_trial_end
  FROM stripe_customers c
  JOIN stripe_subscriptions ss ON ss.customer_id = c.customer_id AND ss.deleted_at IS NULL
  WHERE c.user_id = p_user_id AND c.deleted_at IS NULL
  LIMIT 1;

  v_state := CASE
    WHEN v_status IN ('active', 'trialing') AND v_cancel THEN 'SUBSCRIPTION_CANCELING'
    WHEN v_status IN ('active', 'trialing') THEN 'SUBSCRIPTION_ACTIVE'
    WHEN v_trial_end IS NOT NULL AND v_now < v_trial_end THEN 'TRIAL_ACTIVE'
    WHEN v_status = 'past_due' THEN 'SUBSCRIPTION_PAST_DUE'
    WHEN v_status = 'incomplete' THEN 'PAYMENT_PENDING'
    WHEN v_status IN ('canceled', 'unpaid', 'incomplete_expired', 'paused') THEN 'SUBSCRIPTION_CANCELED'
    WHEN v_trial_end IS NOT NULL THEN 'TRIAL_EXPIRED'
    ELSE 'TRIAL_NOT_STARTED'
  END;

  RETURN jsonb_build_object(
    'state', v_state,
    'has_premium', v_state IN ('TRIAL_ACTIVE', 'SUBSCRIPTION_ACTIVE', 'SUBSCRIPTION_CANCELING'),
    'trial_started_at', v_trial_start,
    'trial_ends_at', v_trial_end,
    'subscription_status', v_status,
    'cancel_at_period_end', coalesce(v_cancel, false),
    'current_period_end', CASE WHEN v_period_end IS NULL THEN NULL ELSE to_timestamp(v_period_end) END,
    'stripe_trial_end', CASE WHEN v_stripe_trial_end IS NULL THEN NULL ELSE to_timestamp(v_stripe_trial_end) END,
    'server_now', v_now
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  RETURN public.billing_state_for(auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_premium()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  RETURN coalesce((public.billing_state_for(auth.uid()) ->> 'has_premium')::boolean, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.start_trial()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_state jsonb;
  v_created boolean := false;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_state := public.billing_state_for(v_uid);
  IF v_state ->> 'state' = 'TRIAL_NOT_STARTED' THEN
    INSERT INTO user_trials (user_id, started_at, ends_at, origin)
    VALUES (v_uid, v_now, v_now + interval '7 days', 'explicit')
    ON CONFLICT (user_id) DO NOTHING;
    v_created := FOUND;
    v_state := public.billing_state_for(v_uid);
  END IF;

  RETURN v_state || jsonb_build_object('trial_created', v_created);
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_stripe_subscription_snapshot(
  p_customer_id text,
  p_subscription_id text,
  p_price_id text,
  p_status text,
  p_current_period_start bigint,
  p_current_period_end bigint,
  p_trial_end bigint,
  p_cancel_at_period_end boolean,
  p_payment_method_brand text,
  p_payment_method_last4 text,
  p_synced_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_status text;
  v_prev_cancel boolean;
  v_prev_synced timestamptz;
  v_exists boolean;
BEGIN
  SELECT status::text, coalesce(cancel_at_period_end, false), last_synced_at, true
  INTO v_prev_status, v_prev_cancel, v_prev_synced, v_exists
  FROM stripe_subscriptions WHERE customer_id = p_customer_id
  FOR UPDATE;

  IF coalesce(v_exists, false) AND v_prev_synced IS NOT NULL AND v_prev_synced > p_synced_at THEN
    RETURN jsonb_build_object('applied', false, 'previous_status', v_prev_status, 'previous_cancel_at_period_end', v_prev_cancel);
  END IF;

  INSERT INTO stripe_subscriptions (
    customer_id, subscription_id, price_id, status, current_period_start, current_period_end,
    trial_end, cancel_at_period_end, payment_method_brand, payment_method_last4, last_synced_at, updated_at
  ) VALUES (
    p_customer_id, p_subscription_id, p_price_id, p_status::stripe_subscription_status, p_current_period_start,
    p_current_period_end, p_trial_end, coalesce(p_cancel_at_period_end, false), p_payment_method_brand,
    p_payment_method_last4, p_synced_at, now()
  )
  ON CONFLICT (customer_id) DO UPDATE SET
    subscription_id = EXCLUDED.subscription_id,
    price_id = EXCLUDED.price_id,
    status = EXCLUDED.status,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    trial_end = EXCLUDED.trial_end,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    payment_method_brand = coalesce(EXCLUDED.payment_method_brand, stripe_subscriptions.payment_method_brand),
    payment_method_last4 = coalesce(EXCLUDED.payment_method_last4, stripe_subscriptions.payment_method_last4),
    last_synced_at = EXCLUDED.last_synced_at,
    updated_at = now();

  RETURN jsonb_build_object('applied', true, 'previous_status', v_prev_status, 'previous_cancel_at_period_end', v_prev_cancel);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.billing_state_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_state_for(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.apply_stripe_subscription_snapshot(text, text, text, text, bigint, bigint, bigint, boolean, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_subscription_snapshot(text, text, text, text, bigint, bigint, bigint, boolean, text, text, timestamptz) TO service_role;
REVOKE EXECUTE ON FUNCTION public.billing_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_status() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.current_user_has_premium() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_premium() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.start_trial() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_trial() TO authenticated;

DROP POLICY IF EXISTS "Premium required to create actions" ON public.business_actions;
CREATE POLICY "Premium required to create actions" ON public.business_actions
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.current_user_has_premium()));
DROP POLICY IF EXISTS "Premium required to update actions" ON public.business_actions;
CREATE POLICY "Premium required to update actions" ON public.business_actions
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.current_user_has_premium()))
  WITH CHECK ((SELECT public.current_user_has_premium()));

INSERT INTO public.user_trials (user_id, started_at, ends_at, origin)
SELECT c.user_id, to_timestamp(s.trial_end) - interval '7 days', to_timestamp(s.trial_end), 'legacy_stripe'
FROM public.stripe_subscriptions s
JOIN public.stripe_customers c ON c.customer_id = s.customer_id AND c.deleted_at IS NULL
WHERE s.trial_end IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
