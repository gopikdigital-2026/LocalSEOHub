/*
# A3.7.2 - Publications: photo intelligence and grounded three-proposal engine (storage side)

## Plain-English summary
A publication with a cleaned photo can now hold exactly one set of three AI-written post proposals
(direct/commercial, close/natural, professional/informative). Proposals are written only by the
server, never by the browser. Replacing or removing the photo throws the proposals away. A new
monthly AI allowance, `publication-proposals`, is added to the existing shared AI usage ledger.
Nothing here publishes anything: there are no captions-to-publish, schedules, channels, Meta or
Google fields.

## 1. Modified table: `publications`
- `image_normalized` (boolean, default false): true only when the stored photo is the server-cleaned
  copy (metadata stripped). Required for every photo-bearing row.
- `proposal_generation_id` (uuid): id of the current proposal set; null when there is none.
- `proposals_lang` (text, `es` | `en`) and `proposals_generated_at` (timestamptz) for the current set.
- `proposal_generations_used` (integer 0..4): successful generations for this publication
  (1 first set + at most 3 regenerations). Never reset, not even by a photo replacement.
- `generation_claim_id` / `generation_claimed_at`: short-lived (3 minute) server claim so a double
  click or two tabs can never run two generations or write competing sets.
- Status CHECK widened to `draft`, `image_ready`, `proposals_ready` (strictly wider).
- Image consistency CHECK: `image_ready` and `proposals_ready` both require the full photo fields
  and `image_normalized = true`; `draft` requires them all empty.
- New CHECKs: proposal fields present iff status is `proposals_ready`; claim id and time set together;
  generation counter bounds.
- New trigger `publications_invalidate_proposals`: whenever the photo path changes, the current set
  is deleted, the proposal fields and any claim are cleared and status falls back to
  `image_ready` (or `draft` when the photo is removed).

## 2. New table: `publication_proposals`
- `id` uuid PK, `publication_id` (FK, cascade delete), `user_id` (owner, FK auth.users),
  `generation_id` (set id), `position` 1..3, `role` (`direct`|`close`|`professional`, tied to the
  position), `lang` (`es`|`en`), `body` (1..1000 chars), `cta` (1..120 chars), `created_at`.
- UNIQUE (publication_id, position): at most one set of three per publication, so sets can never mix.

## 3. New server-only functions (SECURITY DEFINER, search_path = public, EXECUTE service_role only)
- `claim_publication_generation(publication, user, claim, image_path)` -> `claimed` | `busy` |
  `limit` | `stale` | `not_found`.
- `release_publication_generation(publication, user, claim)` -> boolean.
- `complete_publication_generation(publication, user, claim, image_path, lang, proposals jsonb)`:
  atomically replaces the set (delete + insert 3 + status update) only while the caller still holds
  the claim and the photo is unchanged; returns null otherwise. A failed regeneration leaves the
  previous set untouched.

## 4. AI usage ledger
- `ai_usage_monthly.publication_proposals_used` counter (>= 0).
- `ai_usage_reservations.function` CHECK widened with `publication-proposals`.
- `ai_usage_cap('publication-proposals') = 20` per month. Every other cap unchanged
  (22/18/18/12/10/15) and the global 80 ceiling unchanged and now includes the new counter.
- `reserve_ai_usage`, `settle_ai_usage`, `reconcile_ai_usage`, `my_ai_usage` updated for the new
  counter with identical signatures, return shapes and grants.

## 5. Security
- RLS enabled on `publication_proposals`; authenticated users get SELECT on their own rows only
  (`user_id = auth.uid()`). No INSERT/UPDATE/DELETE grant or policy for any client role: writes go
  exclusively through the service-role functions above.
- `publications` client grants unchanged (SELECT + INSERT(business_id)); clients cannot set the new
  columns.

## 6. Data safety
- Purely additive. `publications` had 0 rows when written; no rows are rewritten, nothing dropped
  except CHECK constraints that are recreated strictly wider in the same migration.
*/

