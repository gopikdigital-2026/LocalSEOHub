-- trial_fingerprints is only accessed by edge functions via service_role key,
-- which bypasses RLS entirely. These explicit deny policies satisfy the security
-- audit and make the intent clear: no direct client access is permitted.

CREATE POLICY "deny_select_trial_fingerprints"
  ON trial_fingerprints FOR SELECT
  TO authenticated, anon
  USING (false);

CREATE POLICY "deny_insert_trial_fingerprints"
  ON trial_fingerprints FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY "deny_update_trial_fingerprints"
  ON trial_fingerprints FOR UPDATE
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "deny_delete_trial_fingerprints"
  ON trial_fingerprints FOR DELETE
  TO authenticated, anon
  USING (false);
