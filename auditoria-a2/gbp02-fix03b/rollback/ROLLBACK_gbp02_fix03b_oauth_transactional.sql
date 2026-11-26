/*
  Rollback of GBP-02-FIX03B migration 1. Run only after the safe-close callback has replaced the FIX03B callback
  and the pre-FIX03B gbpToken consumers are back (they call gbp_store_credentials).
  Drops the new functions and restores gbp_store_credentials byte-for-byte from 20261019194350_a341.
  Rows left in phase 'exchanging' are closed by gbp-recover-attempt after its authorizing timeout.
*/

DROP FUNCTION IF EXISTS public.gbp_refresh_credentials(uuid, text, text, text, text, timestamptz);
DROP FUNCTION IF EXISTS public.gbp_fail_oauth_attempt(uuid, uuid, text, uuid, text, text, text);
DROP FUNCTION IF EXISTS public.gbp_complete_oauth_attempt(uuid, uuid, text, uuid, text, text, text, timestamptz);
DROP FUNCTION IF EXISTS public.gbp_consume_oauth_state(text);
DROP FUNCTION IF EXISTS public.gbp_oauth_started_at(jsonb);

CREATE OR REPLACE FUNCTION public.gbp_store_credentials(
  p_source_id uuid,
  p_access_token text,
  p_refresh_token text,
  p_expires_at timestamptz
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

REVOKE ALL ON FUNCTION public.gbp_store_credentials(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gbp_store_credentials(uuid, text, text, timestamptz) TO service_role;