ALTER TABLE public.publications ADD COLUMN IF NOT EXISTS image_normalized boolean NOT NULL DEFAULT false;
ALTER TABLE public.publications ADD COLUMN IF NOT EXISTS proposal_generation_id uuid;
ALTER TABLE public.publications ADD COLUMN IF NOT EXISTS proposals_lang text;
ALTER TABLE public.publications ADD COLUMN IF NOT EXISTS proposals_generated_at timestamptz;
ALTER TABLE public.publications ADD COLUMN IF NOT EXISTS proposal_generations_used integer NOT NULL DEFAULT 0;
ALTER TABLE public.publications ADD COLUMN IF NOT EXISTS generation_claim_id uuid;
ALTER TABLE public.publications ADD COLUMN IF NOT EXISTS generation_claimed_at timestamptz;

ALTER TABLE public.publications DROP CONSTRAINT IF EXISTS publications_status_check;
ALTER TABLE public.publications ADD CONSTRAINT publications_status_check
  CHECK (status IN ('draft', 'image_ready', 'proposals_ready'));

ALTER TABLE public.publications DROP CONSTRAINT IF EXISTS publications_image_consistency;
ALTER TABLE public.publications ADD CONSTRAINT publications_image_consistency CHECK (
  (status = 'draft' AND image_path IS NULL AND image_mime IS NULL AND image_bytes IS NULL
    AND image_width IS NULL AND image_height IS NULL AND image_uploaded_at IS NULL AND NOT image_normalized)
  OR
  (status IN ('image_ready', 'proposals_ready') AND image_path IS NOT NULL AND image_uploaded_at IS NOT NULL
    AND image_normalized
    AND image_mime IN ('image/jpeg', 'image/png')
    AND image_bytes BETWEEN 1 AND 8388608
    AND image_width BETWEEN 320 AND 8192
    AND image_height BETWEEN 320 AND 8192
    AND image_width::bigint * image_height::bigint <= 40000000)
);

ALTER TABLE public.publications DROP CONSTRAINT IF EXISTS publications_proposals_consistency;
ALTER TABLE public.publications ADD CONSTRAINT publications_proposals_consistency CHECK (
  (status = 'proposals_ready' AND proposal_generation_id IS NOT NULL
    AND proposals_lang IN ('es', 'en') AND proposals_generated_at IS NOT NULL)
  OR
  (status <> 'proposals_ready' AND proposal_generation_id IS NULL
    AND proposals_lang IS NULL AND proposals_generated_at IS NULL)
);

ALTER TABLE public.publications DROP CONSTRAINT IF EXISTS publications_generations_bounds;
ALTER TABLE public.publications ADD CONSTRAINT publications_generations_bounds
  CHECK (proposal_generations_used BETWEEN 0 AND 4);

ALTER TABLE public.publications DROP CONSTRAINT IF EXISTS publications_claim_consistency;
ALTER TABLE public.publications ADD CONSTRAINT publications_claim_consistency
  CHECK ((generation_claim_id IS NULL) = (generation_claimed_at IS NULL));

