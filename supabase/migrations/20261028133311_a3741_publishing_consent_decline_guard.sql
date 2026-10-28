/*
# A3.7.4.1 - Publishing consent decline / downgrade guard

## 1. What this does
Hardens `meta_store_publishing_consent` (created earlier in A3.7.4.1) so the separate
"enable publishing" consent can never weaken a healthy read-only Meta connection:
1. If the new grant is missing any read permission the connection already holds
   (pages_show_list, pages_read_engagement, business_management, instagram_basic), the consent is
   rejected with `downgrade` and the existing token/permissions stay untouched.
2. If the user granted neither `pages_manage_posts` nor `instagram_content_publish`, the consent is
   rejected with `declined` and the existing token/permissions stay untouched.
In both cases only the single-use consent state is discarded; the connection is never disconnected.

## 2. Tables
No table or column changes.

## 3. Security
Function stays SECURITY DEFINER with empty search_path, executable by service_role only.
*/

CREATE OR REPLACE FUNCTION public.meta_store_publishing_consent(
  p_connection_id uuid, p_state_hash text, p_access_token text, p_expires_at timestamptz,
  p_meta_user_id text, p_permissions text[], p_pages jsonb,
  p_completion_hash text, p_completion_expires_at timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_conn public.meta_connections%ROWTYPE;
  v_state_id uuid;
  v_tasks text[];
  v_perms text[];
  v_read text[];
BEGIN
  SELECT s.id INTO v_state_id FROM public.meta_publishing_consent_states s
  WHERE s.connection_id = p_connection_id AND s.state_hash = p_state_hash
    AND s.consumed_at IS NOT NULL AND s.completion_hash IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'stale';
  END IF;
  SELECT * INTO v_conn FROM public.meta_connections WHERE id = p_connection_id FOR UPDATE;
  IF NOT FOUND OR v_conn.status <> 'connected' OR p_access_token IS NULL OR p_access_token = '' THEN
    DELETE FROM public.meta_publishing_consent_states WHERE id = v_state_id;
    RETURN 'stale';
  END IF;
  IF v_conn.meta_user_id IS DISTINCT FROM p_meta_user_id THEN
    DELETE FROM public.meta_publishing_consent_states WHERE id = v_state_id;
    RETURN 'account_mismatch';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_perms
  FROM unnest(COALESCE(p_permissions, '{}')) AS x WHERE x ~ '^[a-z_]{1,64}$';
  v_read := ARRAY(SELECT x FROM unnest(v_conn.granted_permissions) AS x
                  WHERE x IN ('pages_show_list', 'pages_read_engagement', 'business_management', 'instagram_basic'));
  IF NOT (v_perms @> v_read) THEN
    DELETE FROM public.meta_publishing_consent_states WHERE id = v_state_id;
    RETURN 'downgrade';
  END IF;
  IF NOT (v_perms && ARRAY['pages_manage_posts', 'instagram_content_publish']) THEN
    DELETE FROM public.meta_publishing_consent_states WHERE id = v_state_id;
    RETURN 'declined';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT t ORDER BY t), '{}') INTO v_tasks
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_pages) = 'array' THEN p_pages ELSE '[]'::jsonb END) AS pg,
       jsonb_array_elements_text(CASE WHEN jsonb_typeof(pg->'tasks') = 'array' THEN pg->'tasks' ELSE '[]'::jsonb END) AS t
  WHERE pg->>'id' = v_conn.page_id AND t ~ '^[A-Z_]{1,32}$';
  UPDATE public.meta_publishing_consent_states
  SET pending_token_ref = public.meta_vault_put(NULL, p_access_token),
      pending_token_expires_at = p_expires_at,
      pending_permissions = v_perms,
      pending_page_tasks = v_tasks,
      completion_hash = p_completion_hash,
      completion_expires_at = p_completion_expires_at
  WHERE id = v_state_id;
  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.meta_store_publishing_consent(uuid, text, text, timestamptz, text, text[], jsonb, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meta_store_publishing_consent(uuid, text, text, timestamptz, text, text[], jsonb, text, timestamptz) TO service_role;
