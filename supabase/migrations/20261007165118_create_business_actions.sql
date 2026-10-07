/*
# Create business_actions (Sprint 03 action & recommendation engine)

1. New Tables
- `business_actions`: persisted recommendations/actions per business.
  - `id` uuid pk
  - `business_id` uuid -> businesses(id) on delete cascade
  - `user_id` uuid default auth.uid()
  - `rule_id` text: deterministic rule key used for dedup (e.g. connect_google_business_profile)
  - `action_type`, `category`, `title`, `description`, `reason`
  - `source_type`: VERIFIED_FINDING | BUSINESS_PROFILE | GOAL_BASED | GENERAL_BEST_PRACTICE | FOLLOW_UP | SOURCE_REQUIRED
  - `source_reference` text: which field/source triggered the rule
  - `priority` HIGH|MEDIUM|LOW, `score` int (internal), `impact` high|medium|low, `effort_minutes` int
  - `status` PENDING|IN_PROGRESS|COMPLETED|DISMISSED
  - `due_date`, `created_at`, `updated_at`, `started_at`, `completed_at`, `dismissed_at`
  - `metadata` jsonb
2. Indexes
- Partial unique index on (business_id, rule_id) for open actions (PENDING/IN_PROGRESS), preventing duplicates.
- Index on (business_id, status).
3. Security
- RLS enabled; 4 owner-scoped policies for authenticated users. Insert/update also require the business to belong to the user.
4. Notes
1. No data is modified; this is a new table.
2. The engine is deterministic; this table only stores its output and user progress.
*/

CREATE TABLE IF NOT EXISTS business_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id text NOT NULL,
  action_type text NOT NULL DEFAULT 'other',
  category text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  reason text NOT NULL DEFAULT '',
  source_type text NOT NULL,
  source_reference text NOT NULL DEFAULT '',
  priority text NOT NULL DEFAULT 'MEDIUM',
  score integer NOT NULL DEFAULT 0,
  impact text NOT NULL DEFAULT 'medium',
  effort_minutes integer NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'PENDING',
  due_date date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  dismissed_at timestamptz,
  CONSTRAINT business_actions_source_type_check CHECK (source_type IN ('VERIFIED_FINDING','BUSINESS_PROFILE','GOAL_BASED','GENERAL_BEST_PRACTICE','FOLLOW_UP','SOURCE_REQUIRED')),
  CONSTRAINT business_actions_priority_check CHECK (priority IN ('HIGH','MEDIUM','LOW')),
  CONSTRAINT business_actions_impact_check CHECK (impact IN ('high','medium','low')),
  CONSTRAINT business_actions_status_check CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','DISMISSED')),
  CONSTRAINT business_actions_effort_check CHECK (effort_minutes > 0 AND effort_minutes <= 600)
);

CREATE UNIQUE INDEX IF NOT EXISTS business_actions_open_rule_unique
  ON business_actions (business_id, rule_id)
  WHERE status IN ('PENDING','IN_PROGRESS');

CREATE INDEX IF NOT EXISTS business_actions_business_status_idx
  ON business_actions (business_id, status);

CREATE INDEX IF NOT EXISTS business_actions_user_idx
  ON business_actions (user_id);

ALTER TABLE business_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view their business actions" ON business_actions;
CREATE POLICY "Owners can view their business actions"
ON business_actions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can create actions for their business" ON business_actions;
CREATE POLICY "Owners can create actions for their business"
ON business_actions FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_actions.business_id AND b.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Owners can update their business actions" ON business_actions;
CREATE POLICY "Owners can update their business actions"
ON business_actions FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM businesses b WHERE b.id = business_actions.business_id AND b.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Owners can delete their business actions" ON business_actions;
CREATE POLICY "Owners can delete their business actions"
ON business_actions FOR DELETE TO authenticated
USING (auth.uid() = user_id);
