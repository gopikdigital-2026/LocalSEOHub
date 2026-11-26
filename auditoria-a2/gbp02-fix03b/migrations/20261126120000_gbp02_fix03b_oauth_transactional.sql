/*
  GBP-02-FIX03B · Transactional OAuth callback and compare-and-swap credential refresh.

  PREPARED ONLY. Not applied to production. Kept outside supabase/migrations on purpose.

  1. gbp_oauth_started_at(jsonb): exception-free parse of metadata.oauth_started_at (strict UTC ISO-8601).
  2. gbp_consume_oauth_state(text): single-use consumption of the OAuth state (15 min window, +30 s skew);
     removes the previous credentials, stores only a SHA-256 of the state and issues a server-side attempt_id.
  3. gbp_complete_oauth_attempt(...): stores fresh Vault secrets and advances to select_location in one transaction,
     only for the exact source/user/business/attempt/state-hash while phase = exchanging.
  4. gbp_fail_oauth_attempt(...): terminal failure for the same identity predicate; leaves no credentials.
  5. gbp_refresh_credentials(...): refresh write that only succeeds if the stored pair equals the pair the caller read.
  6. gbp_store_credentials: same signature and ACL, now refuses writes while an attempt is authorizing/exchanging.

  Security: SECURITY DEFINER (owner postgres), SET search_path = '', fully qualified references,
  EXECUTE only for service_role. All inputs are validated before the first write.
*/

CREATE OR REPLACE FUNCTION public.gbp_oauth_started_at(p_meta jsonb)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN pg_catalog.jsonb_typeof(p_meta -> 'oauth_started_at') = 'string'
     AND (p_meta ->> 'oauth_started_at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$'
     AND pg_catalog.pg_input_is_valid(p_meta ->> 'oauth_started_at', 'timestamptz')
    THEN (p_meta ->> 'oauth_started_at')::timestamptz
  END
$$;

CREATE OR REPLACE FUNCTION public.gbp_consume_oauth_state(p_state text)
RETURNS TABLE(r_result text, r_source_id uuid, r_user_id uuid, r_business_id text, r_attempt_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.connected_sources%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_iso text := pg_catalog.to_char(pg_catalog.clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_started timestamptz;
  v_hash text;
  v_attempt uuid;
BEGIN
  IF p_state IS NULL OR p_state !~ '^[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid;
    RETURN;
  END IF;
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_state, 'UTF8')), 'hex');

  SELECT * INTO v_row FROM public.connected_sources cs
  WHERE cs.source_type = 'google_business'
    AND cs.status = 'connecting'
    AND cs.metadata ->> 'oauth_state' = p_state
  FOR UPDATE;

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.connected_sources cs
      WHERE cs.source_type = 'google_business' AND cs.metadata ->> 'oauth_state_hash' = v_hash
    ) THEN
      RETURN QUERY SELECT 'ALREADY_USED'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid;
    ELSE
      RETURN QUERY SELECT 'NOT_FOUND'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid;
    END IF;
    RETURN;
  END IF;

  v_started := public.gbp_oauth_started_at(v_row.metadata);
  IF v_started IS NULL
     OR v_started > v_now + interval '30 seconds'
     OR v_now - v_started > interval '15 minutes' THEN
    -- The disconnect trigger removes any Vault secret still referenced by the row.
    UPDATE public.connected_sources
    SET status = 'disconnected',
        last_error = 'ATTEMPT_EXPIRED',
        metadata = (v_row.metadata - 'oauth_state')
          || pg_catalog.jsonb_build_object('phase', 'failed', 'oauth_state_hash', v_hash, 'failed_at', v_iso),
        updated_at = v_now
    WHERE id = v_row.id;
    RETURN QUERY SELECT 'EXPIRED'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid;
    RETURN;
  END IF;

  v_attempt := pg_catalog.gen_random_uuid();
  PERFORM public.gbp_vault_forget(v_row.access_token_encrypted);
  PERFORM public.gbp_vault_forget(v_row.refresh_token_encrypted);
  UPDATE public.connected_sources
  SET access_token_encrypted = NULL,
      refresh_token_encrypted = NULL,
      token_expires_at = NULL,
      last_error = NULL,
      metadata = (v_row.metadata - 'oauth_state')
        || pg_catalog.jsonb_build_object('phase', 'exchanging', 'oauth_state_hash', v_hash,
                                         'attempt_id', v_attempt::text, 'consumed_at', v_iso),
      updated_at = v_now
  WHERE id = v_row.id;

  RETURN QUERY SELECT 'CONSUMED'::text, v_row.id, v_row.user_id, v_row.business_id, v_attempt;
END;
$$;

