/*
# v0.7.1 - Weekly content drafts ("Tu contenido de la semana")

Stores one editable social-media draft per business and per week. The draft is
always a draft: nothing here means the content was published.

1. New Tables
- `weekly_content_drafts`
  - `id` (uuid, primary key)
  - `user_id` (uuid, owner, defaults to the signed-in user)
  - `business_id` (uuid, business the draft belongs to)
  - `week_start` (date, Monday of the week the draft is for)
  - `lang` (text, 'es' or 'en', language of the last generated version)
  - `content` (text, current text shown to the owner, editable, max 2200 chars)
  - `generated_content` (text, last text produced by the AI, max 2200 chars)
  - `topic` (text, angle of the last generated version)
  - `topics_used` (text[], angles already used this week, max 3)
  - `generations` (smallint, 0..3: first draft + up to two alternative versions)
  - `generating_since` (timestamptz, generation lock; null when idle)
  - `generated_at`, `edited_at`, `copied_at` (timestamptz, explicit events)
  - `created_at`, `updated_at`
  - Unique per (business_id, week_start)

2. Security
- RLS enabled. Owners can SELECT and UPDATE only their own drafts for businesses they own.
- No INSERT or DELETE policy: rows are only created by the server generation function.
- Column privileges: signed-in users may update only `content` and `copied_at`.
  `generations`, the lock, topics and ownership cannot be changed from the browser.
- A trigger sets `edited_at`, `copied_at` and `updated_at` with server time.
- Three SECURITY DEFINER functions (reserve / complete / release) enforce the weekly
  limit atomically with a row lock. EXECUTE is granted only to `service_role`
  (used by the `weekly-content` edge function after it has verified the user).

3. Important notes
1. Incremental and idempotent: safe to re-run; no existing table or data is modified.
2. The limit (3 generations per business and week) is enforced in the database,
   so reloads, several tabs or simultaneous requests cannot exceed it.
3. A failed generation releases the lock without consuming quota.
*/

CREATE TABLE IF NOT EXISTS public.weekly_content_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  lang text NOT NULL DEFAULT 'es',
  content text NOT NULL DEFAULT '',
  generated_content text NOT NULL DEFAULT '',
  topic text NOT NULL DEFAULT '',
  topics_used text[] NOT NULL DEFAULT '{}',
  generations smallint NOT NULL DEFAULT 0,
  generating_since timestamptz,
  generated_at timestamptz,
  edited_at timestamptz,
  copied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weekly_content_drafts_business_week_key UNIQUE (business_id, week_start),
  CONSTRAINT weekly_content_drafts_week_is_monday CHECK (extract(isodow FROM week_start) = 1),
  CONSTRAINT weekly_content_drafts_lang_check CHECK (lang IN ('es', 'en')),
  CONSTRAINT weekly_content_drafts_content_len CHECK (char_length(content) <= 2200),
  CONSTRAINT weekly_content_drafts_generated_len CHECK (char_length(generated_content) <= 2200),
  CONSTRAINT weekly_content_drafts_topic_len CHECK (char_length(topic) <= 64),
  CONSTRAINT weekly_content_drafts_topics_max CHECK (cardinality(topics_used) <= 3),
  CONSTRAINT weekly_content_drafts_generations_range CHECK (generations BETWEEN 0 AND 3),
  CONSTRAINT weekly_content_drafts_content_present CHECK (
    (generations = 0 AND content = '') OR (generations > 0 AND char_length(btrim(content)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS weekly_content_drafts_user_business_week_idx
  ON public.weekly_content_drafts (user_id, business_id, week_start DESC);

ALTER TABLE public.weekly_content_drafts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.weekly_content_drafts FROM anon;
REVOKE ALL ON public.weekly_content_drafts FROM authenticated;
GRANT SELECT ON public.weekly_content_drafts TO authenticated;
GRANT UPDATE (content, copied_at) ON public.weekly_content_drafts TO authenticated;

DROP POLICY IF EXISTS "select_own_weekly_content" ON public.weekly_content_drafts;
CREATE POLICY "select_own_weekly_content" ON public.weekly_content_drafts FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "update_own_weekly_content" ON public.weekly_content_drafts;
CREATE POLICY "update_own_weekly_content" ON public.weekly_content_drafts FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.user_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.weekly_content_drafts_before_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.generations = OLD.generations AND NEW.content IS DISTINCT FROM OLD.content THEN
    NEW.edited_at := now();
  END IF;
  IF NEW.copied_at IS NOT NULL AND NEW.copied_at IS DISTINCT FROM OLD.copied_at THEN
    NEW.copied_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS weekly_content_drafts_before_update ON public.weekly_content_drafts;
CREATE TRIGGER weekly_content_drafts_before_update
  BEFORE UPDATE ON public.weekly_content_drafts
  FOR EACH ROW EXECUTE FUNCTION public.weekly_content_drafts_before_update();

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

  UPDATE public.weekly_content_drafts SET generating_since = now() WHERE id = v_row.id;

  SELECT coalesce(array_agg(t), '{}') INTO v_recent FROM (
    SELECT unnest(d.topics_used) AS t FROM public.weekly_content_drafts d
    WHERE d.business_id = p_business_id AND d.week_start < p_week_start
      AND d.week_start >= p_week_start - 28
  ) s;

  RETURN jsonb_build_object(
    'status', 'reserved', 'id', v_row.id, 'generations', v_row.generations,
    'topics_used', to_jsonb(v_row.topics_used), 'recent_topics', to_jsonb(v_recent)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_weekly_content(
  p_id uuid, p_user_id uuid, p_content text, p_topic text, p_lang text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_content IS NULL OR char_length(btrim(p_content)) = 0 OR char_length(p_content) > 2200
     OR p_topic IS NULL OR char_length(p_topic) > 64 OR p_lang NOT IN ('es', 'en') THEN
    RETURN false;
  END IF;
  UPDATE public.weekly_content_drafts
  SET content = p_content, generated_content = p_content, topic = p_topic,
      topics_used = array_append(topics_used, p_topic), lang = p_lang,
      generations = generations + 1, generating_since = NULL,
      generated_at = now(), edited_at = NULL, copied_at = NULL
  WHERE id = p_id AND user_id = p_user_id AND generating_since IS NOT NULL AND generations < 3
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_weekly_content(p_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.weekly_content_drafts SET generating_since = NULL
  WHERE id = p_id AND user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_weekly_content(uuid, uuid, date, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_weekly_content(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_weekly_content(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.weekly_content_drafts_before_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_weekly_content(uuid, uuid, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_weekly_content(uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_weekly_content(uuid, uuid) TO service_role;
