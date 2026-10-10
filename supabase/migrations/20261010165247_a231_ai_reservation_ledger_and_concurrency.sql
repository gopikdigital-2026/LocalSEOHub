/*
# A2.3.1 — Identified AI reservations, restored audited reserve logic, serialized business cap

## Summary
Corrects FIX A2.3. Every monthly AI unit is now tied to an individually identified
reservation that can be settled exactly once, against the UTC month in which it was
taken. Restores the audited v0.7.2.1 business-improvement reservation logic that A2.3
had rewritten, restores the original trial activation check that A2.3 broke, and makes
the 5-businesses-per-user cap safe under concurrent inserts.

## 1. New Tables
- `ai_usage_reservations` — ledger of monthly AI units
  - `id` (uuid, PK) — equals the draft reservation token issued by the server
  - `user_id` (uuid, FK auth.users)
  - `function` (text) — 'weekly-content' | 'business-improvement'
  - `period_start` (date) — UTC month the unit was charged to
  - `status` (text) — reserved | completed | consumed | released | expired
  - `created_at`, `settled_at` (timestamptz)

## 2. Functions
- `reserve_ai_usage(p_reservation_id, p_user_id, p_function)` replaces the A2.3 version.
  Caps fixed server-side (40 per function, 80 combined). Locks the user's month row,
  expires that user's stale reservations, inserts one ledger row and increments.
- `settle_ai_usage(p_reservation_id, p_user_id, p_outcome)` — single transition from
  `reserved` (or `expired`, except release). Only `released` decrements, and only the
  counter of the reservation's own month. Repeated or late settles return false.
- `reconcile_ai_usage()` — expires stale reservations, raises counters below the ledger.
  Never lowers a counter.
- `release_ai_usage(uuid, text)` and the 4-argument `reserve_ai_usage` are dropped.
- `reserve_weekly_content` — audited fix0711 body; AI unit reserved only after every draft check.
- `reserve_business_improvement` — audited fix0721 body restored; AI unit reserved after all
  checks, released by id if the legacy 40/month counter refuses.
- `start_trial` — original logic restored (`state` key); email gate only when a trial would be
  created; returns the real billing state plus `reason`.
- `enforce_max_businesses_per_user` — per-user transaction advisory lock before counting.

## 3. Security
- RLS on `ai_usage_reservations`: SELECT own only; INSERT/UPDATE/DELETE denied.
- All functions SECURITY DEFINER, fixed search_path, EXECUTE revoked from PUBLIC/anon/authenticated.

## 4. Notes
1. Abandoned reservations (>10 min) become `expired` and stay counted (conservative).
2. No user data is modified or removed. Idempotent.
*/

CREATE TABLE IF NOT EXISTS public.ai_usage_reservations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  function text NOT NULL CHECK (function IN ('weekly-content', 'business-improvement')),
  period_start date NOT NULL CHECK (extract(day FROM period_start) = 1),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed', 'consumed', 'released', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);

CREATE INDEX IF NOT EXISTS ai_usage_reservations_user_status_idx
  ON public.ai_usage_reservations (user_id, status, created_at);

ALTER TABLE public.ai_usage_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_ai_reservations" ON public.ai_usage_reservations;
CREATE POLICY "select_own_ai_reservations" ON public.ai_usage_reservations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "no_insert_ai_reservations" ON public.ai_usage_reservations;
CREATE POLICY "no_insert_ai_reservations" ON public.ai_usage_reservations FOR INSERT
  TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "no_update_ai_reservations" ON public.ai_usage_reservations;
CREATE POLICY "no_update_ai_reservations" ON public.ai_usage_reservations FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "no_delete_ai_reservations" ON public.ai_usage_reservations;
CREATE POLICY "no_delete_ai_reservations" ON public.ai_usage_reservations FOR DELETE
  TO authenticated USING (false);

