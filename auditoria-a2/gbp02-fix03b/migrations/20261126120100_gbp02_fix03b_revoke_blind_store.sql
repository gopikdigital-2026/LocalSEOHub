/*
  GBP-02-FIX03B · Migration 2 (PREPARED ONLY, NOT EXECUTED ANYWHERE).

  Removes the last blind credential write path once no pre-FIX03B consumer is deployed.
  The function is kept (not dropped) so rollback is a single GRANT.
*/

REVOKE EXECUTE ON FUNCTION public.gbp_store_credentials(uuid, text, text, timestamptz) FROM service_role;
