-- Rollback of migration 2: restores EXECUTE on the legacy store for service_role.
GRANT EXECUTE ON FUNCTION public.gbp_store_credentials(uuid, text, text, timestamptz) TO service_role;
