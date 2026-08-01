/*
# Create beta_access_requests table

Stores beta access request leads from the public /beta landing page.
Replaces localStorage-only storage with real persistence.

1. New Tables
  - `beta_access_requests`
    - `id` (uuid, primary key)
    - `name` (text) — requester name
    - `email` (text, not null) — requester email, unique
    - `business_name` (text, not null) — their business name
    - `sector` (text) — business sector/category
    - `city` (text) — business city
    - `primary_goal` (text) — what they want to achieve
    - `source` (text) — where they heard about us
    - `utm_source` (text)
    - `utm_medium` (text)
    - `utm_campaign` (text)
    - `utm_content` (text)
    - `referrer` (text)
    - `status` (text, default 'new') — lifecycle: new, contacted, invited, accepted, rejected
    - `created_at` (timestamptz)

2. Security
  - Enable RLS on `beta_access_requests`.
  - Public INSERT allowed via anon role (no auth required to submit).
  - SELECT/UPDATE/DELETE restricted to service_role only (admin).
  - No authenticated user can read other people's submissions.

3. Constraints
  - Unique on email to prevent duplicates.
*/

CREATE TABLE IF NOT EXISTS beta_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text NOT NULL,
  business_name text NOT NULL,
  sector text,
  city text,
  primary_goal text,
  source text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  referrer text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_beta_requests_email
  ON beta_access_requests(email);

ALTER TABLE beta_access_requests ENABLE ROW LEVEL SECURITY;

-- Public INSERT: anyone can submit a beta request (anon or authenticated)
DROP POLICY IF EXISTS "anon_insert_beta_requests" ON beta_access_requests;
CREATE POLICY "anon_insert_beta_requests" ON beta_access_requests FOR INSERT
  TO anon, authenticated WITH CHECK (true);

-- No public SELECT — only service_role (admin dashboard) can read submissions
-- This means no one can enumerate other people's requests
DROP POLICY IF EXISTS "no_public_select_beta" ON beta_access_requests;
CREATE POLICY "no_public_select_beta" ON beta_access_requests FOR SELECT
  TO authenticated USING (false);

DROP POLICY IF EXISTS "no_public_update_beta" ON beta_access_requests;
CREATE POLICY "no_public_update_beta" ON beta_access_requests FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "no_public_delete_beta" ON beta_access_requests;
CREATE POLICY "no_public_delete_beta" ON beta_access_requests FOR DELETE
  TO authenticated USING (false);
