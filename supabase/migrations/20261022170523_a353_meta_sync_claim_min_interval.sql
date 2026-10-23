/*
# A3.5.3 — Meta sync claim: minimum interval between syncs

1. Modified functions
  - `meta_sync_claim` now refuses a new sync (result `cooldown`) when either platform
    has a sync in flight (`sync_started_at`) OR finished an attempt (`last_attempt_at`)
    within the cooldown window. Previously only in-flight syncs were blocked, so a user
    could trigger syncs back-to-back and burn the Meta rate-limit budget.

2. Security
  - Unchanged: SECURITY DEFINER, empty search_path, EXECUTE only for service_role.

3. Notes
  1. No table changes, no data changes.
*/

CREATE OR REPLACE FUNCTION public.meta_sync_claim(p_connection_id uuid, p_user_id uuid, p_cooldown_seconds integer)
RETURNS TABLE (result text, page_id text, instagram_status text, instagram_account_id text, token_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_conn public.meta_connections%ROWTYPE;
  v_window interval := make_interval(secs => GREATEST(p_cooldown_seconds, 0));
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
      AND (s.sync_started_at > now() - v_window OR s.last_attempt_at > now() - v_window)
  ) THEN
    RETURN QUERY SELECT 'cooldown'::text, NULL::text, NULL::text, NULL::text, NULL::timestamptz; RETURN;
  END IF;

  UPDATE public.meta_sync_state s SET sync_started_at = now(), updated_at = now()
  WHERE s.connection_id = v_conn.id;

  RETURN QUERY SELECT 'ok'::text, v_conn.page_id, v_conn.instagram_status, v_conn.instagram_account_id, v_conn.token_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.meta_sync_claim(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meta_sync_claim(uuid, uuid, integer) TO service_role;
