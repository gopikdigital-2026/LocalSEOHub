/*
# v0.7.3 - "Tus respuestas preparadas" (prepared customer replies)

Stores the replies a business owner prepares for five common customer questions, plus the two
facts the existing business profile does not have (address and how to book). Replies are built in
the browser from deterministic templates; no AI is involved and nothing is ever sent to customers.

1. New Tables
- `prepared_replies`: one saved reply per business, category and language.
  - `id` (uuid, pk)
  - `user_id` (uuid, owner, defaults to the signed-in user)
  - `business_id` (uuid, the owner's business)
  - `category` (text: location | services | hours | booking | contact)
  - `lang` (text: es | en) - each language is stored separately and never overwrites the other
  - `content` (text, 1..1000 visible characters, no control characters except line breaks and tabs)
  - `origin` (text: template | edited) - suggested by template vs. edited by the owner
  - `source_fingerprint` (text, max 64) - summary of the business facts the template used, so the
    app can tell the owner when their data changed; the reply itself is never rewritten automatically
  - `version` (integer) - increases on every save; used to detect edits made in another tab
  - `created_at`, `updated_at`
  - UNIQUE (business_id, category, lang): no duplicates per category and language
- `prepared_reply_details`: one row per business with owner-declared facts missing from the profile.
  - `business_id` (uuid, pk)
  - `user_id` (uuid, owner, defaults to the signed-in user)
  - `address` (text, optional, max 200, no control characters)
  - `booking_method` (text, optional: phone | website | in_person | walk_in)
  - `version`, `created_at`, `updated_at`

2. Security
- RLS enabled on both tables. The owner can read and write only rows of a business they own.
- Creating or changing rows additionally requires an active trial or subscription, checked in the
  database with the existing `current_user_has_premium()` (restrictive policies). Reading stays
  allowed so an owner can still see and copy what they saved.
- No DELETE policy or privilege: the feature never deletes replies.
- The anon role has no access. Signed-in users only hold SELECT plus INSERT/UPDATE on the
  editable columns; owner, business, category, language, version and dates cannot be set by them.
- BEFORE triggers (`prepared_replies_guard`, `prepared_reply_details_guard`) keep identity columns
  immutable and bump `version` / `updated_at`.

3. Important notes
1. Incremental and idempotent; no existing table is modified (businesses, weekly content and
   business improvement tables are untouched).
2. No Premium, billing or subscription object is changed; the existing check is only reused.
*/

CREATE TABLE IF NOT EXISTS public.prepared_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  category text NOT NULL,
  lang text NOT NULL,
  content text NOT NULL,
  origin text NOT NULL DEFAULT 'template',
  source_fingerprint text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prepared_replies_category_check CHECK (category IN ('location', 'services', 'hours', 'booking', 'contact')),
  CONSTRAINT prepared_replies_lang_check CHECK (lang IN ('es', 'en')),
  CONSTRAINT prepared_replies_content_check CHECK (
    char_length(content) <= 1000 AND char_length(btrim(content)) >= 1
    AND content !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]'
  ),
  CONSTRAINT prepared_replies_origin_check CHECK (origin IN ('template', 'edited')),
  CONSTRAINT prepared_replies_fingerprint_check CHECK (char_length(source_fingerprint) <= 64),
  CONSTRAINT prepared_replies_version_check CHECK (version >= 1),
  CONSTRAINT prepared_replies_unique UNIQUE (business_id, category, lang)
);

CREATE INDEX IF NOT EXISTS prepared_replies_user_idx ON public.prepared_replies (user_id);

