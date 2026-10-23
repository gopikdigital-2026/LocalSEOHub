/*
# A3.4.1 — Google Business Profile credential hardening

## Plain-English summary
Locks down the stored Google sign-in credentials for Google Business Profile.
Browsers (signed in or not) can no longer reach them, they are encrypted at rest
with Supabase Vault, and a disconnected connection can never keep usable credentials.

## 1. Privilege changes
- `connected_sources`: ALL privileges revoked from `anon` (no anonymous access at all).
- `source_sync_events`: ALL privileges revoked from `anon`; `authenticated` keeps only
  SELECT / INSERT / DELETE (UPDATE, TRUNCATE, TRIGGER, REFERENCES revoked).
- Existing owner-only RLS policies and column grants for `authenticated` are unchanged:
  the token columns were never granted to `authenticated`.

## 2. Encrypted credential storage (Supabase Vault)
- `access_token_encrypted` / `refresh_token_encrypted` now hold a reference `vault:<uuid>`
  to a Vault secret instead of the raw token. Vault encrypts with a Supabase-managed key.
- New SECURITY DEFINER functions, executable ONLY by `service_role` (Edge Functions):
  - `gbp_store_credentials(source_id, access_token, refresh_token, expires_at)` —
    stores/rotates tokens; a NULL refresh token keeps the existing one.
  - `gbp_read_credentials(source_id)` — returns decrypted tokens to the server only.
  - `gbp_clear_credentials(source_id)` — deletes the Vault secrets and nulls the columns.
  - `gbp_credential_invariant_violations()` — counts disconnected rows still holding credentials.
- Legacy plain-text values are still readable and are migrated into Vault below.

## 3. Lifecycle triggers
- BEFORE INSERT/UPDATE: whenever `status = 'disconnected'`, tokens, expiry,
  `metadata.oauth_state`, `external_account_id` and `external_location_id` are cleared
  and the Vault secrets deleted. This covers the browser "reset" and stale-connection paths.
- AFTER DELETE: Vault secrets of a deleted row are removed (no orphaned secrets).

## 4. Data cleanup and invariant
- Disconnected rows holding credentials are cleared.
- Remaining plain-text tokens on active rows are moved into Vault.
- CHECK constraint `connected_sources_disconnected_no_credentials` enforces the invariant.

## Important notes
1. No columns or rows are dropped; only credential values on disconnected rows are cleared.
2. Idempotent: safe to re-run.
*/

REVOKE ALL ON public.connected_sources FROM anon;
REVOKE ALL ON public.source_sync_events FROM anon;
REVOKE UPDATE, TRUNCATE, TRIGGER, REFERENCES ON public.source_sync_events FROM authenticated;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.connected_sources FROM authenticated;

