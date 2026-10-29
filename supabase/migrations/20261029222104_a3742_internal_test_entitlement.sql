/*
# A3.7.4.2 Gate B.2 FIX02 — Internal owner/admin E2E test entitlement

1. Purpose
   Lets an explicitly listed internal account pass the commercial Premium
   eligibility gate for a short, server-controlled window during controlled
   E2E testing. Does not touch trials, Stripe data or billing history.

2. New table `internal_test_entitlements`
   - id (uuid pk)
   - user_id (uuid, auth.users) — explicit account
   - purpose (text, fixed to 'internal_owner_e2e')
   - note (text) — audit note
   - created_at (timestamptz)
   - expires_at (timestamptz) — must be after created_at and at most 72h later
   - revoked_at (timestamptz, nullable) — set to revoke
   - created_by (text) — audit actor

3. Modified function `billing_state_for(uuid)`
   - `state` computation is unchanged (trial/subscription semantics identical).
   - `has_premium` = previous premium states OR an active, unexpired,
     unrevoked internal entitlement for that same user.
   - New key `internal_test_entitlement` (boolean) for audit visibility.
   All Premium gates (authorize_premium_request, current_user_has_premium,
   billing_status) inherit this through the central resolver. Rate limits,
   AI usage caps and per-publication generation caps are separate and unchanged.

4. Security
   - RLS enabled with NO policies; all privileges revoked from PUBLIC, anon,
     authenticated. Only the database owner (migrations / SQL console) can
     create, extend or revoke rows. The browser cannot read or write it.
   - Helper `internal_test_entitlement_active(uuid)` is SECURITY DEFINER with
     EXECUTE revoked from PUBLIC, anon, authenticated.
*/

CREATE TABLE IF NOT EXISTS public.internal_test_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose text NOT NULL DEFAULT 'internal_owner_e2e' CHECK (purpose = 'internal_owner_e2e'),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by text NOT NULL DEFAULT 'migration',
  CONSTRAINT internal_test_entitlements_window CHECK (expires_at > created_at AND expires_at <= created_at + interval '72 hours')
);

CREATE INDEX IF NOT EXISTS internal_test_entitlements_user_idx ON public.internal_test_entitlements (user_id);

ALTER TABLE public.internal_test_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_test_entitlements FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.internal_test_entitlement_active(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.internal_test_entitlements e
    WHERE e.user_id = p_user_id
      AND e.purpose = 'internal_owner_e2e'
      AND e.revoked_at IS NULL
      AND e.expires_at > now()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.internal_test_entitlement_active(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.billing_state_for(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_now timestamptz := now();
v_trial_start timestamptz;
v_trial_end timestamptz;
v_status text;
v_cancel boolean;
v_period_end bigint;
v_stripe_trial_end bigint;
v_state text;
v_internal boolean;
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

v_internal := public.internal_test_entitlement_active(p_user_id);

RETURN jsonb_build_object(
'state', v_state,
'has_premium', v_state IN ('TRIAL_ACTIVE', 'SUBSCRIPTION_ACTIVE', 'SUBSCRIPTION_CANCELING') OR v_internal,
'internal_test_entitlement', v_internal,
'trial_started_at', v_trial_start,
'trial_ends_at', v_trial_end,
'subscription_status', v_status,
'cancel_at_period_end', coalesce(v_cancel, false),
'current_period_end', CASE WHEN v_period_end IS NULL THEN NULL ELSE to_timestamp(v_period_end) END,
'stripe_trial_end', CASE WHEN v_stripe_trial_end IS NULL THEN NULL ELSE to_timestamp(v_stripe_trial_end) END,
'server_now', v_now
);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.billing_state_for(uuid) FROM PUBLIC, anon, authenticated;
