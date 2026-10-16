/*
# A2.6 billing grant hardening (defense in depth)

1. Purpose
   - Removes table privileges that browser roles (anon, authenticated) never need on
     server-owned billing, trial and AI-usage tables. Row level security already blocks
     these writes; this removes the privileges themselves so a future policy mistake
     cannot reopen them. TRUNCATE in particular is not filtered by row level security.

2. Modified tables (privileges only, no data or structure change)
   - stripe_customers, stripe_subscriptions, stripe_orders, user_trials, subscriptions:
     revoke TRUNCATE, TRIGGER, REFERENCES from anon and authenticated. SELECT (own rows,
     via existing policies) is unchanged.
   - ai_usage_monthly, ai_usage_reservations: revoke INSERT, UPDATE, DELETE, TRUNCATE,
     TRIGGER, REFERENCES from anon and authenticated. Own-row SELECT is unchanged; all
     writes stay inside the existing SECURITY DEFINER ledger functions.
   - trial_fingerprints (legacy, every policy already denies): revoke all from anon and
     authenticated.
   - profiles: browser roles can no longer insert the legacy stripe_customer_id or
     stripe_subscription_status columns; authenticated keeps INSERT on id, email,
     full_name, created_at and its existing UPDATE (full_name, email). anon loses
     INSERT/DELETE (it had no policy, so nothing changes in practice).

3. Notes
   1. service_role and SECURITY DEFINER functions are unaffected.
   2. Premium entitlement is still computed only by billing_state_for().
   3. Safe to re-run.
*/

REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.stripe_customers FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.stripe_subscriptions FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.stripe_orders FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.user_trials FROM anon, authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.subscriptions FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.ai_usage_monthly FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.ai_usage_reservations FROM anon, authenticated;

REVOKE ALL ON public.trial_fingerprints FROM anon, authenticated;

REVOKE INSERT, TRUNCATE, TRIGGER, REFERENCES ON public.profiles FROM anon, authenticated;
REVOKE DELETE ON public.profiles FROM anon;
GRANT INSERT (id, email, full_name, created_at) ON public.profiles TO authenticated;