CREATE OR REPLACE FUNCTION public.gbp_vault_forget(p_ref text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_ref IS NOT NULL AND p_ref LIKE 'vault:%' THEN
    DELETE FROM vault.secrets WHERE id = substring(p_ref FROM 7)::uuid;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.gbp_vault_reveal(p_ref text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret text;
BEGIN
  IF p_ref IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_ref NOT LIKE 'vault:%' THEN
    RETURN p_ref;
  END IF;
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE id = substring(p_ref FROM 7)::uuid;
  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.gbp_vault_put(p_ref text, p_value text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_ref IS NOT NULL AND p_ref LIKE 'vault:%'
     AND EXISTS (SELECT 1 FROM vault.secrets WHERE id = substring(p_ref FROM 7)::uuid) THEN
    PERFORM vault.update_secret(substring(p_ref FROM 7)::uuid, p_value);
    RETURN p_ref;
  END IF;
  RETURN 'vault:' || vault.create_secret(p_value, NULL, 'gbp oauth credential')::text;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.gbp_read_credentials(p_source_id uuid)
RETURNS TABLE (access_token text, refresh_token text, token_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT public.gbp_vault_reveal(cs.access_token_encrypted),
         public.gbp_vault_reveal(cs.refresh_token_encrypted),
         cs.token_expires_at
  FROM public.connected_sources cs
  WHERE cs.id = p_source_id
    AND cs.source_type = 'google_business'
    AND cs.status <> 'disconnected';
END;
$$;

CREATE OR REPLACE FUNCTION public.gbp_clear_credentials(p_source_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.connected_sources%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.connected_sources WHERE id = p_source_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  PERFORM public.gbp_vault_forget(v_row.access_token_encrypted);
  PERFORM public.gbp_vault_forget(v_row.refresh_token_encrypted);
  UPDATE public.connected_sources
  SET access_token_encrypted = NULL,
      refresh_token_encrypted = NULL,
      token_expires_at = NULL,
      metadata = COALESCE(metadata, '{}'::jsonb) - 'oauth_state',
      updated_at = now()
  WHERE id = p_source_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.gbp_credential_invariant_violations()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer FROM public.connected_sources
  WHERE status = 'disconnected'
    AND (access_token_encrypted IS NOT NULL
         OR refresh_token_encrypted IS NOT NULL
         OR token_expires_at IS NOT NULL
         OR metadata ? 'oauth_state');
$$;

CREATE OR REPLACE FUNCTION public.connected_sources_clear_on_disconnect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'disconnected' THEN
    PERFORM public.gbp_vault_forget(NEW.access_token_encrypted);
    PERFORM public.gbp_vault_forget(NEW.refresh_token_encrypted);
    IF TG_OP = 'UPDATE' THEN
      IF OLD.access_token_encrypted IS DISTINCT FROM NEW.access_token_encrypted THEN
        PERFORM public.gbp_vault_forget(OLD.access_token_encrypted);
      END IF;
      IF OLD.refresh_token_encrypted IS DISTINCT FROM NEW.refresh_token_encrypted THEN
        PERFORM public.gbp_vault_forget(OLD.refresh_token_encrypted);
      END IF;
    END IF;
    NEW.access_token_encrypted := NULL;
    NEW.refresh_token_encrypted := NULL;
    NEW.token_expires_at := NULL;
    NEW.external_account_id := NULL;
    NEW.external_location_id := NULL;
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb) - 'oauth_state';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.connected_sources_forget_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.gbp_vault_forget(OLD.access_token_encrypted);
  PERFORM public.gbp_vault_forget(OLD.refresh_token_encrypted);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS connected_sources_clear_on_disconnect ON public.connected_sources;
CREATE TRIGGER connected_sources_clear_on_disconnect
  BEFORE INSERT OR UPDATE ON public.connected_sources
  FOR EACH ROW EXECUTE FUNCTION public.connected_sources_clear_on_disconnect();

DROP TRIGGER IF EXISTS connected_sources_forget_on_delete ON public.connected_sources;
CREATE TRIGGER connected_sources_forget_on_delete
  AFTER DELETE ON public.connected_sources
  FOR EACH ROW EXECUTE FUNCTION public.connected_sources_forget_on_delete();

REVOKE ALL ON FUNCTION public.gbp_vault_forget(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gbp_vault_reveal(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gbp_vault_put(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gbp_store_credentials(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gbp_read_credentials(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gbp_clear_credentials(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gbp_credential_invariant_violations() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.connected_sources_clear_on_disconnect() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.connected_sources_forget_on_delete() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.gbp_store_credentials(uuid, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.gbp_read_credentials(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gbp_clear_credentials(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gbp_credential_invariant_violations() TO service_role;

UPDATE public.connected_sources
SET status = status
WHERE status = 'disconnected'
  AND (access_token_encrypted IS NOT NULL
       OR refresh_token_encrypted IS NOT NULL
       OR token_expires_at IS NOT NULL
       OR metadata ? 'oauth_state');

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id, access_token_encrypted, refresh_token_encrypted
    FROM public.connected_sources
    WHERE status <> 'disconnected'
      AND ((access_token_encrypted IS NOT NULL AND access_token_encrypted NOT LIKE 'vault:%')
        OR (refresh_token_encrypted IS NOT NULL AND refresh_token_encrypted NOT LIKE 'vault:%'))
  LOOP
    UPDATE public.connected_sources
    SET access_token_encrypted = CASE
          WHEN r.access_token_encrypted IS NULL OR r.access_token_encrypted LIKE 'vault:%' THEN r.access_token_encrypted
          ELSE public.gbp_vault_put(NULL, r.access_token_encrypted) END,
        refresh_token_encrypted = CASE
          WHEN r.refresh_token_encrypted IS NULL OR r.refresh_token_encrypted LIKE 'vault:%' THEN r.refresh_token_encrypted
          ELSE public.gbp_vault_put(NULL, r.refresh_token_encrypted) END
    WHERE id = r.id;
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'connected_sources_disconnected_no_credentials'
      AND conrelid = 'public.connected_sources'::regclass
  ) THEN
    ALTER TABLE public.connected_sources
      ADD CONSTRAINT connected_sources_disconnected_no_credentials
      CHECK (status <> 'disconnected' OR (
        access_token_encrypted IS NULL
        AND refresh_token_encrypted IS NULL
        AND token_expires_at IS NULL));
  END IF;
END $$;