CREATE TABLE IF NOT EXISTS public.prepared_reply_details (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  address text,
  booking_method text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prepared_reply_details_address_check CHECK (
    address IS NULL OR (char_length(address) <= 200 AND char_length(btrim(address)) >= 1
    AND address !~ '[\x01-\x1f\x7f]')
  ),
  CONSTRAINT prepared_reply_details_booking_check CHECK (
    booking_method IS NULL OR booking_method IN ('phone', 'website', 'in_person', 'walk_in')
  ),
  CONSTRAINT prepared_reply_details_version_check CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS prepared_reply_details_user_idx ON public.prepared_reply_details (user_id);

ALTER TABLE public.prepared_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prepared_reply_details ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.prepared_replies FROM anon;
REVOKE ALL ON public.prepared_replies FROM authenticated;
GRANT SELECT ON public.prepared_replies TO authenticated;
GRANT INSERT (business_id, category, lang, content, origin, source_fingerprint) ON public.prepared_replies TO authenticated;
GRANT UPDATE (content, origin, source_fingerprint) ON public.prepared_replies TO authenticated;

REVOKE ALL ON public.prepared_reply_details FROM anon;
REVOKE ALL ON public.prepared_reply_details FROM authenticated;
GRANT SELECT ON public.prepared_reply_details TO authenticated;
GRANT INSERT (business_id, address, booking_method) ON public.prepared_reply_details TO authenticated;
GRANT UPDATE (address, booking_method) ON public.prepared_reply_details TO authenticated;

DROP POLICY IF EXISTS "select_own_prepared_replies" ON public.prepared_replies;
CREATE POLICY "select_own_prepared_replies" ON public.prepared_replies FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = prepared_replies.business_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_prepared_replies" ON public.prepared_replies;
CREATE POLICY "insert_own_prepared_replies" ON public.prepared_replies FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = prepared_replies.business_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_prepared_replies" ON public.prepared_replies;
CREATE POLICY "update_own_prepared_replies" ON public.prepared_replies FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = prepared_replies.business_id AND b.user_id = auth.uid()))
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = prepared_replies.business_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "premium_insert_prepared_replies" ON public.prepared_replies;
CREATE POLICY "premium_insert_prepared_replies" ON public.prepared_replies AS RESTRICTIVE FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.current_user_has_premium()));

DROP POLICY IF EXISTS "premium_update_prepared_replies" ON public.prepared_replies;
CREATE POLICY "premium_update_prepared_replies" ON public.prepared_replies AS RESTRICTIVE FOR UPDATE
  TO authenticated
  USING ((SELECT public.current_user_has_premium()))
  WITH CHECK ((SELECT public.current_user_has_premium()));

DROP POLICY IF EXISTS "select_own_prepared_reply_details" ON public.prepared_reply_details;
CREATE POLICY "select_own_prepared_reply_details" ON public.prepared_reply_details FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = prepared_reply_details.business_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_prepared_reply_details" ON public.prepared_reply_details;
CREATE POLICY "insert_own_prepared_reply_details" ON public.prepared_reply_details FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = prepared_reply_details.business_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_prepared_reply_details" ON public.prepared_reply_details;
CREATE POLICY "update_own_prepared_reply_details" ON public.prepared_reply_details FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = prepared_reply_details.business_id AND b.user_id = auth.uid()))
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = prepared_reply_details.business_id AND b.user_id = auth.uid()));

DROP POLICY IF EXISTS "premium_insert_prepared_reply_details" ON public.prepared_reply_details;
CREATE POLICY "premium_insert_prepared_reply_details" ON public.prepared_reply_details AS RESTRICTIVE FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.current_user_has_premium()));

DROP POLICY IF EXISTS "premium_update_prepared_reply_details" ON public.prepared_reply_details;
CREATE POLICY "premium_update_prepared_reply_details" ON public.prepared_reply_details AS RESTRICTIVE FOR UPDATE
  TO authenticated
  USING ((SELECT public.current_user_has_premium()))
  WITH CHECK ((SELECT public.current_user_has_premium()));

CREATE OR REPLACE FUNCTION public.prepared_replies_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1;
    NEW.created_at := now();
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  NEW.id := OLD.id;
  NEW.user_id := OLD.user_id;
  NEW.business_id := OLD.business_id;
  NEW.category := OLD.category;
  NEW.lang := OLD.lang;
  NEW.created_at := OLD.created_at;
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepared_reply_details_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.version := 1;
    NEW.created_at := now();
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  NEW.user_id := OLD.user_id;
  NEW.business_id := OLD.business_id;
  NEW.created_at := OLD.created_at;
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prepared_replies_guard ON public.prepared_replies;
CREATE TRIGGER prepared_replies_guard
  BEFORE INSERT OR UPDATE ON public.prepared_replies
  FOR EACH ROW EXECUTE FUNCTION public.prepared_replies_guard();

DROP TRIGGER IF EXISTS prepared_reply_details_guard ON public.prepared_reply_details;
CREATE TRIGGER prepared_reply_details_guard
  BEFORE INSERT OR UPDATE ON public.prepared_reply_details
  FOR EACH ROW EXECUTE FUNCTION public.prepared_reply_details_guard();

REVOKE ALL ON FUNCTION public.prepared_replies_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prepared_reply_details_guard() FROM PUBLIC, anon, authenticated;
