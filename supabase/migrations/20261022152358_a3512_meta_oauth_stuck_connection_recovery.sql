/*
# A3.5.1.2 Meta OAuth stuck-connection recovery

## 1. Changes
1. `meta_begin_attempt` now refuses to start a new OAuth attempt over a `connected` connection.
   It raises `META_ALREADY_CONNECTED` under the row lock, so a valid connection's credentials are
   never wiped by a failed or abandoned re-attempt. Every other status keeps its previous behaviour.
2. New `meta_cancel_attempt(p_connection_id)`: only acts on `connecting` / `authorized` rows.
   It moves them to `disconnected` (last_error `OAUTH_CANCELLED`) and deletes every OAuth state of
   that connection. Any other status is left untouched. Returns true when it cancelled something.
3. New `meta_expire_stale_attempt(p_connection_id, p_stale_before)`: only acts on
   `connecting` / `authorized` rows. It expires the attempt (status `error`, `OAUTH_STATE_EXPIRED`,
   states deleted) when the attempt started before `p_stale_before`, has no start time, or no
   longer has any live state:
   - connecting: an unconsumed state not yet expired, or a state consumed in the last 2 minutes
     (token exchange still in flight);
   - authorized: a state whose completion window is still open.

## 2. Tables
No tables or columns are added or modified.

## 3. Security
All functions are SECURITY DEFINER with an empty search_path. EXECUTE is revoked from
PUBLIC/anon/authenticated and granted to service_role only. The edge function resolves the
connection id from the caller's verified JWT, so a user can never reach another user's row.

## 4. Notes
1. Idempotent: CREATE OR REPLACE only; same signatures as before.
*/

CREATE OR REPLACE FUNCTION public.meta_begin_attempt(
  p_user_id uuid, p_business_id uuid, p_state_hash text, p_binding_hash text, p_expires_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_id uuid;
  v_status text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = p_business_id AND user_id = p_user_id) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.meta_connections (user_id, business_id, status)
  VALUES (p_user_id, p_business_id, 'disconnected')
  ON CONFLICT (user_id, business_id) DO NOTHING;
  SELECT id, status INTO v_id, v_status FROM public.meta_connections
  WHERE user_id = p_user_id AND business_id = p_business_id FOR UPDATE;
  IF v_status = 'connected' THEN
    RAISE EXCEPTION 'META_ALREADY_CONNECTED';
  END IF;
  DELETE FROM public.meta_oauth_states WHERE connection_id = v_id;
  UPDATE public.meta_connections
  SET status = 'connecting', last_error = NULL, last_error_at = NULL, revocation_status = NULL,
      last_synced_at = NULL, attempt_started_at = now(), updated_at = now()
  WHERE id = v_id;
  INSERT INTO public.meta_oauth_states (connection_id, user_id, state_hash, binding_hash, expires_at)
  VALUES (v_id, p_user_id, p_state_hash, p_binding_hash, p_expires_at);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.meta_cancel_attempt(p_connection_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.meta_connections WHERE id = p_connection_id FOR UPDATE;
  IF NOT FOUND OR v_status NOT IN ('connecting','authorized') THEN
    RETURN false;
  END IF;
  PERFORM public.meta_fail_connection(p_connection_id, 'disconnected', 'OAUTH_CANCELLED');
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.meta_expire_stale_attempt(p_connection_id uuid, p_stale_before timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_conn public.meta_connections%ROWTYPE;
  v_live boolean;
BEGIN
  SELECT * INTO v_conn FROM public.meta_connections WHERE id = p_connection_id FOR UPDATE;
  IF NOT FOUND OR v_conn.status NOT IN ('connecting','authorized') THEN
    RETURN false;
  END IF;
  IF v_conn.status = 'connecting' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.meta_oauth_states s
      WHERE s.connection_id = p_connection_id
        AND ((s.consumed_at IS NULL AND s.expires_at > now())
          OR (s.consumed_at IS NOT NULL AND s.consumed_at > now() - interval '2 minutes'))
    ) INTO v_live;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.meta_oauth_states s
      WHERE s.connection_id = p_connection_id AND s.completion_expires_at > now()
    ) INTO v_live;
  END IF;
  IF v_live AND v_conn.attempt_started_at IS NOT NULL AND v_conn.attempt_started_at >= p_stale_before THEN
    RETURN false;
  END IF;
  PERFORM public.meta_fail_connection(p_connection_id, 'error', 'OAUTH_STATE_EXPIRED');
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.meta_begin_attempt(uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_cancel_attempt(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_expire_stale_attempt(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meta_begin_attempt(uuid, uuid, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_cancel_attempt(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_expire_stale_attempt(uuid, timestamptz) TO service_role;
