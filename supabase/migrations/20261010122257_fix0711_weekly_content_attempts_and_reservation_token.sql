/*
# FIX 07.1.1 - Weekly content: attempt limit and per-request reservation token

## Plain-English summary
Protects the cost of the weekly content feature and closes a concurrency gap.
1. Every generation request that actually starts (reaches the AI) now counts as one attempt.
   Each business may start at most 6 attempts per week, failed ones included.
   The existing limit of 3 successful versions per week stays as it is.
2. Every reservation gets a unique, random token. Only the request holding the current
   token can finish the generation or release the lock, so a slow old request can never
   finish, count or unlock a newer one.

## Modified table: weekly_content_drafts
- `attempts` (smallint, 0..6, default 0): generation requests started this week for this business.
  Existing rows are backfilled with attempts = generations (each version used at least one attempt).
- `reservation_id` (uuid, nullable): token of the active reservation. Server-only; not readable by the browser.
- New check: generations can never exceed attempts.

## Modified functions (EXECUTE only for service_role, as before)
- `reserve_weekly_content`: same order of checks (ownership, week, stale, 3-version limit, busy lock),
  then rejects with `attempts` when 6 attempts are used. Otherwise, atomically under the row lock,
  increments `attempts`, sets the lock time and a new `reservation_id`, and returns it.
  Validation errors, stale requests, busy locks and limits do NOT consume an attempt.
- `complete_weekly_content(p_id, p_user_id, p_reservation_id, ...)`: only applies when the token matches the active reservation.
- `release_weekly_content(p_id, p_user_id, p_reservation_id)`: only clears the lock when the token matches.
- The old token-less signatures of complete/release are removed so they can no longer be called.

## Security
1. RLS policies are unchanged (owner-only SELECT/UPDATE, no INSERT/DELETE).
2. Browser SELECT is narrowed to an explicit column list that excludes `reservation_id`.
3. Browser UPDATE remains limited to (content, copied_at); attempts/reservation are not writable.
4. No browser role can execute the privileged functions.

## Data safety
No data is deleted. Existing drafts, edits and counters are preserved. Safe to re-run.
*/

ALTER TABLE public.weekly_content_drafts ADD COLUMN IF NOT EXISTS attempts smallint NOT NULL DEFAULT 0;
ALTER TABLE public.weekly_content_drafts ADD COLUMN IF NOT EXISTS reservation_id uuid;

UPDATE public.weekly_content_drafts SET attempts = LEAST(6, GREATEST(attempts, generations)) WHERE attempts < generations;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_content_drafts_attempts_range') THEN
    ALTER TABLE public.weekly_content_drafts
      ADD CONSTRAINT weekly_content_drafts_attempts_range CHECK (attempts BETWEEN 0 AND 6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_content_drafts_generations_le_attempts') THEN
    ALTER TABLE public.weekly_content_drafts
      ADD CONSTRAINT weekly_content_drafts_generations_le_attempts CHECK (generations <= attempts);
  END IF;
END $$;

REVOKE SELECT ON public.weekly_content_drafts FROM authenticated;
GRANT SELECT (
  id, user_id, business_id, week_start, lang, content, generated_content, topic, topics_used,
  generations, attempts, generating_since, generated_at, edited_at, copied_at, created_at, updated_at
) ON public.weekly_content_drafts TO authenticated;

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

DROP FUNCTION IF EXISTS public.complete_weekly_content(uuid, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.release_weekly_content(uuid, uuid);

CREATE OR REPLACE FUNCTION public.complete_weekly_content(
  p_id uuid, p_user_id uuid, p_reservation_id uuid, p_content text, p_topic text, p_lang text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_reservation_id IS NULL OR p_content IS NULL OR char_length(btrim(p_content)) = 0
     OR char_length(p_content) > 2200 OR p_topic IS NULL OR char_length(p_topic) > 64
     OR p_lang NOT IN ('es', 'en') THEN
    RETURN false;
  END IF;
  UPDATE public.weekly_content_drafts
  SET content = p_content, generated_content = p_content, topic = p_topic,
      topics_used = array_append(topics_used, p_topic), lang = p_lang,
      generations = generations + 1, generating_since = NULL, reservation_id = NULL,
      generated_at = now(), edited_at = NULL, copied_at = NULL
  WHERE id = p_id AND user_id = p_user_id
    AND reservation_id = p_reservation_id AND generating_since IS NOT NULL
    AND generations < 3
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_weekly_content(p_id uuid, p_user_id uuid, p_reservation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_reservation_id IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.weekly_content_drafts SET generating_since = NULL, reservation_id = NULL
  WHERE id = p_id AND user_id = p_user_id AND reservation_id = p_reservation_id
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_weekly_content(uuid, uuid, date, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_weekly_content(uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_weekly_content(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_weekly_content(uuid, uuid, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_weekly_content(uuid, uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_weekly_content(uuid, uuid, uuid) TO service_role;