CREATE OR REPLACE FUNCTION public.gbp_complete_oauth_attempt(
  p_source_id uuid, p_user_id uuid, p_business_id text, p_attempt_id uuid, p_state text,
  p_access_token text, p_refresh_token text, p_expires_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.connected_sources%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_iso text := pg_catalog.to_char(pg_catalog.clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_started timestamptz;
  v_access text;
  v_refresh text;
BEGIN
  IF p_source_id IS NULL OR p_user_id IS NULL OR p_business_id IS NULL OR p_attempt_id IS NULL
     OR p_state IS NULL OR p_state !~ '^[0-9a-f]{64}$'
     OR p_access_token IS NULL OR pg_catalog.length(p_access_token) NOT BETWEEN 1 AND 4096
     OR p_refresh_token IS NULL OR pg_catalog.length(p_refresh_token) NOT BETWEEN 1 AND 4096
     OR p_expires_at IS NULL OR p_expires_at <= v_now OR p_expires_at > v_now + interval '24 hours' THEN
    RETURN 'INVALID_INPUT';
  END IF;

  SELECT * INTO v_row FROM public.connected_sources cs
  WHERE cs.id = p_source_id
    AND cs.source_type = 'google_business'
    AND cs.user_id = p_user_id
    AND cs.business_id = p_business_id
    AND cs.status = 'connecting'
    AND cs.metadata ->> 'phase' = 'exchanging'
    AND cs.metadata ->> 'attempt_id' = p_attempt_id::text
    AND cs.metadata ->> 'oauth_state_hash' = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_state, 'UTF8')), 'hex')
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'SUPERSEDED';
  END IF;

  v_started := public.gbp_oauth_started_at(v_row.metadata);
  IF v_started IS NULL
     OR v_started > v_now + interval '30 seconds'
     OR v_now - v_started > interval '15 minutes' THEN
    UPDATE public.connected_sources
    SET status = 'disconnected',
        last_error = 'ATTEMPT_EXPIRED',
        metadata = v_row.metadata || pg_catalog.jsonb_build_object('phase', 'failed', 'failed_at', v_iso),
        updated_at = v_now
    WHERE id = p_source_id;
    RETURN 'EXPIRED';
  END IF;

  PERFORM public.gbp_vault_forget(v_row.access_token_encrypted);
  PERFORM public.gbp_vault_forget(v_row.refresh_token_encrypted);
  v_access := public.gbp_vault_put(NULL, p_access_token);
  v_refresh := public.gbp_vault_put(NULL, p_refresh_token);

  UPDATE public.connected_sources
  SET access_token_encrypted = v_access,
      refresh_token_encrypted = v_refresh,
      token_expires_at = p_expires_at,
      last_error = NULL,
      metadata = v_row.metadata || pg_catalog.jsonb_build_object('phase', 'select_location', 'authorized_at', v_iso),
      updated_at = v_now
  WHERE id = p_source_id;
  RETURN 'COMPLETED';
END;
$$;

CREATE OR REPLACE FUNCTION public.gbp_fail_oauth_attempt(
  p_source_id uuid, p_user_id uuid, p_business_id text, p_attempt_id uuid, p_state text,
  p_status text, p_code text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.connected_sources%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_iso text := pg_catalog.to_char(pg_catalog.clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  IF p_source_id IS NULL OR p_user_id IS NULL OR p_business_id IS NULL OR p_attempt_id IS NULL
     OR p_state IS NULL OR p_state !~ '^[0-9a-f]{64}$'
     OR p_status IS NULL OR p_status NOT IN ('error', 'permissions_required', 'disconnected')
     OR p_code IS NULL OR p_code !~ '^[A-Z][A-Z_]{0,63}$' THEN
    RETURN 'INVALID_INPUT';
  END IF;

  SELECT * INTO v_row FROM public.connected_sources cs
  WHERE cs.id = p_source_id
    AND cs.source_type = 'google_business'
    AND cs.user_id = p_user_id
    AND cs.business_id = p_business_id
    AND cs.status = 'connecting'
    AND cs.metadata ->> 'phase' = 'exchanging'
    AND cs.metadata ->> 'attempt_id' = p_attempt_id::text
    AND cs.metadata ->> 'oauth_state_hash' = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_state, 'UTF8')), 'hex')
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'SUPERSEDED';
  END IF;

  PERFORM public.gbp_vault_forget(v_row.access_token_encrypted);
  PERFORM public.gbp_vault_forget(v_row.refresh_token_encrypted);
  UPDATE public.connected_sources
  SET status = p_status,
      last_error = p_code,
      access_token_encrypted = NULL,
      refresh_token_encrypted = NULL,
      token_expires_at = NULL,
      metadata = v_row.metadata || pg_catalog.jsonb_build_object('phase', 'failed', 'failed_at', v_iso),
      updated_at = v_now
  WHERE id = p_source_id;
  RETURN 'FAILED';
