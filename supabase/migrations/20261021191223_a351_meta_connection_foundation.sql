/*
# A3.5.1 — Meta (Facebook & Instagram) business connection foundation

## Plain-English summary
Adds a dedicated, isolated place to store a LocalSEOHub user's connection to the Facebook Page
(and, when Meta exposes it, the professional Instagram account) that they manage. It is fully
separate from Google Business Profile (`connected_sources` is not touched) and from the Meta Pixel.
Every state change is made by the server; the browser can only READ its own connection summary.

## 1. New tables
- `meta_connections` — one row per user + business.
  - `status`: disconnected | connecting | authorized | page_selection_required | connected | error | reauth_required
  - `instagram_status`: connected | not_associated | unsupported | permission_unavailable | api_error (nullable)
  - `meta_user_id` (app-scoped Meta user id), `page_id`, `page_name`,
    `instagram_account_id`, `instagram_username`
  - `available_pages` (jsonb [{id,name}]) — only while the user must choose a Page
  - `granted_permissions` (text[]) — permission names Meta reports as granted
  - `user_token_ref` — reference `vault:<uuid>` to the encrypted Meta user token (never the raw token)
  - `token_expires_at`, `last_synced_at`, `last_error` (safe code only), `last_error_at`,
    `revocation_status` (revoked | failed | skipped), `attempt_started_at`, `connected_at`,
    `created_at`, `updated_at`
- `meta_oauth_states` — server-only, single-use OAuth attempts.
  - `state_hash`, `binding_hash`, `completion_hash` — SHA-256 hashes only; raw values are never stored
  - `expires_at`, `consumed_at`, `completion_expires_at`
  - `pending_pages`, `pending_meta_user_id` — held server-side until the SAME browser session that
    started the attempt confirms it (protects against linking someone else's Pages to an attacker account)

## 2. Security
1. RLS enabled on both tables.
2. `meta_connections`: ALL privileges revoked from anon/authenticated; authenticated gets SELECT on
   non-credential columns only, with an owner-only SELECT policy. No INSERT/UPDATE/DELETE grant or
   policy exists for browsers: writes are deny-by-default and happen only through the service role.
3. `meta_oauth_states`: no browser privileges and no policies at all.
4. Credentials are stored in Supabase Vault through SECURITY DEFINER functions executable only by
   `service_role`. Triggers wipe Vault secrets whenever a row leaves an active state or is deleted,
   and a CHECK constraint forbids credentials on inactive rows.

## 3. Important notes
1. No existing table, column, policy or function is modified. GBP Vault helpers are not reused.
2. Idempotent: safe to re-run.
*/

CREATE TABLE IF NOT EXISTS public.meta_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('disconnected','connecting','authorized','page_selection_required','connected','error','reauth_required')),
  instagram_status text
    CHECK (instagram_status IS NULL OR instagram_status IN ('connected','not_associated','unsupported','permission_unavailable','api_error')),
  meta_user_id text,
  page_id text,
  page_name text,
  instagram_account_id text,
  instagram_username text,
  available_pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  granted_permissions text[] NOT NULL DEFAULT '{}',
  user_token_ref text,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  last_error_at timestamptz,
  revocation_status text CHECK (revocation_status IS NULL OR revocation_status IN ('revoked','failed','skipped')),
  attempt_started_at timestamptz,
  connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_connections_user_business_key UNIQUE (user_id, business_id),
  CONSTRAINT meta_connections_credentials_only_when_active CHECK (
    status IN ('authorized','page_selection_required','connected')
    OR (user_token_ref IS NULL AND token_expires_at IS NULL))
);

CREATE INDEX IF NOT EXISTS meta_connections_business_idx ON public.meta_connections (business_id);

CREATE TABLE IF NOT EXISTS public.meta_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state_hash text NOT NULL UNIQUE,
  binding_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  completion_hash text UNIQUE,
  completion_expires_at timestamptz,
  pending_pages jsonb,
  pending_meta_user_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meta_oauth_states_connection_idx ON public.meta_oauth_states (connection_id);

ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_oauth_states ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.meta_connections FROM anon, authenticated;
REVOKE ALL ON public.meta_oauth_states FROM anon, authenticated;

GRANT SELECT (
  id, user_id, business_id, status, instagram_status, page_id, page_name,
  instagram_account_id, instagram_username, available_pages, granted_permissions,
  token_expires_at, last_synced_at, last_error, last_error_at, revocation_status,
  attempt_started_at, connected_at, created_at, updated_at
) ON public.meta_connections TO authenticated;

