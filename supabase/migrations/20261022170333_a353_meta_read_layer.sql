/*
# A3.5.3 — Facebook & Instagram Read Layer (additive)

Stores a normalized, minimal copy of the connected Facebook Page and Instagram professional
account content that the server reads from Meta, plus a per-platform sync status.

1. New Tables
- `meta_sync_state` (one row per connection + platform)
  - `connection_id` (FK meta_connections, cascade), `user_id`, `business_id`, `platform` (facebook | instagram)
  - `external_account_id` — Page ID / Instagram account ID the data belongs to
  - `status` — never | ok | empty | not_linked | permission_unavailable | reauth_required | rate_limited | malformed | api_error
  - `error_code`, `item_count` (null until a successful read), `pages_fetched`
  - `profile` — normalized whitelisted profile fields (never a raw Graph response)
  - `sync_started_at` (cooldown claim), `last_attempt_at`, `last_success_at`, `updated_at`
- `meta_content_items` (own posts / media)
  - `user_id`, `business_id`, `connection_id`, `platform`, `account_external_id`, `external_id` (real Meta ID)
  - `content_type`, `text_content`, `published_at`, `permalink`
  - `reaction_count`, `comment_count` — NULL when Meta did not provide the value (never coerced to 0)
  - `fetched_at`; UNIQUE (connection_id, platform, external_id) prevents duplicates

2. Security
- RLS enabled on both tables. `authenticated` gets SELECT only, owner-only policies.
- No INSERT/UPDATE/DELETE grants or policies for browser roles: writes happen only through
  SECURITY DEFINER functions executable by `service_role` only.
- No token, secret or raw Graph payload is stored in these tables.

3. New Functions (service_role only, empty search_path)
- `meta_sync_claim(connection, user, cooldown)` — verifies ownership + `connected`, applies a cooldown,
  returns the validated Page / Instagram IDs and token expiry from the frozen connection row.
- `meta_sync_apply(...)` — validates ownership and that the account ID still matches the connection,
  then upserts items (dedup by Meta ID) and replaces the recent set on success; on failure only the
  status/error is updated and previously read data and `last_success_at` are kept untouched.

4. New Trigger (additive, frozen A3.5.2 functions untouched)
- `meta_connections_purge_content` AFTER UPDATE on `meta_connections`: deletes read data when the
  connection is disconnected / restarted or the Page / Instagram account changes.

## Important notes
1. No existing table, column, policy, function or trigger is modified.
2. Deleting a connection cascades to these tables.
*/

CREATE TABLE IF NOT EXISTS public.meta_sync_state (
  connection_id uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram')),
  external_account_id text CHECK (external_account_id IS NULL OR external_account_id ~ '^\d{1,40}$'),
  status text NOT NULL DEFAULT 'never' CHECK (status IN ('never','ok','empty','not_linked','permission_unavailable','reauth_required','rate_limited','malformed','api_error')),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[A-Z_]{1,64}$'),
  item_count integer CHECK (item_count IS NULL OR item_count >= 0),
  pages_fetched integer CHECK (pages_fetched IS NULL OR pages_fetched >= 0),
  profile jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(profile) = 'object'),
  sync_started_at timestamptz,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, platform)
);

CREATE TABLE IF NOT EXISTS public.meta_content_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('facebook','instagram')),
  account_external_id text NOT NULL CHECK (account_external_id ~ '^\d{1,40}$'),
  external_id text NOT NULL CHECK (external_id ~ '^\d{1,40}(_\d{1,40})?$'),
  content_type text NOT NULL CHECK (content_type IN ('post','photo','video','link','status','event','image','carousel','reel','other')),
  text_content text CHECK (text_content IS NULL OR length(text_content) <= 5000),
  published_at timestamptz,
  permalink text CHECK (permalink IS NULL OR (permalink ~ '^https://' AND length(permalink) <= 1000)),
  reaction_count integer CHECK (reaction_count IS NULL OR reaction_count >= 0),
  comment_count integer CHECK (comment_count IS NULL OR comment_count >= 0),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, platform, external_id)
);

