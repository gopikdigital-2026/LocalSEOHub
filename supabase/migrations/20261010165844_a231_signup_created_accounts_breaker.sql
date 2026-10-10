/*
# A2.3.1 - Signup breaker based on created accounts

1. Summary
   The global signup limit no longer counts attempts. It counts only accounts that the
   `signup-instant` edge function actually created in the window, identified by the
   server-set `app_metadata.signup_source = 'signup-instant'` (users cannot edit app_metadata).
   Failed, invalid, duplicate or rate-limited requests never consume the global allowance,
   so a flood of junk requests cannot lock out legitimate signups.

2. New functions
   - `signup_created_recently(p_window_seconds int)` returns the number of accounts created by
     signup-instant in the window. SECURITY DEFINER, callable only by service_role.

3. Security
   - EXECUTE revoked from PUBLIC, anon and authenticated.

4. Notes
   1. Read-only: no tables, rows or auth settings are changed.
   2. Concurrent requests can overshoot the limit by at most the number of in-flight requests;
      this is a breaker, not a hard quota.
*/

CREATE OR REPLACE FUNCTION public.signup_created_recently(p_window_seconds int)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::int
  FROM auth.users
  WHERE created_at > now() - make_interval(secs => GREATEST(p_window_seconds, 1))
    AND raw_app_meta_data ->> 'signup_source' = 'signup-instant';
$$;

REVOKE ALL ON FUNCTION public.signup_created_recently(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signup_created_recently(int) TO service_role;