DROP POLICY IF EXISTS "select_own_meta_connection" ON public.meta_connections;
CREATE POLICY "select_own_meta_connection" ON public.meta_connections FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- ─── Vault helpers (Meta-only) ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.meta_vault_forget(p_ref text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_ref IS NOT NULL AND p_ref LIKE 'vault:%' THEN
    DELETE FROM vault.secrets WHERE id = substring(p_ref FROM 7)::uuid;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.meta_vault_put(p_ref text, p_value text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_ref IS NOT NULL AND p_ref LIKE 'vault:%'
     AND EXISTS (SELECT 1 FROM vault.secrets WHERE id = substring(p_ref FROM 7)::uuid) THEN
    PERFORM vault.update_secret(substring(p_ref FROM 7)::uuid, p_value);
    RETURN p_ref;
  END IF;
  RETURN 'vault:' || vault.create_secret(p_value, NULL, 'meta oauth credential')::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.meta_vault_reveal(p_ref text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_secret text;
BEGIN
  IF p_ref IS NULL OR p_ref NOT LIKE 'vault:%' THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE id = substring(p_ref FROM 7)::uuid;
  RETURN v_secret;
END;
$$;

-- ─── Lifecycle triggers ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.meta_connections_wipe_inactive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.user_token_ref IS DISTINCT FROM NEW.user_token_ref THEN
    PERFORM public.meta_vault_forget(OLD.user_token_ref);
  END IF;
  IF NEW.status NOT IN ('authorized','page_selection_required','connected') THEN
    PERFORM public.meta_vault_forget(NEW.user_token_ref);
    NEW.user_token_ref := NULL;
    NEW.token_expires_at := NULL;
    NEW.available_pages := '[]'::jsonb;
  END IF;
  IF NEW.status IN ('disconnected','connecting') THEN
    NEW.meta_user_id := NULL;
    NEW.page_id := NULL;
    NEW.page_name := NULL;
    NEW.instagram_status := NULL;
    NEW.instagram_account_id := NULL;
    NEW.instagram_username := NULL;
    NEW.granted_permissions := '{}';
    NEW.connected_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.meta_connections_forget_on_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.meta_vault_forget(OLD.user_token_ref);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS meta_connections_wipe_inactive ON public.meta_connections;
CREATE TRIGGER meta_connections_wipe_inactive
  BEFORE INSERT OR UPDATE ON public.meta_connections
  FOR EACH ROW EXECUTE FUNCTION public.meta_connections_wipe_inactive();

DROP TRIGGER IF EXISTS meta_connections_forget_on_delete ON public.meta_connections;
CREATE TRIGGER meta_connections_forget_on_delete
  AFTER DELETE ON public.meta_connections
  FOR EACH ROW EXECUTE FUNCTION public.meta_connections_forget_on_delete();

-- ─── Server-only state machine ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.meta_fail_connection(p_connection_id uuid, p_status text, p_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_status NOT IN ('disconnected','error','reauth_required') THEN
    RAISE EXCEPTION 'invalid terminal status';
  END IF;
  UPDATE public.meta_connections
  SET status = p_status,
      last_error = p_code,
      last_error_at = CASE WHEN p_code IS NULL THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = p_connection_id;
  DELETE FROM public.meta_oauth_states WHERE connection_id = p_connection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.meta_begin_attempt(
  p_user_id uuid, p_business_id uuid, p_state_hash text, p_binding_hash text, p_expires_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = p_business_id AND user_id = p_user_id) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.meta_connections (user_id, business_id, status)
  VALUES (p_user_id, p_business_id, 'disconnected')
  ON CONFLICT (user_id, business_id) DO NOTHING;
  SELECT id INTO v_id FROM public.meta_connections
  WHERE user_id = p_user_id AND business_id = p_business_id FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.meta_consume_oauth_state(p_state_hash text)
RETURNS TABLE (result text, connection_id uuid, user_id uuid, business_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_state public.meta_oauth_states%ROWTYPE;
  v_conn public.meta_connections%ROWTYPE;
BEGIN
  SELECT * INTO v_state FROM public.meta_oauth_states s WHERE s.state_hash = p_state_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown'::text, NULL::uuid, NULL::uuid, NULL::uuid; RETURN;
  END IF;
  IF v_state.consumed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'consumed'::text, NULL::uuid, NULL::uuid, NULL::uuid; RETURN;
  END IF;
  UPDATE public.meta_oauth_states SET consumed_at = now() WHERE id = v_state.id;
  SELECT * INTO v_conn FROM public.meta_connections c WHERE c.id = v_state.connection_id FOR UPDATE;
  IF NOT FOUND OR v_conn.status <> 'connecting' OR v_conn.user_id <> v_state.user_id THEN
    RETURN QUERY SELECT 'stale'::text, NULL::uuid, NULL::uuid, NULL::uuid; RETURN;
  END IF;
  IF v_state.expires_at <= now() THEN
    RETURN QUERY SELECT 'expired'::text, v_conn.id, v_conn.user_id, v_conn.business_id; RETURN;
  END IF;
  RETURN QUERY SELECT 'ok'::text, v_conn.id, v_conn.user_id, v_conn.business_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.meta_store_authorization(
  p_connection_id uuid, p_state_hash text, p_access_token text, p_expires_at timestamptz,
  p_meta_user_id text, p_permissions text[], p_pages jsonb,
  p_completion_hash text, p_completion_expires_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_conn public.meta_connections%ROWTYPE;
BEGIN
  SELECT * INTO v_conn FROM public.meta_connections WHERE id = p_connection_id FOR UPDATE;
  IF NOT FOUND OR v_conn.status <> 'connecting' OR p_access_token IS NULL OR p_access_token = '' THEN
    RETURN false;
  END IF;
  UPDATE public.meta_oauth_states
  SET pending_pages = COALESCE(p_pages, '[]'::jsonb),
      pending_meta_user_id = p_meta_user_id,
      completion_hash = p_completion_hash,
      completion_expires_at = p_completion_expires_at
  WHERE connection_id = p_connection_id AND state_hash = p_state_hash AND consumed_at IS NOT NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  UPDATE public.meta_connections
  SET status = 'authorized',
      user_token_ref = public.meta_vault_put(NULL, p_access_token),
      token_expires_at = p_expires_at,
      granted_permissions = COALESCE(p_permissions, '{}'),
      updated_at = now()
  WHERE id = p_connection_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.meta_complete_authorization(
  p_user_id uuid, p_completion_hash text, p_binding_hash text)
RETURNS TABLE (result text, page_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_state public.meta_oauth_states%ROWTYPE;
  v_pages jsonb;
BEGIN
  SELECT * INTO v_state FROM public.meta_oauth_states s
  WHERE s.completion_hash = p_completion_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown'::text, 0; RETURN;
  END IF;
  IF v_state.user_id <> p_user_id THEN
    PERFORM public.meta_fail_connection(v_state.connection_id, 'error', 'SESSION_MISMATCH');
    RETURN QUERY SELECT 'wrong_user'::text, 0; RETURN;
  END IF;
  IF v_state.binding_hash <> p_binding_hash THEN
    PERFORM public.meta_fail_connection(v_state.connection_id, 'error', 'SESSION_MISMATCH');
    RETURN QUERY SELECT 'binding_mismatch'::text, 0; RETURN;
  END IF;
  IF v_state.completion_expires_at IS NULL OR v_state.completion_expires_at <= now() THEN
    PERFORM public.meta_fail_connection(v_state.connection_id, 'error', 'OAUTH_STATE_EXPIRED');
    RETURN QUERY SELECT 'expired'::text, 0; RETURN;
  END IF;
  v_pages := COALESCE(v_state.pending_pages, '[]'::jsonb);
  UPDATE public.meta_connections
  SET status = 'page_selection_required',
      available_pages = v_pages,
      meta_user_id = v_state.pending_meta_user_id,
      updated_at = now()
  WHERE id = v_state.connection_id AND status = 'authorized';
  IF NOT FOUND THEN
    DELETE FROM public.meta_oauth_states WHERE id = v_state.id;
    RETURN QUERY SELECT 'stale'::text, 0; RETURN;
  END IF;
  DELETE FROM public.meta_oauth_states WHERE id = v_state.id;
  RETURN QUERY SELECT 'ok'::text, jsonb_array_length(v_pages);
END;
$$;

CREATE OR REPLACE FUNCTION public.meta_read_token(p_connection_id uuid)
RETURNS TABLE (access_token text, token_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN QUERY
  SELECT public.meta_vault_reveal(c.user_token_ref), c.token_expires_at
  FROM public.meta_connections c
  WHERE c.id = p_connection_id
    AND c.status IN ('authorized','page_selection_required','connected');
END;
$$;

CREATE OR REPLACE FUNCTION public.meta_finish_page_selection(
  p_connection_id uuid, p_page_id text, p_page_name text,
  p_instagram_status text, p_instagram_id text, p_instagram_username text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.meta_connections
  SET status = 'connected',
      page_id = p_page_id,
      page_name = p_page_name,
      instagram_status = p_instagram_status,
      instagram_account_id = p_instagram_id,
      instagram_username = p_instagram_username,
      available_pages = '[]'::jsonb,
      last_error = NULL,
      last_error_at = NULL,
      connected_at = now(),
      last_synced_at = now(),
      updated_at = now()
  WHERE id = p_connection_id
    AND status = 'page_selection_required'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(available_pages) p WHERE p->>'id' = p_page_id);
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.meta_disconnect(p_connection_id uuid, p_revocation_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.meta_fail_connection(p_connection_id, 'disconnected', NULL);
  UPDATE public.meta_connections SET revocation_status = p_revocation_status WHERE id = p_connection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.meta_credential_invariant_violations()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::integer FROM public.meta_connections
  WHERE status NOT IN ('authorized','page_selection_required','connected')
    AND (user_token_ref IS NOT NULL OR token_expires_at IS NOT NULL);
$$;

REVOKE ALL ON FUNCTION public.meta_vault_forget(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_vault_put(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_vault_reveal(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_connections_wipe_inactive() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_connections_forget_on_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_fail_connection(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_begin_attempt(uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_consume_oauth_state(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_store_authorization(uuid, text, text, timestamptz, text, text[], jsonb, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_complete_authorization(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_read_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_finish_page_selection(uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_disconnect(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_credential_invariant_violations() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.meta_fail_connection(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_begin_attempt(uuid, uuid, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_consume_oauth_state(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_store_authorization(uuid, text, text, timestamptz, text, text[], jsonb, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_complete_authorization(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_read_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_finish_page_selection(uuid, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_disconnect(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_credential_invariant_violations() TO service_role;
