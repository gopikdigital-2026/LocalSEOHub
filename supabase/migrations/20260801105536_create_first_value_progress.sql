/*
# Create first_value_progress table

Stores each user's onboarding progress for the First Value Experience, isolated by user and business.

1. New Tables
  - `first_value_progress`
    - `id` (uuid, primary key)
    - `user_id` (uuid, not null, references auth.users, defaults to auth.uid())
    - `business_id` (text, not null) — identifier for the business context
    - `current_step` (text, not null) — which step the user is on
    - `completed` (boolean, default false)
    - `selected_goal_id` (text) — chosen primary goal
    - `selected_source_type` (text) — chosen source type
    - `business_data` (jsonb) — business setup data (name, category, city, website)
    - `manual_context` (jsonb) — manual business context answers
    - `recommendation_payload` (jsonb) — full persisted recommendation
    - `execution_payload` (jsonb) — execution state and history
    - `started_at` (timestamptz)
    - `completed_at` (timestamptz)
    - `updated_at` (timestamptz)

2. Security
  - Enable RLS on `first_value_progress`.
  - Owner-scoped CRUD: each authenticated user can only access their own rows.

3. Indexes
  - Unique constraint on (user_id, business_id) — one progress per user per business.
*/

CREATE TABLE IF NOT EXISTS first_value_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id text NOT NULL DEFAULT 'default',
  current_step text NOT NULL DEFAULT 'welcome',
  completed boolean NOT NULL DEFAULT false,
  selected_goal_id text,
  selected_source_type text,
  business_data jsonb,
  manual_context jsonb,
  recommendation_payload jsonb,
  execution_payload jsonb,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fv_progress_user_business
  ON first_value_progress(user_id, business_id);

ALTER TABLE first_value_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_fv_progress" ON first_value_progress;
CREATE POLICY "select_own_fv_progress" ON first_value_progress FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_fv_progress" ON first_value_progress;
CREATE POLICY "insert_own_fv_progress" ON first_value_progress FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_fv_progress" ON first_value_progress;
CREATE POLICY "update_own_fv_progress" ON first_value_progress FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_fv_progress" ON first_value_progress;
CREATE POLICY "delete_own_fv_progress" ON first_value_progress FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
