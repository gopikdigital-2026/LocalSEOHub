/*
# Premium request authorization and rate limits (FIX 05.1)

## Plain-English summary
Paid server features (AI generation, website analysis) now ask the database one question
before doing any costly work: "is this signed-in user entitled right now, and within their
usage limit?". The answer is computed only from server data (trial row + Stripe snapshot),
never from anything the browser sends. Public sign-up also gets a per-IP limit.

## 1. New table `edge_rate_limits`
- `bucket` (text) - what is being limited, e.g. `premium:generate-seo:<user id>` or `signup:ip:<ip>`
- `window_start` (timestamptz) - start of the fixed time window
- `hits` (integer) - number of requests counted in that window
- Primary key (bucket, window_start)

## 2. New functions (service role only, never callable from the browser)
- `consume_rate_limit(bucket, limit, window_seconds)` - atomically counts one request and
  returns whether it is within the limit.
- `authorize_premium_request(user_id, function_name, limit, window_seconds)` - returns
  `ok`, `premium_required`, `rate_limited` or `unauthorized`.

## 3. Modified function `billing_state_for`
- A subscription scheduled to cancel whose paid period has already ended is treated as
  SUBSCRIPTION_CANCELED even if the final Stripe event has not arrived yet. Nothing else changes.

## 4. Security
- RLS enabled on `edge_rate_limits` with no client policies; all client privileges revoked.
- EXECUTE on both new functions revoked from PUBLIC, anon and authenticated; granted to service_role.

## Notes
1. No existing data is modified or removed.
2. Safe to re-run.
*/

CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  bucket text NOT NULL CHECK (length(bucket) BETWEEN 1 AND 200),
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0 CHECK (hits >= 0),
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX IF NOT EXISTS edge_rate_limits_window_start_idx ON public.edge_rate_limits (window_start);

ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.edge_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window timestamptz;
  v_hits integer;
BEGIN
  IF p_bucket IS NULL OR length(p_bucket) NOT BETWEEN 1 AND 200
     OR p_limit IS NULL OR p_limit < 1
     OR p_window_seconds IS NULL OR p_window_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'invalid_rate_limit';
  END IF;

  v_window := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);

  INSERT INTO edge_rate_limits (bucket, window_start, hits)
  VALUES (p_bucket, v_window, 1)
  ON CONFLICT (bucket, window_start) DO UPDATE SET hits = edge_rate_limits.hits + 1
  RETURNING hits INTO v_hits;

  IF random() < 0.01 THEN
    DELETE FROM edge_rate_limits WHERE window_start < now() - interval '2 days';
  END IF;

  RETURN v_hits <= p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

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
    WHEN v_status IN ('active', 'trialing') AND v_cancel
         AND v_period_end IS NOT NULL AND to_timestamp(v_period_end) <= v_now
         AND NOT (v_trial_end IS NOT NULL AND v_now < v_trial_end) THEN 'SUBSCRIPTION_CANCELED'
    WHEN v_status IN ('active', 'trialing') AND v_cancel
         AND v_period_end IS NOT NULL AND to_timestamp(v_period_end) <= v_now THEN 'TRIAL_ACTIVE'
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

REVOKE EXECUTE ON FUNCTION public.billing_state_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_state_for(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.authorize_premium_request(
  p_user_id uuid,
  p_function text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN 'unauthorized';
  END IF;
  IF p_function IS NULL OR p_function !~ '^[a-z0-9-]{1,64}$' THEN
    RAISE EXCEPTION 'invalid_function';
  END IF;
  IF NOT coalesce((billing_state_for(p_user_id) ->> 'has_premium')::boolean, false) THEN
    RETURN 'premium_required';
  END IF;
  IF NOT consume_rate_limit('premium:' || p_function || ':' || p_user_id::text, p_limit, p_window_seconds) THEN
    RETURN 'rate_limited';
  END IF;
  RETURN 'ok';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.authorize_premium_request(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_premium_request(uuid, text, integer, integer) TO service_role;
