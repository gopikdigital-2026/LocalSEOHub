/*
# A2.4.2 - SEO Generator limits

1. Summary
   Activates the SEO Generator in the generalized AI ledger and lowers the
   per-tool monthly caps. Counters and reservations are NOT reset or deleted.

2. New functions
   - `ai_usage_cap(p_function text)` - single source of truth for monthly caps:
     weekly-content 30, business-improvement 30, seo-generator 20,
     business-advisor 0, voice-simulator 0, global (`'global'`) 80.
     Unknown names return NULL.
   - `my_ai_usage()` - SECURITY INVOKER read helper for the signed-in user.
     Reads only the caller's own current-month row (RLS `select_own_ai_usage`
     still applies) and returns used/limit per tool plus the global total.

3. Modified functions
   - `reserve_ai_usage` now reads caps from `ai_usage_cap`. Logic, locking,
     idempotency and return payload are unchanged. Users already above a
     lowered cap simply receive `fn_limit` until next month; counters never go
     negative.

4. Security
   - `reserve_ai_usage` stays SECURITY DEFINER, EXECUTE for service_role only.
   - `ai_usage_cap` and `my_ai_usage` are executable by authenticated and
     service_role only (not anon). `my_ai_usage` uses auth.uid(); it cannot
     read other users' rows.
*/

CREATE OR REPLACE FUNCTION public.ai_usage_cap(p_function text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE p_function
    WHEN 'weekly-content' THEN 30
    WHEN 'business-improvement' THEN 30
    WHEN 'seo-generator' THEN 20
    WHEN 'business-advisor' THEN 0
    WHEN 'voice-simulator' THEN 0
    WHEN 'global' THEN 80
  END;
$$;

REVOKE ALL ON FUNCTION public.ai_usage_cap(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_usage_cap(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reserve_ai_usage(p_reservation_id uuid, p_user_id uuid, p_function text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
c_global constant integer := public.ai_usage_cap('global');
v_fn_cap integer;
v_period date := date_trunc('month', timezone('utc', now()))::date;
v_row public.ai_usage_monthly;
v_fn_used integer;
v_global_used integer;
BEGIN
IF p_reservation_id IS NULL OR p_user_id IS NULL OR p_function IS NULL OR p_function = 'global' THEN
RETURN jsonb_build_object('status', 'invalid');
END IF;

v_fn_cap := public.ai_usage_cap(p_function);
IF v_fn_cap IS NULL THEN
RETURN jsonb_build_object('status', 'invalid');
END IF;
IF v_fn_cap = 0 THEN
RETURN jsonb_build_object('status', 'disabled');
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

v_fn_used := CASE p_function
WHEN 'weekly-content' THEN v_row.weekly_content_used
WHEN 'business-improvement' THEN v_row.business_improvement_used
WHEN 'seo-generator' THEN v_row.seo_generator_used
WHEN 'business-advisor' THEN v_row.business_advisor_used
WHEN 'voice-simulator' THEN v_row.voice_simulator_used
END;
v_global_used := v_row.weekly_content_used + v_row.business_improvement_used
+ v_row.seo_generator_used + v_row.business_advisor_used + v_row.voice_simulator_used;

IF v_fn_used >= v_fn_cap THEN
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

UPDATE public.ai_usage_monthly SET
weekly_content_used = weekly_content_used + (p_function = 'weekly-content')::int,
business_improvement_used = business_improvement_used + (p_function = 'business-improvement')::int,
seo_generator_used = seo_generator_used + (p_function = 'seo-generator')::int,
business_advisor_used = business_advisor_used + (p_function = 'business-advisor')::int,
voice_simulator_used = voice_simulator_used + (p_function = 'voice-simulator')::int
WHERE user_id = p_user_id AND period_start = v_period;

RETURN jsonb_build_object('status', 'reserved', 'fn_used', v_fn_used + 1, 'global_used', v_global_used + 1);
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_ai_usage(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.my_ai_usage()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH r AS (
    SELECT m.* FROM public.ai_usage_monthly m
    WHERE m.user_id = auth.uid()
      AND m.period_start = date_trunc('month', timezone('utc', now()))::date
  ), u AS (
    SELECT
      COALESCE((SELECT weekly_content_used FROM r), 0) AS wc,
      COALESCE((SELECT business_improvement_used FROM r), 0) AS bi,
      COALESCE((SELECT seo_generator_used FROM r), 0) AS seo,
      COALESCE((SELECT business_advisor_used FROM r), 0) AS ba,
      COALESCE((SELECT voice_simulator_used FROM r), 0) AS vs
  )
  SELECT jsonb_build_object(
    'period_start', date_trunc('month', timezone('utc', now()))::date,
    'functions', jsonb_build_object(
      'weekly-content', jsonb_build_object('used', wc, 'limit', public.ai_usage_cap('weekly-content')),
      'business-improvement', jsonb_build_object('used', bi, 'limit', public.ai_usage_cap('business-improvement')),
      'seo-generator', jsonb_build_object('used', seo, 'limit', public.ai_usage_cap('seo-generator')),
      'business-advisor', jsonb_build_object('used', ba, 'limit', public.ai_usage_cap('business-advisor')),
      'voice-simulator', jsonb_build_object('used', vs, 'limit', public.ai_usage_cap('voice-simulator'))
    ),
    'global', jsonb_build_object('used', wc + bi + seo + ba + vs, 'limit', public.ai_usage_cap('global'))
  )
  FROM u
  WHERE auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.my_ai_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_ai_usage() TO authenticated, service_role;
