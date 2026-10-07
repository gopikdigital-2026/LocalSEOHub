/*
# Sprint 02 - Real business identity

Safe to re-run: every statement is idempotent and nothing is deleted.

1. New Tables
  - `businesses`
    - `id` (uuid, primary key) - the real, stable business_id
    - `user_id` (uuid, owner, defaults to auth.uid())
    - `name`, `category`, `city`, `website`, `phone`, `schedule`, `target_audience` (text) - fields the V2 profile already collects
    - `services` (text[]) - services listed in /negocio
    - `primary_goal` (text), `secondary_goals` (text[]) - selected goals
    - `onboarding_completed` (boolean), `onboarding_completed_at` (timestamptz)
    - `legacy_memory_migrated_at` (timestamptz) - set once the browser-storage import has run
    - `created_at`, `updated_at`

2. Modified Tables (data only, no column changes)
  - `first_value_progress.business_id` and `connected_sources.business_id`: rows still holding the
    placeholder 'default' are re-pointed to the owner's real businesses.id (as text).

3. Security
  - RLS enabled on `businesses` with four owner-scoped policies using auth.uid().
  - connected_sources keeps its existing column grants: token columns stay unreadable by clients.

4. Important notes
  1. One business per user today (unique index on user_id); the schema keys every row by business_id
     so more businesses per user can be added later by dropping that index.
  2. Backfill copies name/category/city/website from first_value_progress.business_data and the
     completed flag, so users who finished onboarding are not asked again.
*/

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  website text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  schedule text NOT NULL DEFAULT '',
  target_audience text NOT NULL DEFAULT '',
  services text[] NOT NULL DEFAULT '{}',
  primary_goal text,
  secondary_goals text[] NOT NULL DEFAULT '{}',
  onboarding_completed boolean NOT NULL DEFAULT false,
  onboarding_completed_at timestamptz,
  legacy_memory_migrated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS businesses_user_id_key ON businesses(user_id);

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_business" ON businesses;
CREATE POLICY "select_own_business" ON businesses FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_business" ON businesses;
CREATE POLICY "insert_own_business" ON businesses FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_business" ON businesses;
CREATE POLICY "update_own_business" ON businesses FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_business" ON businesses;
CREATE POLICY "delete_own_business" ON businesses FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

INSERT INTO businesses (user_id, name, category, city, website, primary_goal, onboarding_completed, onboarding_completed_at)
SELECT DISTINCT ON (fv.user_id)
  fv.user_id,
  COALESCE(fv.business_data->>'name', ''),
  COALESCE(fv.business_data->>'category', ''),
  COALESCE(fv.business_data->>'city', ''),
  COALESCE(fv.business_data->>'website', ''),
  fv.selected_goal_id,
  fv.completed,
  fv.completed_at
FROM first_value_progress fv
ORDER BY fv.user_id, fv.updated_at DESC NULLS LAST
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO businesses (user_id)
SELECT DISTINCT cs.user_id FROM connected_sources cs
ON CONFLICT (user_id) DO NOTHING;

UPDATE first_value_progress fv
SET business_id = b.id::text
FROM businesses b
WHERE fv.user_id = b.user_id
  AND fv.business_id = 'default'
  AND NOT EXISTS (
    SELECT 1 FROM first_value_progress x WHERE x.user_id = fv.user_id AND x.business_id = b.id::text
  );

UPDATE connected_sources cs
SET business_id = b.id::text
FROM businesses b
WHERE cs.user_id = b.user_id
  AND cs.business_id = 'default'
  AND NOT EXISTS (
    SELECT 1 FROM connected_sources x
    WHERE x.user_id = cs.user_id AND x.source_type = cs.source_type AND x.business_id = b.id::text
  );
