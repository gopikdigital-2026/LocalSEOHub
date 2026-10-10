/*
# A2.3 — AI usage limits, trial hardening, and business-per-user cap

## Summary
Adds server-side controls to prevent AI cost abuse: per-user monthly usage tracking,
per-user business count limit, and email-verification readiness on trial activation.

## 1. New Tables
- `ai_usage_monthly` — tracks per-user monthly AI request consumption
  - `user_id` (uuid, PK col 1, FK → auth.users)
  - `period_start` (date, PK col 2) — first day of the UTC month
  - `weekly_content_used` (int, default 0) — requests consumed for weekly-content
  - `business_improvement_used` (int, default 0) — requests consumed for business-improvement
  - `created_at` (timestamptz, default now())
  Composite PK ensures one row per user per month.

## 2. New Functions (SECURITY DEFINER, service_role only)
- `reserve_ai_usage(p_user_id, p_function, p_monthly_per_fn, p_monthly_global)` → jsonb
  Atomically checks and increments the monthly counter for the given function.
  Returns {status:'reserved', fn_used, global_used} or {status:'fn_limit'|'global_limit', fn_used, global_used}.
  Uses SELECT … FOR UPDATE to handle concurrency.

- `release_ai_usage(p_user_id, p_function)` → boolean
  Decrements the counter when a reservation is released (AI call failed).
  Prevents going below zero.

## 3. Modified Functions
- `start_trial()` — now checks `email_confirmed_at IS NOT NULL` on the calling user.
  Returns {state:'email_not_verified', trial_created:false} if email is unverified.
  This is a PREPARED check: while autoconfirm is ON in Supabase settings, all users
  have email_confirmed_at set, so the gate has no effect until autoconfirm is disabled.

- `reserve_weekly_content()` — now calls `reserve_ai_usage()` before reserving.
  Returns {status:'fn_limit'} or {status:'global_limit'} if monthly cap exceeded.

- `reserve_business_improvement()` — now calls `reserve_ai_usage()` before reserving.
  Returns {status:'fn_limit'} or {status:'global_limit'} if monthly cap exceeded.
  The existing business_improvement_usage.requests counter is kept for backwards compat
  but the new ai_usage_monthly is the authoritative global cap.

## 4. Business limit
- Adds a per-user business count limit via a trigger function `enforce_max_businesses_per_user`.
  Maximum 5 businesses per user. Prevents multiplication attack on AI allowances.

## 5. Security
- RLS enabled on `ai_usage_monthly` with SELECT-only for authenticated (own rows).
  No INSERT/UPDATE/DELETE from client; all writes go through SECURITY DEFINER RPCs.
- All new RPCs are SECURITY DEFINER with fixed search_path, EXECUTE revoked from
  PUBLIC/anon/authenticated — callable only via service_role.

## 6. Notes
1. Monthly caps: 40 per function, 80 combined global. Per user, UTC month.
2. The email verification gate is a prepared control. It will block trial activation
   once the Supabase project has "Confirm email" enabled and SMTP configured.
3. The business limit (5) is generous for real users but prevents the multiplication attack.
4. All statements are idempotent.
5. No data is dropped or deleted.
*/

-- ============================================================
-- 1. ai_usage_monthly table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_usage_monthly (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  weekly_content_used integer NOT NULL DEFAULT 0,
  business_improvement_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_monthly_pkey PRIMARY KEY (user_id, period_start),
  CONSTRAINT ai_usage_monthly_period_first CHECK (extract(day FROM period_start) = 1),
  CONSTRAINT ai_usage_monthly_non_negative CHECK (weekly_content_used >= 0 AND business_improvement_used >= 0)
);

ALTER TABLE public.ai_usage_monthly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ai_usage" ON public.ai_usage_monthly;
CREATE POLICY "select_own_ai_usage" ON public.ai_usage_monthly FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "no_insert_ai_usage" ON public.ai_usage_monthly;
CREATE POLICY "no_insert_ai_usage" ON public.ai_usage_monthly FOR INSERT
  TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "no_update_ai_usage" ON public.ai_usage_monthly;
