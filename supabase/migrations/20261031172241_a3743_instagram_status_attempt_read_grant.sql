/*
# A3.7.4.3 Gate B.3 FIX02 — Instagram status: attempt read grant for service_role

1. Purpose
- The instagram-publishing edge function (service_role client) reads the latest Instagram
  attempt for a publication in its status/context lookup. A3.7.4.1 revoked every privilege on
  public.publication_publish_attempts from service_role, so that read failed with 42501 and the
  status check returned INTERNAL_ERROR.

2. Change
- Column-scoped, read-only privilege for service_role on exactly the nine columns the lookup
  selects, filters and orders on: id, status, external_stage, meta_container_id, started_at,
  publication_id, user_id, channel, attempt_number.

3. Security
- SELECT only. No INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER.
- anon and authenticated privileges unchanged.
- RLS policies, SECURITY DEFINER functions and the publish_attempts_guard trigger unchanged.
- Writes remain exclusively via the existing SECURITY DEFINER attempt RPCs.

4. Notes
- Idempotent: re-granting an existing column privilege is a no-op.
- No tables, columns, policies or functions are created, altered or dropped.
*/

GRANT SELECT (
  id,
  status,
  external_stage,
  meta_container_id,
  started_at,
  publication_id,
  user_id,
  channel,
  attempt_number
)
ON public.publication_publish_attempts
TO service_role;