END;
$$;

CREATE OR REPLACE FUNCTION public.gbp_refresh_credentials(
  p_source_id uuid, p_expected_access text, p_expected_refresh text,
  p_access_token text, p_refresh_token text, p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.connected_sources%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_access text;
  v_refresh text;
BEGIN
  IF p_source_id IS NULL
     OR p_expected_refresh IS NULL OR pg_catalog.length(p_expected_refresh) NOT BETWEEN 1 AND 4096
     OR p_access_token IS NULL OR pg_catalog.length(p_access_token) NOT BETWEEN 1 AND 4096
     OR (p_refresh_token IS NOT NULL AND pg_catalog.length(p_refresh_token) NOT BETWEEN 1 AND 4096)
     OR p_expires_at IS NULL OR p_expires_at <= v_now OR p_expires_at > v_now + interval '24 hours' THEN
    RETURN false;
  END IF;

  SELECT * INTO v_row FROM public.connected_sources cs
  WHERE cs.id = p_source_id AND cs.source_type = 'google_business'
  FOR UPDATE;
  IF NOT FOUND
     OR v_row.status = 'disconnected'
     OR (v_row.status = 'connecting' AND v_row.metadata ->> 'phase' IS DISTINCT FROM 'select_location')
     OR v_row.refresh_token_encrypted IS NULL THEN
    RETURN false;
  END IF;

  -- Compare-and-swap: only the holder of the exact stored pair may replace it.
  IF public.gbp_vault_reveal(v_row.access_token_encrypted) IS DISTINCT FROM p_expected_access
     OR public.gbp_vault_reveal(v_row.refresh_token_encrypted) IS DISTINCT FROM p_expected_refresh THEN
    RETURN false;
  END IF;

  v_access := public.gbp_vault_put(NULL, p_access_token);
  IF p_refresh_token IS NOT NULL THEN
    v_refresh := public.gbp_vault_put(NULL, p_refresh_token);
  ELSE
    v_refresh := v_row.refresh_token_encrypted;
  END IF;

  UPDATE public.connected_sources
  SET access_token_encrypted = v_access,
      refresh_token_encrypted = v_refresh,
      token_expires_at = p_expires_at,
      updated_at = v_now
  WHERE id = p_source_id;

  PERFORM public.gbp_vault_forget(v_row.access_token_encrypted);
  IF p_refresh_token IS NOT NULL THEN
    PERFORM public.gbp_vault_forget(v_row.refresh_token_encrypted);
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.gbp_store_credentials(
  p_source_id uuid, p_access_token text, p_refresh_token text, p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.connected_sources%ROWTYPE;
  v_access text;
  v_refresh text;
BEGIN
  SELECT * INTO v_row FROM public.connected_sources
  WHERE id = p_source_id AND source_type = 'google_business'
  FOR UPDATE;
  IF NOT FOUND OR v_row.status = 'disconnected' OR p_access_token IS NULL THEN
    RETURN false;
  END IF;
  -- FIX03B: no blind write while an OAuth attempt is authorizing or exchanging.
  IF v_row.status = 'connecting' AND v_row.metadata ->> 'phase' IS DISTINCT FROM 'select_location' THEN
    RETURN false;
  END IF;

  v_access := public.gbp_vault_put(v_row.access_token_encrypted, p_access_token);
  IF p_refresh_token IS NOT NULL THEN
    v_refresh := public.gbp_vault_put(v_row.refresh_token_encrypted, p_refresh_token);
  ELSIF v_row.refresh_token_encrypted IS NOT NULL AND v_row.refresh_token_encrypted NOT LIKE 'vault:%' THEN
    v_refresh := public.gbp_vault_put(NULL, v_row.refresh_token_encrypted);
  ELSE
    v_refresh := v_row.refresh_token_encrypted;
  END IF;

  UPDATE public.connected_sources
  SET access_token_encrypted = v_access,
      refresh_token_encrypted = v_refresh,
      token_expires_at = p_expires_at,
      updated_at = now()
  WHERE id = p_source_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.gbp_oauth_started_at(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gbp_consume_oauth_state(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gbp_complete_oauth_attempt(uuid, uuid, text, uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gbp_fail_oauth_attempt(uuid, uuid, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gbp_refresh_credentials(uuid, text, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gbp_store_credentials(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.gbp_oauth_started_at(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.gbp_consume_oauth_state(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gbp_complete_oauth_attempt(uuid, uuid, text, uuid, text, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.gbp_fail_oauth_attempt(uuid, uuid, text, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gbp_refresh_credentials(uuid, text, text, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.gbp_store_credentials(uuid, text, text, timestamptz) TO service_role;
