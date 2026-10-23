/*
# A3.4.2.2 — Google Business Profile connection state is server-owned

## Plain-English summary
The Google Business Profile (GBP) connection card could stay stuck on "Conectando…" because the
browser tried to write connection status itself. From now on only the server (edge functions using
the service role) may create or change the Google Business Profile row and the dependent Reviews row.
The browser can still READ its own rows (unchanged) and can still manage the Website and Manual
sources exactly as before.

## Modified tables
- `connected_sources`: new BEFORE INSERT/UPDATE trigger `connected_sources_server_owned_gbp`.
  When the caller is the `anon` or `authenticated` database role and the row is (or was) a
  `google_business` or `reviews` row, the write is rejected with SQLSTATE 42501.

## Security changes
1. No grants are added or widened. No RLS policy is relaxed.
2. Service-role edge functions and SECURITY DEFINER functions are unaffected (their role is not
   anon/authenticated), so OAuth start, callback, sync, recovery and disconnect keep working.
3. Credential columns, Vault storage and the A3.4.1 hardening are untouched.

## Notes
1. Deleting rows is not affected (the existing delete-cleanup trigger still forgets Vault secrets).
2. The migration is idempotent.
*/

CREATE OR REPLACE FUNCTION public.connected_sources_server_owned_gbp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND (
    NEW.source_type IN ('google_business', 'reviews')
    OR (TG_OP = 'UPDATE' AND OLD.source_type IN ('google_business', 'reviews'))
  ) THEN
    RAISE EXCEPTION 'google_business connection state is server-owned'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.connected_sources_server_owned_gbp() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS connected_sources_server_owned_gbp ON public.connected_sources;
CREATE TRIGGER connected_sources_server_owned_gbp
  BEFORE INSERT OR UPDATE ON public.connected_sources
  FOR EACH ROW EXECUTE FUNCTION public.connected_sources_server_owned_gbp();