CREATE TABLE IF NOT EXISTS public.publication_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generation_id uuid NOT NULL,
  position smallint NOT NULL,
  role text NOT NULL,
  lang text NOT NULL,
  body text NOT NULL,
  cta text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_proposals_slot UNIQUE (publication_id, position),
  CONSTRAINT publication_proposals_role_position CHECK (
    (position = 1 AND role = 'direct') OR (position = 2 AND role = 'close') OR (position = 3 AND role = 'professional')
  ),
  CONSTRAINT publication_proposals_lang_check CHECK (lang IN ('es', 'en')),
  CONSTRAINT publication_proposals_body_length CHECK (char_length(body) BETWEEN 1 AND 1000),
  CONSTRAINT publication_proposals_cta_length CHECK (char_length(cta) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS publication_proposals_user_id_idx ON public.publication_proposals (user_id);

ALTER TABLE public.publication_proposals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.publication_proposals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.publication_proposals TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.publication_proposals TO service_role;

DROP POLICY IF EXISTS "select_own_publication_proposals" ON public.publication_proposals;
CREATE POLICY "select_own_publication_proposals" ON public.publication_proposals FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.publications_invalidate_proposals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.image_path IS DISTINCT FROM OLD.image_path THEN
    DELETE FROM public.publication_proposals WHERE publication_id = OLD.id;
    NEW.proposal_generation_id := NULL;
    NEW.proposals_lang := NULL;
    NEW.proposals_generated_at := NULL;
    NEW.generation_claim_id := NULL;
    NEW.generation_claimed_at := NULL;
    NEW.status := CASE WHEN NEW.image_path IS NULL THEN 'draft' ELSE 'image_ready' END;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.publications_invalidate_proposals() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS publications_invalidate_proposals ON public.publications;
CREATE TRIGGER publications_invalidate_proposals
  BEFORE UPDATE ON public.publications
  FOR EACH ROW EXECUTE FUNCTION public.publications_invalidate_proposals();

CREATE OR REPLACE FUNCTION public.claim_publication_generation(
  p_publication_id uuid, p_user_id uuid, p_claim_id uuid, p_image_path text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pub public.publications;
BEGIN
  IF p_publication_id IS NULL OR p_user_id IS NULL OR p_claim_id IS NULL OR p_image_path IS NULL THEN
    RETURN 'not_found';
  END IF;
  SELECT * INTO v_pub FROM public.publications
  WHERE id = p_publication_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_pub.image_path IS DISTINCT FROM p_image_path OR NOT v_pub.image_normalized THEN
    RETURN 'stale';
  END IF;
  IF v_pub.generation_claim_id IS NOT NULL AND v_pub.generation_claimed_at > now() - interval '3 minutes' THEN
    RETURN 'busy';
  END IF;
  IF v_pub.proposal_generations_used >= 4 THEN
    RETURN 'limit';
  END IF;
  UPDATE public.publications
  SET generation_claim_id = p_claim_id, generation_claimed_at = now()
  WHERE id = v_pub.id;
  RETURN 'claimed';
END;
$$;

CREATE OR REPLACE FUNCTION public.release_publication_generation(
  p_publication_id uuid, p_user_id uuid, p_claim_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.publications
  SET generation_claim_id = NULL, generation_claimed_at = NULL
  WHERE id = p_publication_id AND user_id = p_user_id AND generation_claim_id = p_claim_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_publication_generation(
  p_publication_id uuid, p_user_id uuid, p_claim_id uuid, p_image_path text, p_lang text, p_proposals jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pub public.publications;
  v_generation uuid := gen_random_uuid();
  v_now timestamptz := now();
BEGIN
  IF p_lang IS NULL OR p_lang NOT IN ('es', 'en') OR p_proposals IS NULL
     OR jsonb_typeof(p_proposals) <> 'array' OR jsonb_array_length(p_proposals) <> 3 THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_pub FROM public.publications
  WHERE id = p_publication_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_pub.generation_claim_id IS DISTINCT FROM p_claim_id
     OR v_pub.image_path IS DISTINCT FROM p_image_path OR NOT v_pub.image_normalized
     OR v_pub.proposal_generations_used >= 4 THEN
    RETURN NULL;
  END IF;

  DELETE FROM public.publication_proposals WHERE publication_id = v_pub.id;
  INSERT INTO public.publication_proposals (publication_id, user_id, generation_id, position, role, lang, body, cta)
  SELECT v_pub.id, v_pub.user_id, v_generation, e.ord::smallint, e.value->>'role', p_lang, e.value->>'body', e.value->>'cta'
  FROM jsonb_array_elements(p_proposals) WITH ORDINALITY AS e(value, ord);

  UPDATE public.publications
  SET status = 'proposals_ready',
      proposal_generation_id = v_generation,
      proposals_lang = p_lang,
      proposals_generated_at = v_now,
      proposal_generations_used = v_pub.proposal_generations_used + 1,
      generation_claim_id = NULL,
      generation_claimed_at = NULL
  WHERE id = v_pub.id;

  RETURN jsonb_build_object(
    'generation_id', v_generation,
    'generated_at', v_now,
    'generations_used', v_pub.proposal_generations_used + 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_publication_generation(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_publication_generation(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_publication_generation(uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_publication_generation(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_publication_generation(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_publication_generation(uuid, uuid, uuid, text, text, jsonb) TO service_role;

-- AI usage ledger: publication-proposals (cap 20, global 80 unchanged)

ALTER TABLE public.ai_usage_monthly ADD COLUMN IF NOT EXISTS publication_proposals_used integer NOT NULL DEFAULT 0;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_usage_monthly_publication_proposals_non_negative') THEN
    ALTER TABLE public.ai_usage_monthly ADD CONSTRAINT ai_usage_monthly_publication_proposals_non_negative
      CHECK (publication_proposals_used >= 0);
  END IF;
END $$;

ALTER TABLE public.ai_usage_reservations DROP CONSTRAINT IF EXISTS ai_usage_reservations_function_check;
ALTER TABLE public.ai_usage_reservations ADD CONSTRAINT ai_usage_reservations_function_check
  CHECK (function IN ('weekly-content', 'business-improvement', 'seo-generator', 'business-advisor', 'voice-simulator', 'review-reply', 'publication-proposals'));

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
    WHEN 'publication-proposals' THEN 20
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
WHEN 'publication-proposals' THEN v_row.publication_proposals_used
END;
v_global_used := v_row.weekly_content_used + v_row.business_improvement_used
+ v_row.seo_generator_used + v_row.business_advisor_used + v_row.voice_simulator_used
+ v_row.review_reply_used + v_row.publication_proposals_used;

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
review_reply_used = review_reply_used + (p_function = 'review-reply')::int,
publication_proposals_used = publication_proposals_used + (p_function = 'publication-proposals')::int
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
review_reply_used = GREATEST(review_reply_used - (v_res.function = 'review-reply')::int, 0),
publication_proposals_used = GREATEST(publication_proposals_used - (v_res.function = 'publication-proposals')::int, 0)
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
count(*) FILTER (WHERE function = 'review-reply') AS rr,
count(*) FILTER (WHERE function = 'publication-proposals') AS pp
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
review_reply_used = GREATEST(m.review_reply_used, l.rr),
publication_proposals_used = GREATEST(m.publication_proposals_used, l.pp)
FROM ledger l
WHERE m.user_id = l.user_id AND m.period_start = l.period_start
AND (m.weekly_content_used < l.wc OR m.business_improvement_used < l.bi
OR m.seo_generator_used < l.sg OR m.business_advisor_used < l.ba OR m.voice_simulator_used < l.vs
OR m.review_reply_used < l.rr OR m.publication_proposals_used < l.pp);
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
COALESCE((SELECT review_reply_used FROM r), 0) AS rr,
COALESCE((SELECT publication_proposals_used FROM r), 0) AS pp
)
SELECT jsonb_build_object(
'period_start', date_trunc('month', timezone('utc', now()))::date,
'functions', jsonb_build_object(
'weekly-content', jsonb_build_object('used', wc, 'limit', public.ai_usage_cap('weekly-content')),
'business-improvement', jsonb_build_object('used', bi, 'limit', public.ai_usage_cap('business-improvement')),
'seo-generator', jsonb_build_object('used', seo, 'limit', public.ai_usage_cap('seo-generator')),
'business-advisor', jsonb_build_object('used', ba, 'limit', public.ai_usage_cap('business-advisor')),
'voice-simulator', jsonb_build_object('used', vs, 'limit', public.ai_usage_cap('voice-simulator')),
'review-reply', jsonb_build_object('used', rr, 'limit', public.ai_usage_cap('review-reply')),
'publication-proposals', jsonb_build_object('used', pp, 'limit', public.ai_usage_cap('publication-proposals'))
),
'global', jsonb_build_object('used', wc + bi + seo + ba + vs + rr + pp, 'limit', public.ai_usage_cap('global'))
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
