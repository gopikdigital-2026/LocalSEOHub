/*
# Revoke public EXECUTE on internal functions

1. Changes
- `get_funnel_stats()` and `get_funnel_stats(timestamptz, timestamptz)`: admin analytics,
  only called by the admin-stats edge function using the service role. Previously callable
  by anon and authenticated, exposing funnel metrics to anyone.
- `handle_new_user()`: trigger function, never meant to be called over the API.

2. Security
- EXECUTE revoked from PUBLIC, anon and authenticated; service_role keeps access.
- Triggers keep working (trigger execution does not check EXECUTE of the caller).

3. Notes
1. Idempotent: REVOKE/GRANT can be re-run safely.
2. No tables or data are changed.
*/

REVOKE EXECUTE ON FUNCTION public.get_funnel_stats() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_funnel_stats(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_funnel_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_funnel_stats(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