CREATE OR REPLACE FUNCTION public.reserve_ai_usage(p_reservation_id uuid, p_user_id uuid, p_function text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_per_fn constant integer := 40;
  c_global constant integer := 80;
  v_period date := date_trunc('month', timezone('utc', now()))::date;
  v_row public.ai_usage_monthly;
  v_fn_used integer;
  v_global_used integer;
BEGIN
  IF p_reservation_id IS NULL OR p_user_id IS NULL
     OR p_function IS NULL OR p_function NOT IN ('weekly-content', 'business-improvement') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  INSERT INTO public.ai_usage_monthly (user_id, period_start)
  VALUES (p_user_id, v_period)
  ON CONFLICT (user_id, period_start) DO NOTHING;

  SELECT * INTO v_row FROM public.ai_usage_monthly
  WHERE user_id = p_user_id AND period_start = v_period
  FOR UPDATE;

  UPDATE public.ai_usage_reservations
  SET status = 'expired', settled_at = now()
  WHERE user_id = p_user_id AND status = 'reserved' AND created_at < now() - interval '10 minutes';

  v_fn_used := CASE WHEN p_function = 'weekly-content' THEN v_row.weekly_content_used ELSE v_row.business_improvement_used END;
  v_global_used := v_row.weekly_content_used + v_row.business_improvement_used;

  IF v_fn_used >= c_per_fn THEN
    RETURN jsonb_build_object('status', 'fn_limit', 'fn_used', v_fn_used, 'global_used', v_global_used);
  END IF;
  IF v_global_used >= c_global THEN
    RETURN jsonb_build_object('status', 'global_limit', 'fn_used', v_fn_used, 'global_used', v_global_used);
  END IF;

  INSERT INTO public.ai_usage_reservations (id, user_id, function, period_start)
  VALUES (p_reservation_id, p_user_id, p_function, v_period)
  ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF p_function = 'weekly-content' THEN
    UPDATE public.ai_usage_monthly SET weekly_content_used = weekly_content_used + 1
    WHERE user_id = p_user_id AND period_start = v_period;
  ELSE
    UPDATE public.ai_usage_monthly SET business_improvement_used = business_improvement_used + 1
    WHERE user_id = p_user_id AND period_start = v_period;
  END IF;

  RETURN jsonb_build_object('status', 'reserved', 'fn_used', v_fn_used + 1, 'global_used', v_global_used + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_ai_usage(p_reservation_id uuid, p_user_id uuid, p_outcome text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period date;
  v_res public.ai_usage_reservations;
BEGIN
  IF p_reservation_id IS NULL OR p_user_id IS NULL
     OR p_outcome IS NULL OR p_outcome NOT IN ('completed', 'consumed', 'released') THEN
    RETURN false;
  END IF;

  SELECT period_start INTO v_period FROM public.ai_usage_reservations
  WHERE id = p_reservation_id AND user_id = p_user_id;
  IF v_period IS NULL THEN
    RETURN false;
  END IF;

  -- Lock order (month row, then reservation) matches reserve_ai_usage to avoid deadlocks.
  PERFORM 1 FROM public.ai_usage_monthly
  WHERE user_id = p_user_id AND period_start = v_period
  FOR UPDATE;

  SELECT * INTO v_res FROM public.ai_usage_reservations
  WHERE id = p_reservation_id AND user_id = p_user_id
  FOR UPDATE;

  IF v_res.status = 'reserved' THEN
    NULL;
  ELSIF v_res.status = 'expired' AND p_outcome <> 'released' THEN
    NULL;
  ELSE
    RETURN false;
  END IF;

  UPDATE public.ai_usage_reservations SET status = p_outcome, settled_at = now()
  WHERE id = v_res.id;

  IF p_outcome = 'released' THEN
    IF v_res.function = 'weekly-content' THEN
      UPDATE public.ai_usage_monthly SET weekly_content_used = GREATEST(weekly_content_used - 1, 0)
      WHERE user_id = p_user_id AND period_start = v_res.period_start;
    ELSE
      UPDATE public.ai_usage_monthly SET business_improvement_used = GREATEST(business_improvement_used - 1, 0)
      WHERE user_id = p_user_id AND period_start = v_res.period_start;
    END IF;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_ai_usage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired integer;
  v_adjusted integer;
BEGIN
  UPDATE public.ai_usage_reservations SET status = 'expired', settled_at = now()
  WHERE status = 'reserved' AND created_at < now() - interval '10 minutes';
  GET DIAGNOSTICS v_expired = ROW_COUNT;

  WITH ledger AS (
    SELECT user_id, period_start,
      count(*) FILTER (WHERE function = 'weekly-content') AS wc,
      count(*) FILTER (WHERE function = 'business-improvement') AS bi
    FROM public.ai_usage_reservations
    WHERE status IN ('reserved', 'completed', 'consumed', 'expired')
    GROUP BY user_id, period_start
  )
  UPDATE public.ai_usage_monthly m
  SET weekly_content_used = GREATEST(m.weekly_content_used, l.wc),
      business_improvement_used = GREATEST(m.business_improvement_used, l.bi)
  FROM ledger l
  WHERE m.user_id = l.user_id AND m.period_start = l.period_start
    AND (m.weekly_content_used < l.wc OR m.business_improvement_used < l.bi);
  GET DIAGNOSTICS v_adjusted = ROW_COUNT;

  RETURN jsonb_build_object('expired', v_expired, 'adjusted', v_adjusted);
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_weekly_content(
  p_user_id uuid, p_business_id uuid, p_week_start date, p_expected_generations integer
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
  v_ai jsonb;
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

  INSERT INTO public.weekly_content_drafts (user_id, business_id, week_start)
  VALUES (p_user_id, p_business_id, p_week_start)
  ON CONFLICT (business_id, week_start) DO NOTHING;

  SELECT * INTO v_row FROM public.weekly_content_drafts
  WHERE business_id = p_business_id AND week_start = p_week_start
  FOR UPDATE;

  IF v_row.user_id <> p_user_id THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF p_expected_generations IS DISTINCT FROM v_row.generations THEN
    RETURN jsonb_build_object('status', 'stale', 'generations', v_row.generations);
  END IF;
  IF v_row.generations >= 3 THEN
    RETURN jsonb_build_object('status', 'limit', 'generations', v_row.generations);
  END IF;
  IF v_row.generating_since IS NOT NULL AND v_row.generating_since > now() - interval '90 seconds' THEN
    RETURN jsonb_build_object('status', 'busy', 'generations', v_row.generations);
  END IF;
  IF v_row.attempts >= 6 THEN
    RETURN jsonb_build_object('status', 'attempts', 'generations', v_row.generations, 'attempts', v_row.attempts);
  END IF;

  v_ai := public.reserve_ai_usage(v_token, p_user_id, 'weekly-content');
  IF v_ai ->> 'status' IN ('fn_limit', 'global_limit') THEN
    RETURN jsonb_build_object('status', v_ai ->> 'status', 'fn_used', (v_ai ->> 'fn_used')::int, 'global_used', (v_ai ->> 'global_used')::int);
  END IF;
  IF v_ai ->> 'status' IS DISTINCT FROM 'reserved' THEN
    RETURN jsonb_build_object('status', 'invalid');
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

CREATE OR REPLACE FUNCTION public.reserve_business_improvement(
  p_user_id uuid, p_business_id uuid, p_action_id uuid, p_semantic_key text, p_kind text,
  p_expected_generations integer, p_allow_overwrite boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.business_improvement_drafts;
  v_action public.business_actions;
  v_kind text;
  v_service_part text;
  v_expected_key text;
  v_token uuid := gen_random_uuid();
  v_period date := date_trunc('month', timezone('utc', now()))::date;
  v_used integer;
  v_ai jsonb;
BEGIN
  IF p_user_id IS NULL OR p_business_id IS NULL OR p_action_id IS NULL OR p_semantic_key IS NULL
     OR char_length(p_semantic_key) NOT BETWEEN 1 AND 160
     OR p_kind IS NULL OR p_kind NOT IN ('business_description', 'service_description', 'faq') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = p_business_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT * INTO v_action FROM public.business_actions
  WHERE id = p_action_id AND user_id = p_user_id AND business_id = p_business_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  v_kind := public.business_improvement_rule_kind(v_action.rule_id);
  IF v_kind IS NULL OR v_kind <> p_kind THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF v_kind = 'service_description' THEN
    IF jsonb_typeof(v_action.metadata -> 'evidence' -> 'service') IS DISTINCT FROM 'string' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    v_service_part := public.business_improvement_key_part(v_action.metadata -> 'evidence' ->> 'service');
    IF v_service_part = '' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM (
        SELECT public.business_improvement_key_part(s) AS k
        FROM public.businesses b, unnest(coalesce(b.services, '{}'::text[])) WITH ORDINALITY AS u(s, ord)
        WHERE b.id = p_business_id AND public.business_improvement_key_part(s) <> ''
        ORDER BY ord
        LIMIT 8
      ) declared
      WHERE declared.k = v_service_part
    ) THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    v_expected_key := v_action.rule_id || ':' || v_service_part;
  ELSE
    v_expected_key := v_action.rule_id;
  END IF;

  IF p_semantic_key <> v_expected_key THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF v_action.status NOT IN ('PENDING', 'IN_PROGRESS') THEN
    RETURN jsonb_build_object('status', 'closed');
  END IF;

  IF v_kind = 'service_description'
     AND NOT EXISTS (SELECT 1 FROM public.business_improvement_drafts WHERE business_id = p_business_id AND semantic_key = p_semantic_key)
     AND (SELECT count(*) FROM public.business_improvement_drafts WHERE business_id = p_business_id AND kind = 'service_description') >= 16 THEN
    RETURN jsonb_build_object('status', 'limit', 'generations', 0);
  END IF;

  INSERT INTO public.business_improvement_drafts (user_id, business_id, semantic_key, kind, action_id)
  VALUES (p_user_id, p_business_id, p_semantic_key, v_kind, p_action_id)
  ON CONFLICT (business_id, semantic_key) DO NOTHING;

  SELECT * INTO v_row FROM public.business_improvement_drafts
  WHERE business_id = p_business_id AND semantic_key = p_semantic_key
  FOR UPDATE;

  IF v_row.user_id <> p_user_id THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF v_row.kind <> v_kind THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_expected_generations IS DISTINCT FROM v_row.generations THEN
    RETURN jsonb_build_object('status', 'stale', 'generations', v_row.generations);
  END IF;
  IF v_row.generations >= 3 THEN
    RETURN jsonb_build_object('status', 'limit', 'generations', v_row.generations);
  END IF;
  IF v_row.generating_since IS NOT NULL AND v_row.generating_since > now() - interval '90 seconds' THEN
    RETURN jsonb_build_object('status', 'busy', 'generations', v_row.generations);
  END IF;
  IF v_row.attempts >= 6 THEN
    RETURN jsonb_build_object('status', 'attempts', 'generations', v_row.generations, 'attempts', v_row.attempts);
  END IF;
  IF v_row.edited_at IS NOT NULL AND p_allow_overwrite IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'edited', 'generations', v_row.generations);
  END IF;

  v_ai := public.reserve_ai_usage(v_token, p_user_id, 'business-improvement');
  IF v_ai ->> 'status' IN ('fn_limit', 'global_limit') THEN
    RETURN jsonb_build_object('status', v_ai ->> 'status', 'fn_used', (v_ai ->> 'fn_used')::int, 'global_used', (v_ai ->> 'global_used')::int);
  END IF;
  IF v_ai ->> 'status' IS DISTINCT FROM 'reserved' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  INSERT INTO public.business_improvement_usage AS u (user_id, period_start, requests)
  VALUES (p_user_id, v_period, 1)
  ON CONFLICT (user_id, period_start)
  DO UPDATE SET requests = u.requests + 1, updated_at = now()
  WHERE u.requests < 40
  RETURNING u.requests INTO v_used;

  IF v_used IS NULL THEN
    PERFORM public.settle_ai_usage(v_token, p_user_id, 'released');
    RETURN jsonb_build_object('status', 'global', 'generations', v_row.generations);
  END IF;

  UPDATE public.business_improvement_drafts
  SET generating_since = now(), reservation_id = v_token, attempts = attempts + 1, action_id = p_action_id
  WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'status', 'reserved', 'id', v_row.id, 'reservation', v_token,
    'generations', v_row.generations, 'attempts', v_row.attempts + 1, 'global_used', v_used
  );
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
  v_verified boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_state := public.billing_state_for(v_uid);
  IF v_state ->> 'state' = 'TRIAL_NOT_STARTED' THEN
    SELECT u.email_confirmed_at IS NOT NULL INTO v_verified FROM auth.users u WHERE u.id = v_uid;
    IF NOT coalesce(v_verified, false) THEN
      RETURN v_state || jsonb_build_object('trial_created', false, 'reason', 'email_not_verified');
    END IF;
    INSERT INTO user_trials (user_id, started_at, ends_at, origin)
    VALUES (v_uid, v_now, v_now + interval '7 days', 'explicit')
    ON CONFLICT (user_id) DO NOTHING;
    v_created := FOUND;
    v_state := public.billing_state_for(v_uid);
  END IF;

  RETURN v_state || jsonb_build_object('trial_created', v_created);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_trial() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_trial() TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_max_businesses_per_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'business insert requires read committed isolation' USING ERRCODE = 'check_violation';
  END IF;
  -- Held until commit; the count below takes a fresh snapshot after the lock is granted.
  PERFORM pg_advisory_xact_lock(hashtextextended('businesses_per_user:' || NEW.user_id::text, 0));
  EXECUTE format('SELECT count(*) FROM %I.%I WHERE user_id = $1', TG_TABLE_SCHEMA, TG_TABLE_NAME)
    INTO v_count USING NEW.user_id;
  IF v_count >= 5 THEN
    RAISE EXCEPTION 'Maximum number of businesses per user reached (5)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_max_per_user ON public.businesses;
CREATE TRIGGER businesses_max_per_user
  BEFORE INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_businesses_per_user();

DROP FUNCTION IF EXISTS public.release_ai_usage(uuid, text);
DROP FUNCTION IF EXISTS public.reserve_ai_usage(uuid, text, integer, integer);

REVOKE ALL ON FUNCTION public.reserve_ai_usage(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_ai_usage(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_ai_usage() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_max_businesses_per_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_weekly_content(uuid, uuid, date, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_business_improvement(uuid, uuid, uuid, text, text, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_ai_usage(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_ai_usage() TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_weekly_content(uuid, uuid, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_business_improvement(uuid, uuid, uuid, text, text, integer, boolean) TO service_role;
