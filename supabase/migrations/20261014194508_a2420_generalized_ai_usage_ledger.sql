/*
# A2.4.2-0 — Generalized AI usage ledger (single source of truth)

## Plain-English summary
The existing AI usage ledger (A2.3 / A2.3.1) only knew two generators: weekly-content and
business-improvement. This migration extends that SAME ledger so it can recognise three future
tools (seo-generator, business-advisor, voice-simulator) WITHOUT enabling them and WITHOUT raising
any user's maximum monthly AI budget. No second ledger, no new table.

## 1. Modified tables
- `ai_usage_monthly`: three new counters, all `integer NOT NULL DEFAULT 0`:
  - `seo_generator_used`, `business_advisor_used`, `voice_simulator_used`
  - new constraint `ai_usage_monthly_future_non_negative` (each >= 0). The existing
    `ai_usage_monthly_non_negative` constraint is kept untouched.
- `ai_usage_reservations`: the `function` CHECK is widened from 2 to 5 recognised names.
  Existing rows all satisfy the new (strictly wider) list.

## 2. Modified functions (same signatures, same return shapes, same grants)
- `reserve_ai_usage`: per-function cap is now looked up per name. weekly-content = 40,
  business-improvement = 40 (unchanged). The three new names have cap 0 and return
  `{status:'disabled'}` BEFORE any row is touched, so they can never consume. The global cap stays
  80 and is computed over ALL five counters, so adding names can never multiply the budget.
  Increments are now per-column with an explicit match (previously any non-weekly name fell into
  the business-improvement column).
- `settle_ai_usage`: release decrements exactly the reservation's own counter (clamped at 0).
- `reconcile_ai_usage`: reconciles all five counters with GREATEST (never lowers a counter).

## 3. Security
- No RLS or policy changes. All three functions stay SECURITY DEFINER, `search_path = public`,
  EXECUTE revoked from PUBLIC/anon/authenticated and granted to service_role only.

## 4. Data safety / rollback
- Purely additive: no column dropped, no counter reset, no reservation invalidated.
- Logical rollback: re-run the three CREATE OR REPLACE bodies from
  20261010165247_a231_ai_reservation_ledger_and_concurrency.sql and restore the 2-name CHECK
  (only possible while no reservation uses a new name, which this migration guarantees because
  new names are disabled). The three new zero-valued columns can be left in place harmlessly.
*/

ALTER TABLE public.ai_usage_monthly ADD COLUMN IF NOT EXISTS seo_generator_used integer NOT NULL DEFAULT 0;
ALTER TABLE public.ai_usage_monthly ADD COLUMN IF NOT EXISTS business_advisor_used integer NOT NULL DEFAULT 0;
ALTER TABLE public.ai_usage_monthly ADD COLUMN IF NOT EXISTS voice_simulator_used integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_monthly_future_non_negative') THEN
    ALTER TABLE public.ai_usage_monthly ADD CONSTRAINT ai_usage_monthly_future_non_negative
      CHECK (seo_generator_used >= 0 AND business_advisor_used >= 0 AND voice_simulator_used >= 0);
  END IF;
END $$;

ALTER TABLE public.ai_usage_reservations DROP CONSTRAINT IF EXISTS ai_usage_reservations_function_check;
ALTER TABLE public.ai_usage_reservations ADD CONSTRAINT ai_usage_reservations_function_check
  CHECK (function IN ('weekly-content', 'business-improvement', 'seo-generator', 'business-advisor', 'voice-simulator'));

CREATE OR REPLACE FUNCTION public.reserve_ai_usage(p_reservation_id uuid, p_user_id uuid, p_function text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
c_global constant integer := 80;
v_fn_cap integer;
v_period date := date_trunc('month', timezone('utc', now()))::date;
v_row public.ai_usage_monthly;
v_fn_used integer;
v_global_used integer;
BEGIN
IF p_reservation_id IS NULL OR p_user_id IS NULL OR p_function IS NULL THEN
RETURN jsonb_build_object('status', 'invalid');
END IF;

v_fn_cap := CASE p_function
WHEN 'weekly-content' THEN 40
WHEN 'business-improvement' THEN 40
WHEN 'seo-generator' THEN 0
WHEN 'business-advisor' THEN 0
WHEN 'voice-simulator' THEN 0
END;
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
UPDATE public.ai_usage_monthly SET
weekly_content_used = GREATEST(weekly_content_used - (v_res.function = 'weekly-content')::int, 0),
business_improvement_used = GREATEST(business_improvement_used - (v_res.function = 'business-improvement')::int, 0),
seo_generator_used = GREATEST(seo_generator_used - (v_res.function = 'seo-generator')::int, 0),
business_advisor_used = GREATEST(business_advisor_used - (v_res.function = 'business-advisor')::int, 0),
voice_simulator_used = GREATEST(voice_simulator_used - (v_res.function = 'voice-simulator')::int, 0)
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
count(*) FILTER (WHERE function = 'voice-simulator') AS vs
FROM public.ai_usage_reservations
WHERE status IN ('reserved', 'completed', 'consumed', 'expired')
GROUP BY user_id, period_start
)
UPDATE public.ai_usage_monthly m
SET weekly_content_used = GREATEST(m.weekly_content_used, l.wc),
business_improvement_used = GREATEST(m.business_improvement_used, l.bi),
seo_generator_used = GREATEST(m.seo_generator_used, l.sg),
business_advisor_used = GREATEST(m.business_advisor_used, l.ba),
voice_simulator_used = GREATEST(m.voice_simulator_used, l.vs)
FROM ledger l
WHERE m.user_id = l.user_id AND m.period_start = l.period_start
AND (m.weekly_content_used < l.wc OR m.business_improvement_used < l.bi
OR m.seo_generator_used < l.sg OR m.business_advisor_used < l.ba OR m.voice_simulator_used < l.vs);
GET DIAGNOSTICS v_adjusted = ROW_COUNT;

RETURN jsonb_build_object('expired', v_expired, 'adjusted', v_adjusted);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_usage(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_ai_usage(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_ai_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_usage(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_ai_usage(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_ai_usage() TO service_role;