CREATE INDEX IF NOT EXISTS meta_content_items_user_idx ON public.meta_content_items (user_id, platform, published_at DESC);
CREATE INDEX IF NOT EXISTS meta_sync_state_user_idx ON public.meta_sync_state (user_id);

ALTER TABLE public.meta_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_content_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.meta_sync_state FROM anon, authenticated;
REVOKE ALL ON public.meta_content_items FROM anon, authenticated;
GRANT SELECT ON public.meta_sync_state TO authenticated;
GRANT SELECT ON public.meta_content_items TO authenticated;

DROP POLICY IF EXISTS "select_own_meta_sync_state" ON public.meta_sync_state;
CREATE POLICY "select_own_meta_sync_state" ON public.meta_sync_state FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_own_meta_content_items" ON public.meta_content_items;
CREATE POLICY "select_own_meta_content_items" ON public.meta_content_items FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.meta_sync_claim(p_connection_id uuid, p_user_id uuid, p_cooldown_seconds integer)
RETURNS TABLE (result text, page_id text, instagram_status text, instagram_account_id text, token_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_conn public.meta_connections%ROWTYPE;
BEGIN
  SELECT * INTO v_conn FROM public.meta_connections c WHERE c.id = p_connection_id FOR UPDATE;
  IF NOT FOUND OR v_conn.user_id <> p_user_id OR v_conn.status <> 'connected' OR v_conn.page_id IS NULL THEN
    RETURN QUERY SELECT 'not_connected'::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz; RETURN;
  END IF;

  INSERT INTO public.meta_sync_state (connection_id, user_id, business_id, platform)
  VALUES (v_conn.id, v_conn.user_id, v_conn.business_id, 'facebook'),
         (v_conn.id, v_conn.user_id, v_conn.business_id, 'instagram')
  ON CONFLICT (connection_id, platform) DO NOTHING;

  IF EXISTS (
    SELECT 1 FROM public.meta_sync_state s
    WHERE s.connection_id = v_conn.id
      AND s.sync_started_at > now() - make_interval(secs => GREATEST(p_cooldown_seconds, 0))
  ) THEN
    RETURN QUERY SELECT 'cooldown'::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz; RETURN;
  END IF;

  UPDATE public.meta_sync_state s SET sync_started_at = now(), updated_at = now()
  WHERE s.connection_id = v_conn.id;

  RETURN QUERY SELECT 'ok'::text, v_conn.page_id, v_conn.instagram_status, v_conn.instagram_account_id, v_conn.token_expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.meta_sync_apply(
  p_connection_id uuid, p_user_id uuid, p_platform text, p_account_id text,
  p_status text, p_error_code text, p_profile jsonb, p_items jsonb, p_pages_fetched integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_conn public.meta_connections%ROWTYPE;
  v_expected text;
  v_count integer;
BEGIN
  IF p_platform NOT IN ('facebook','instagram') THEN
    RETURN false;
  END IF;
  SELECT * INTO v_conn FROM public.meta_connections c WHERE c.id = p_connection_id FOR UPDATE;
  IF NOT FOUND OR v_conn.user_id <> p_user_id OR v_conn.status <> 'connected' THEN
    RETURN false;
  END IF;

  v_expected := CASE
    WHEN p_platform = 'facebook' THEN v_conn.page_id
    WHEN v_conn.instagram_status = 'connected' THEN v_conn.instagram_account_id
    ELSE NULL END;

  IF p_status = 'not_linked' THEN
    IF p_platform <> 'instagram' OR v_expected IS NOT NULL THEN
      RETURN false;
    END IF;
    DELETE FROM public.meta_content_items WHERE connection_id = v_conn.id AND platform = 'instagram';
    UPDATE public.meta_sync_state s
    SET status = 'not_linked', error_code = NULL, item_count = NULL, pages_fetched = 0,
        profile = '{}'::jsonb, external_account_id = NULL, sync_started_at = NULL,
        last_attempt_at = now(), updated_at = now()
    WHERE s.connection_id = v_conn.id AND s.platform = 'instagram';
    RETURN true;
  END IF;

  IF v_expected IS NULL OR p_account_id IS DISTINCT FROM v_expected THEN
    RETURN false;
  END IF;

  IF p_status IN ('ok','empty') THEN
    IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_items, '[]'::jsonb)) > 200
       OR jsonb_typeof(COALESCE(p_profile, '{}'::jsonb)) <> 'object' OR pg_column_size(COALESCE(p_profile, '{}'::jsonb)) > 8192 THEN
      RETURN false;
    END IF;

    INSERT INTO public.meta_content_items AS m (
      user_id, business_id, connection_id, platform, account_external_id, external_id,
      content_type, text_content, published_at, permalink, reaction_count, comment_count, fetched_at)
    SELECT v_conn.user_id, v_conn.business_id, v_conn.id, p_platform, v_expected, i.external_id,
           i.content_type, i.text_content, i.published_at, i.permalink, i.reaction_count, i.comment_count, now()
    FROM jsonb_to_recordset(COALESCE(p_items, '[]'::jsonb)) AS i(
      external_id text, content_type text, text_content text, published_at timestamptz,
      permalink text, reaction_count integer, comment_count integer)
    ON CONFLICT (connection_id, platform, external_id) DO UPDATE
    SET content_type = EXCLUDED.content_type, text_content = EXCLUDED.text_content,
        published_at = EXCLUDED.published_at, permalink = EXCLUDED.permalink,
        reaction_count = EXCLUDED.reaction_count, comment_count = EXCLUDED.comment_count,
        account_external_id = EXCLUDED.account_external_id, fetched_at = now();

    DELETE FROM public.meta_content_items m
    WHERE m.connection_id = v_conn.id AND m.platform = p_platform
      AND m.external_id NOT IN (
        SELECT e->>'external_id' FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) e);

    SELECT count(*)::integer INTO v_count FROM public.meta_content_items m
    WHERE m.connection_id = v_conn.id AND m.platform = p_platform;

    UPDATE public.meta_sync_state s
    SET status = CASE WHEN v_count = 0 THEN 'empty' ELSE 'ok' END,
        error_code = NULL, item_count = v_count, pages_fetched = GREATEST(COALESCE(p_pages_fetched, 0), 0),
        profile = COALESCE(p_profile, '{}'::jsonb), external_account_id = v_expected,
        sync_started_at = NULL, last_attempt_at = now(), last_success_at = now(), updated_at = now()
    WHERE s.connection_id = v_conn.id AND s.platform = p_platform;
    RETURN true;
  END IF;

  IF p_status NOT IN ('permission_unavailable','reauth_required','rate_limited','malformed','api_error') THEN
    RETURN false;
  END IF;

  UPDATE public.meta_sync_state s
  SET status = p_status, error_code = p_error_code, external_account_id = v_expected,
      sync_started_at = NULL, last_attempt_at = now(), updated_at = now()
  WHERE s.connection_id = v_conn.id AND s.platform = p_platform;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.meta_connections_purge_content()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status IN ('disconnected','connecting') OR NEW.page_id IS DISTINCT FROM OLD.page_id THEN
    DELETE FROM public.meta_content_items WHERE connection_id = NEW.id;
    DELETE FROM public.meta_sync_state WHERE connection_id = NEW.id;
  ELSIF NEW.instagram_account_id IS DISTINCT FROM OLD.instagram_account_id THEN
    DELETE FROM public.meta_content_items WHERE connection_id = NEW.id AND platform = 'instagram';
    DELETE FROM public.meta_sync_state WHERE connection_id = NEW.id AND platform = 'instagram';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS meta_connections_purge_content ON public.meta_connections;
CREATE TRIGGER meta_connections_purge_content
  AFTER UPDATE ON public.meta_connections
  FOR EACH ROW EXECUTE FUNCTION public.meta_connections_purge_content();

REVOKE ALL ON FUNCTION public.meta_sync_claim(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_sync_apply(uuid, uuid, text, text, text, text, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_connections_purge_content() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meta_sync_claim(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_sync_apply(uuid, uuid, text, text, text, text, jsonb, jsonb, integer) TO service_role;
