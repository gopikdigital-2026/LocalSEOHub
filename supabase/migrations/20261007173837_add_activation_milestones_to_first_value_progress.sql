/*
# Add activation milestones to first_value_progress

1. Modified Tables
- `first_value_progress`
  - `milestones` (jsonb, not null, default '{}') — map of activation milestone name to the
    ISO timestamp when it was first reached. Known keys: business_created,
    minimum_profile_completed, onboarding_completed, first_recommendations_generated,
    first_action_started, first_action_completed, first_value_reached.

2. Data backfill (non-destructive)
- Rows already marked completed under the previous onboarding flow had to complete a
  first action before finishing, so they receive onboarding_completed,
  first_action_started, first_action_completed and first_value_reached stamped with their
  existing completed_at. Only rows whose milestones are still empty are touched.

3. Security
- No policy changes. Existing owner-only RLS policies on first_value_progress
  (auth.uid() = user_id for select/insert/update/delete) continue to apply.

4. Notes
1. No columns are dropped or retyped; existing progress is preserved.
2. Safe to re-run (IF NOT EXISTS + backfill only when milestones = '{}').
*/

ALTER TABLE first_value_progress
  ADD COLUMN IF NOT EXISTS milestones jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE first_value_progress
SET milestones = jsonb_build_object(
  'onboarding_completed', to_jsonb(completed_at),
  'first_action_started', to_jsonb(completed_at),
  'first_action_completed', to_jsonb(completed_at),
  'first_value_reached', to_jsonb(completed_at),
  'legacy_flow', to_jsonb(true)
)
WHERE completed = true
  AND completed_at IS NOT NULL
  AND milestones = '{}'::jsonb;
