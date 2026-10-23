/*
# A3.4.2 - Reseñas IA: review-reply capability in the existing AI usage ledger

## Plain-English summary
Adds one new AI capability, `review-reply` (AI drafts of replies to real Google reviews), to the
SAME monthly AI usage ledger every other AI tool uses. No second ledger, no new table, no change to
billing, Stripe, trials or premium entitlements.

## 1. Modified tables
- `ai_usage_monthly`: new counter `review_reply_used integer NOT NULL DEFAULT 0`, with constraint
  `ai_usage_monthly_review_reply_non_negative` (>= 0).
- `ai_usage_reservations`: the `function` CHECK is widened from 5 to 6 names (adds `review-reply`).
  Strictly wider, so every existing row still satisfies it.

## 2. Modified functions (same signatures, return shapes and grants)
- `ai_usage_cap`: `review-reply` = 15 per calendar month (UTC), same period as every other tool.
  Existing caps unchanged (22/18/18/12/10) and global stays 80.
- `reserve_ai_usage`, `settle_ai_usage`, `reconcile_ai_usage`, `my_ai_usage`: aware of the new
  counter. The global total now includes `review_reply_used`, so the 80/month global ceiling keeps
  applying to every AI call (per-tool caps add up to more than 80 on purpose; global wins).

## 3. Security
- No RLS or policy changes. Ledger functions stay SECURITY DEFINER, `search_path = public`,
  EXECUTE for service_role only; `my_ai_usage` stays scoped to `auth.uid()`.

## 4. Data safety
- Purely additive: no counters reset, no rows rewritten, no columns dropped.
*/

ALTER TABLE public.ai_usage_monthly ADD COLUMN IF NOT EXISTS review_reply_used integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_monthly_review_reply_non_negative') THEN
    ALTER TABLE public.ai_usage_monthly ADD CONSTRAINT ai_usage_monthly_review_reply_non_negative
      CHECK (review_reply_used >= 0);
  END IF;
END $$;

ALTER TABLE public.ai_usage_reservations DROP CONSTRAINT IF EXISTS ai_usage_reservations_function_check;
ALTER TABLE public.ai_usage_reservations ADD CONSTRAINT ai_usage_reservations_function_check
  CHECK (function IN ('weekly-content', 'business-improvement', 'seo-generator', 'business-advisor', 'voice-simulator', 'review-reply'));

CREATE OR REPLACE FUNCTION public.ai_usage_cap(p_function text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_function
    WHEN 'weekly-content' THEN 22
    WHEN 'business-improvement' THEN 18
    WHEN 'seo-generator' THEN 18
    WHEN 'business-advisor' THEN 12
    WHEN 'voice-simulator' THEN 10
    WHEN 'review-reply' THEN 15
    WHEN 'global' THEN 80
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_ai_usage(p_reservation_id uuid, p_user_id uuid, p_function text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
WHEN 'review-reply' THEN v_row.review_reply_used
END;
v_global_used := v_row.weekly_content_used + v_row.business_improvement_used
+ v_row.seo_generator_used + v_row.business_advisor_used + v_row.voice_simulator_used
+ v_row.review_reply_used;

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
voice_simulator_used = voice_simulator_used + (p_function = 'voice-simulator')::int,
review_reply_used = review_reply_used + (p_function = 'review-reply')::int
WHERE user_id = p_user_id AND period_start = v_period;

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
UPDATE public.ai_usage_monthly SET
weekly_content_used = GREATEST(weekly_content_used - (v_res.function = 'weekly-content')::int, 0),
business_improvement_used = GREATEST(business_improvement_used - (v_res.function = 'business-improvement')::int, 0),
seo_generator_used = GREATEST(seo_generator_used - (v_res.function = 'seo-generator')::int, 0),
business_advisor_used = GREATEST(business_advisor_used - (v_res.function = 'business-advisor')::int, 0),
voice_simulator_used = GREATEST(voice_simulator_used - (v_res.function = 'voice-simulator')::int, 0),
review_reply_used = GREATEST(review_reply_used - (v_res.function = 'review-reply')::int, 0)
WHERE user_id = p_user_id AND period_start = v_res.period_start;
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
count(*) FILTER (WHERE function = 'business-improvement') AS bi,
count(*) FILTER (WHERE function = 'seo-generator') AS sg,
count(*) FILTER (WHERE function = 'business-advisor') AS ba,
count(*) FILTER (WHERE function = 'voice-simulator') AS vs,
count(*) FILTER (WHERE function = 'review-reply') AS rr
FROM public.ai_usage_reservations
WHERE status IN ('reserved', 'completed', 'consumed', 'expired')
GROUP BY user_id, period_start
)
UPDATE public.ai_usage_monthly m
SET weekly_content_used = GREATEST(m.weekly_content_used, l.wc),
business_improvement_used = GREATEST(m.business_improvement_used, l.bi),
seo_generator_used = GREATEST(m.seo_generator_used, l.sg),
business_advisor_used = GREATEST(m.business_advisor_used, l.ba),
voice_simulator_used = GREATEST(m.voice_simulator_used, l.vs),
review_reply_used = GREATEST(m.review_reply_used, l.rr)
FROM ledger l
WHERE m.user_id = l.user_id AND m.period_start = l.period_start
AND (m.weekly_content_used < l.wc OR m.business_improvement_used < l.bi
OR m.seo_generator_used < l.sg OR m.business_advisor_used < l.ba OR m.voice_simulator_used < l.vs
OR m.review_reply_used < l.rr);
GET DIAGNOSTICS v_adjusted = ROW_COUNT;

RETURN jsonb_build_object('expired', v_expired, 'adjusted', v_adjusted);
END;
$$;

CREATE OR REPLACE FUNCTION public.my_ai_usage()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
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
COALESCE((SELECT voice_simulator_used FROM r), 0) AS vs,
COALESCE((SELECT review_reply_used FROM r), 0) AS rr
)
SELECT jsonb_build_object(
'period_start', date_trunc('month', timezone('utc', now()))::date,
'functions', jsonb_build_object(
'weekly-content', jsonb_build_object('used', wc, 'limit', public.ai_usage_cap('weekly-content')),
'business-improvement', jsonb_build_object('used', bi, 'limit', public.ai_usage_cap('business-improvement')),
'seo-generator', jsonb_build_object('used', seo, 'limit', public.ai_usage_cap('seo-generator')),
'business-advisor', jsonb_build_object('used', ba, 'limit', public.ai_usage_cap('business-advisor')),
'voice-simulator', jsonb_build_object('used', vs, 'limit', public.ai_usage_cap('voice-simulator')),
'review-reply', jsonb_build_object('used', rr, 'limit', public.ai_usage_cap('review-reply'))
),
'global', jsonb_build_object('used', wc + bi + seo + ba + vs + rr, 'limit', public.ai_usage_cap('global'))
)
FROM u
WHERE auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.ai_usage_cap(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reserve_ai_usage(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_ai_usage(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_ai_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_ai_usage(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_ai_usage() TO service_role;