CREATE POLICY "no_update_ai_usage" ON public.ai_usage_monthly FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "no_delete_ai_usage" ON public.ai_usage_monthly;
CREATE POLICY "no_delete_ai_usage" ON public.ai_usage_monthly FOR DELETE
  TO authenticated USING (false);

-- ============================================================
-- 2. reserve_ai_usage RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.reserve_ai_usage(
  p_user_id uuid,
  p_function text,
  p_monthly_per_fn integer DEFAULT 40,
  p_monthly_global integer DEFAULT 80
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period date;
  v_fn_col text;
  v_fn_used integer;
  v_global_used integer;
  v_row public.ai_usage_monthly;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF p_function = 'weekly-content' THEN
    v_fn_col := 'weekly_content_used';
  ELSIF p_function = 'business-improvement' THEN
    v_fn_col := 'business_improvement_used';
  ELSE
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  v_period := date_trunc('month', now() AT TIME ZONE 'UTC')::date;

  INSERT INTO public.ai_usage_monthly (user_id, period_start)
  VALUES (p_user_id, v_period)
  ON CONFLICT (user_id, period_start) DO NOTHING;

  SELECT * INTO v_row
  FROM public.ai_usage_monthly
  WHERE user_id = p_user_id AND period_start = v_period
  FOR UPDATE;

  v_fn_used := CASE WHEN v_fn_col = 'weekly_content_used'
    THEN v_row.weekly_content_used ELSE v_row.business_improvement_used END;
  v_global_used := v_row.weekly_content_used + v_row.business_improvement_used;

  IF v_fn_used >= p_monthly_per_fn THEN
    RETURN jsonb_build_object('status', 'fn_limit', 'fn_used', v_fn_used, 'global_used', v_global_used);
  END IF;

  IF v_global_used >= p_monthly_global THEN
    RETURN jsonb_build_object('status', 'global_limit', 'fn_used', v_fn_used, 'global_used', v_global_used);
  END IF;

  IF v_fn_col = 'weekly_content_used' THEN
    UPDATE public.ai_usage_monthly
    SET weekly_content_used = weekly_content_used + 1
    WHERE user_id = p_user_id AND period_start = v_period;
  ELSE
    UPDATE public.ai_usage_monthly
    SET business_improvement_used = business_improvement_used + 1
    WHERE user_id = p_user_id AND period_start = v_period;
  END IF;

  RETURN jsonb_build_object('status', 'reserved',
    'fn_used', v_fn_used + 1,
    'global_used', v_global_used + 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reserve_ai_usage(uuid, text, integer, integer)
  FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 3. release_ai_usage RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.release_ai_usage(
  p_user_id uuid,
  p_function text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period date;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;

  v_period := date_trunc('month', now() AT TIME ZONE 'UTC')::date;

  IF p_function = 'weekly-content' THEN
    UPDATE public.ai_usage_monthly
    SET weekly_content_used = GREATEST(weekly_content_used - 1, 0)
    WHERE user_id = p_user_id AND period_start = v_period;
  ELSIF p_function = 'business-improvement' THEN
    UPDATE public.ai_usage_monthly
    SET business_improvement_used = GREATEST(business_improvement_used - 1, 0)
    WHERE user_id = p_user_id AND period_start = v_period;
  ELSE
    RETURN false;
  END IF;

  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_ai_usage(uuid, text)
  FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 4. Harden start_trial — email verification gate
-- ============================================================

CREATE OR REPLACE FUNCTION public.start_trial()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_state jsonb;
  v_email_confirmed boolean;
  v_trial_created boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT (email_confirmed_at IS NOT NULL) INTO v_email_confirmed
  FROM auth.users WHERE id = v_uid;

  IF NOT v_email_confirmed THEN
    v_state := billing_state_for(v_uid);
    RETURN jsonb_build_object('state', 'email_not_verified', 'trial_created', false);
  END IF;

  v_state := billing_state_for(v_uid);

  IF v_state ->> 'billing_state' = 'TRIAL_NOT_STARTED' THEN
    INSERT INTO public.user_trials (user_id, started_at, ends_at, origin)
    VALUES (v_uid, now(), now() + interval '7 days', 'explicit')
    ON CONFLICT (user_id) DO NOTHING;

    v_state := billing_state_for(v_uid);
    v_trial_created := (v_state ->> 'billing_state') = 'TRIAL_ACTIVE';
  END IF;

  RETURN v_state || jsonb_build_object('trial_created', v_trial_created);
END;
$$;

-- start_trial is already granted to authenticated only; no change needed.

-- ============================================================
-- 5. Modify reserve_weekly_content — add monthly cap
-- ============================================================

CREATE OR REPLACE FUNCTION public.reserve_weekly_content(
  p_user_id uuid,
  p_business_id uuid,
  p_week_start date,
  p_expected_generations integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.weekly_content_drafts;
  v_recent text[];
  v_token uuid := gen_random_uuid();
  v_ai_check jsonb;
BEGIN
  IF p_user_id IS NULL OR p_business_id IS NULL OR p_week_start IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF extract(isodow FROM p_week_start) <> 1 THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = p_business_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- Monthly AI usage check (per-user, not per-business)
  v_ai_check := reserve_ai_usage(p_user_id, 'weekly-content');
  IF v_ai_check ->> 'status' = 'fn_limit' THEN
    RETURN jsonb_build_object('status', 'fn_limit',
      'fn_used', (v_ai_check ->> 'fn_used')::int,
      'global_used', (v_ai_check ->> 'global_used')::int);
  END IF;
  IF v_ai_check ->> 'status' = 'global_limit' THEN
    RETURN jsonb_build_object('status', 'global_limit',
      'fn_used', (v_ai_check ->> 'fn_used')::int,
      'global_used', (v_ai_check ->> 'global_used')::int);
  END IF;
  IF v_ai_check ->> 'status' <> 'reserved' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  INSERT INTO public.weekly_content_drafts (user_id, business_id, week_start)
  VALUES (p_user_id, p_business_id, p_week_start)
  ON CONFLICT (business_id, week_start) DO NOTHING;

  SELECT * INTO v_row FROM public.weekly_content_drafts
  WHERE business_id = p_business_id AND week_start = p_week_start
  FOR UPDATE;

  IF v_row.user_id <> p_user_id THEN
    PERFORM release_ai_usage(p_user_id, 'weekly-content');
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF p_expected_generations IS DISTINCT FROM v_row.generations THEN
    PERFORM release_ai_usage(p_user_id, 'weekly-content');
    RETURN jsonb_build_object('status', 'stale', 'generations', v_row.generations);
  END IF;
  IF v_row.generations >= 3 THEN
    PERFORM release_ai_usage(p_user_id, 'weekly-content');
    RETURN jsonb_build_object('status', 'limit', 'generations', v_row.generations);
  END IF;
  IF v_row.generating_since IS NOT NULL AND v_row.generating_since > now() - interval '90 seconds' THEN
    PERFORM release_ai_usage(p_user_id, 'weekly-content');
    RETURN jsonb_build_object('status', 'busy', 'generations', v_row.generations);
  END IF;
  IF v_row.attempts >= 6 THEN
    PERFORM release_ai_usage(p_user_id, 'weekly-content');
    RETURN jsonb_build_object('status', 'attempts', 'generations', v_row.generations, 'attempts', v_row.attempts);
  END IF;

  UPDATE public.weekly_content_drafts
  SET generating_since = now(), reservation_id = v_token, attempts = attempts + 1
  WHERE id = v_row.id;

  SELECT coalesce(array_agg(t), '{}') INTO v_recent FROM (
    SELECT unnest(d.topics_used) AS t FROM public.weekly_content_drafts d
    WHERE d.business_id = p_business_id AND d.week_start < p_week_start
    AND d.week_start >= p_week_start - 28
  ) s;

  RETURN jsonb_build_object(
    'status', 'reserved', 'id', v_row.id, 'reservation', v_token,
    'generations', v_row.generations, 'attempts', v_row.attempts + 1,
    'topics_used', to_jsonb(v_row.topics_used), 'recent_topics', to_jsonb(v_recent)
  );
END;
$$;

-- ============================================================
-- 6. Modify reserve_business_improvement — add monthly cap
-- ============================================================

-- First read the current definition to preserve all its logic, then add the cap check.
-- We need the full function body, so we recreate it with the ai_usage check added.

CREATE OR REPLACE FUNCTION public.reserve_business_improvement(
  p_user_id uuid,
  p_business_id uuid,
  p_action_id uuid,
  p_semantic_key text,
  p_kind text,
  p_expected_generations integer,
  p_allow_overwrite boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft_id uuid;
  v_draft public.business_improvement_drafts;
  v_token uuid := gen_random_uuid();
  v_period date;
  v_usage public.business_improvement_usage;
  v_ai_check jsonb;
BEGIN
  IF p_user_id IS NULL OR p_business_id IS NULL OR p_action_id IS NULL
     OR p_semantic_key IS NULL OR p_kind IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_kind NOT IN ('business_description', 'service_description', 'faq') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = p_business_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.business_actions WHERE id = p_action_id AND business_id = p_business_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- Monthly AI usage check (per-user, not per-business)
  v_ai_check := reserve_ai_usage(p_user_id, 'business-improvement');
  IF v_ai_check ->> 'status' = 'fn_limit' THEN
    RETURN jsonb_build_object('status', 'fn_limit',
      'fn_used', (v_ai_check ->> 'fn_used')::int,
      'global_used', (v_ai_check ->> 'global_used')::int);
  END IF;
  IF v_ai_check ->> 'status' = 'global_limit' THEN
    RETURN jsonb_build_object('status', 'global_limit',
      'fn_used', (v_ai_check ->> 'fn_used')::int,
      'global_used', (v_ai_check ->> 'global_used')::int);
  END IF;
  IF v_ai_check ->> 'status' <> 'reserved' THEN
    PERFORM release_ai_usage(p_user_id, 'business-improvement');
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  -- Per-user monthly cap (legacy, kept for backwards compat)
  v_period := date_trunc('month', now() AT TIME ZONE 'UTC')::date;
  INSERT INTO public.business_improvement_usage (user_id, period_start)
  VALUES (p_user_id, v_period)
  ON CONFLICT (user_id, period_start) DO NOTHING;

  SELECT * INTO v_usage FROM public.business_improvement_usage
  WHERE user_id = p_user_id AND period_start = v_period
  FOR UPDATE;

  IF v_usage.requests >= 40 THEN
    PERFORM release_ai_usage(p_user_id, 'business-improvement');
    RETURN jsonb_build_object('status', 'global', 'generations', 0);
  END IF;

  UPDATE public.business_improvement_usage
  SET requests = requests + 1
  WHERE user_id = p_user_id AND period_start = v_period;

  -- Draft upsert
  SELECT id INTO v_draft_id FROM public.business_improvement_drafts
  WHERE business_id = p_business_id AND semantic_key = p_semantic_key;

  IF v_draft_id IS NULL THEN
    DECLARE v_count integer;
    BEGIN
      SELECT count(*) INTO v_count FROM public.business_improvement_drafts
      WHERE business_id = p_business_id;
      IF v_count >= 16 THEN
        PERFORM release_ai_usage(p_user_id, 'business-improvement');
        UPDATE public.business_improvement_usage
        SET requests = GREATEST(requests - 1, 0)
        WHERE user_id = p_user_id AND period_start = v_period;
        RETURN jsonb_build_object('status', 'limit', 'generations', 0);
      END IF;
    END;

    INSERT INTO public.business_improvement_drafts
      (user_id, business_id, action_id, semantic_key, kind)
    VALUES
      (p_user_id, p_business_id, p_action_id, p_semantic_key, p_kind)
    ON CONFLICT (business_id, semantic_key) DO NOTHING;

    SELECT id INTO v_draft_id FROM public.business_improvement_drafts
    WHERE business_id = p_business_id AND semantic_key = p_semantic_key;
  END IF;

  SELECT * INTO v_draft FROM public.business_improvement_drafts
  WHERE id = v_draft_id
  FOR UPDATE;

  IF v_draft.user_id <> p_user_id THEN
    PERFORM release_ai_usage(p_user_id, 'business-improvement');
    UPDATE public.business_improvement_usage
    SET requests = GREATEST(requests - 1, 0)
    WHERE user_id = p_user_id AND period_start = v_period;
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_draft.content IS NOT NULL AND NOT p_allow_overwrite THEN
    PERFORM release_ai_usage(p_user_id, 'business-improvement');
    UPDATE public.business_improvement_usage
    SET requests = GREATEST(requests - 1, 0)
    WHERE user_id = p_user_id AND period_start = v_period;
    RETURN jsonb_build_object('status', 'edited', 'generations', v_draft.generations);
  END IF;

  IF p_expected_generations IS DISTINCT FROM v_draft.generations THEN
    PERFORM release_ai_usage(p_user_id, 'business-improvement');
    UPDATE public.business_improvement_usage
    SET requests = GREATEST(requests - 1, 0)
    WHERE user_id = p_user_id AND period_start = v_period;
    RETURN jsonb_build_object('status', 'stale', 'generations', v_draft.generations);
  END IF;

  IF v_draft.generations >= 3 THEN
    PERFORM release_ai_usage(p_user_id, 'business-improvement');
    UPDATE public.business_improvement_usage
    SET requests = GREATEST(requests - 1, 0)
    WHERE user_id = p_user_id AND period_start = v_period;
    RETURN jsonb_build_object('status', 'limit', 'generations', v_draft.generations);
  END IF;

  IF v_draft.generating_since IS NOT NULL AND v_draft.generating_since > now() - interval '90 seconds' THEN
    PERFORM release_ai_usage(p_user_id, 'business-improvement');
    UPDATE public.business_improvement_usage
    SET requests = GREATEST(requests - 1, 0)
    WHERE user_id = p_user_id AND period_start = v_period;
    RETURN jsonb_build_object('status', 'busy', 'generations', v_draft.generations);
  END IF;

  IF v_draft.attempts >= 6 THEN
    PERFORM release_ai_usage(p_user_id, 'business-improvement');
    UPDATE public.business_improvement_usage
    SET requests = GREATEST(requests - 1, 0)
    WHERE user_id = p_user_id AND period_start = v_period;
    RETURN jsonb_build_object('status', 'attempts', 'generations', v_draft.generations, 'attempts', v_draft.attempts);
  END IF;

  UPDATE public.business_improvement_drafts
  SET generating_since = now(), reservation_id = v_token, attempts = attempts + 1
  WHERE id = v_draft.id;

  RETURN jsonb_build_object(
    'status', 'reserved', 'id', v_draft.id, 'reservation', v_token,
    'generations', v_draft.generations, 'attempts', v_draft.attempts + 1,
    'global_used', v_usage.requests + 1
  );
END;
$$;

-- ============================================================
-- 7. Business count limit trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_max_businesses_per_user()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.businesses WHERE user_id = NEW.user_id;
  IF v_count >= 5 THEN
    RAISE EXCEPTION 'Maximum number of businesses per user reached (5)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_max_businesses_per_user()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS businesses_max_per_user ON public.businesses;
CREATE TRIGGER businesses_max_per_user
  BEFORE INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_businesses_per_user();
