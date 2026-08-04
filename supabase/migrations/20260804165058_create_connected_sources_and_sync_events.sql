/*
# Create connected_sources and source_sync_events tables

1. New Tables
   - `connected_sources`
     - `id` (uuid, primary key)
     - `user_id` (uuid, references auth.users, default auth.uid())
     - `business_id` (text, default 'default')
     - `source_type` (text, e.g. 'google_business', 'website', 'reviews', 'manual')
     - `status` (text: disconnected, connecting, connected, syncing, error, permissions_required)
     - `external_account_id` (text, nullable — e.g. Google account email)
     - `external_location_id` (text, nullable — e.g. GBP location ID)
     - `access_token_encrypted` (text, nullable — server-side only)
     - `refresh_token_encrypted` (text, nullable — server-side only)
     - `token_expires_at` (timestamptz, nullable)
     - `last_sync_at` (timestamptz, nullable)
     - `last_error` (text, nullable)
     - `metadata` (jsonb, default '{}' — extra source-specific data)
     - `created_at` (timestamptz)
     - `updated_at` (timestamptz)
   - Unique constraint on (user_id, business_id, source_type)

   - `source_sync_events`
     - `id` (uuid, primary key)
     - `user_id` (uuid, references auth.users, default auth.uid())
     - `source_id` (uuid, references connected_sources ON DELETE CASCADE)
     - `source_type` (text)
     - `event_type` (text: source_connect_started, source_connected, source_connect_failed,
       source_sync_started, source_sync_completed, source_sync_failed, source_disconnected)
     - `message` (text, nullable)
     - `records_updated` (integer, default 0)
     - `error_details` (text, nullable)
     - `created_at` (timestamptz)

2. Security
   - RLS enabled on both tables
   - Owner-scoped CRUD: each authenticated user can only access their own rows
   - Tokens columns are stored but NOT selected by default RLS (handled at app level)

3. Notes
   - access_token_encrypted and refresh_token_encrypted should only be read
     by edge functions using the service_role key, never from the frontend.
   - The frontend RLS policies allow read/write of connection metadata but
     tokens are stored server-side only.
*/

-- connected_sources
CREATE TABLE IF NOT EXISTS connected_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id text NOT NULL DEFAULT 'default',
  source_type text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  external_account_id text,
  external_location_id text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, business_id, source_type)
);

ALTER TABLE connected_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sources" ON connected_sources;
CREATE POLICY "select_own_sources" ON connected_sources FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_sources" ON connected_sources;
CREATE POLICY "insert_own_sources" ON connected_sources FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_sources" ON connected_sources;
CREATE POLICY "update_own_sources" ON connected_sources FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_sources" ON connected_sources;
CREATE POLICY "delete_own_sources" ON connected_sources FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Prevent frontend from reading token columns via column-level privileges
-- The service_role bypasses RLS and can read them; authenticated cannot
REVOKE ALL ON connected_sources FROM authenticated;
GRANT SELECT (id, user_id, business_id, source_type, status, external_account_id,
  external_location_id, token_expires_at, last_sync_at, last_error, metadata,
  created_at, updated_at) ON connected_sources TO authenticated;
GRANT INSERT (user_id, business_id, source_type, status, external_account_id,
  external_location_id, last_error, metadata) ON connected_sources TO authenticated;
GRANT UPDATE (status, external_account_id, external_location_id,
  last_sync_at, last_error, metadata, updated_at) ON connected_sources TO authenticated;
GRANT DELETE ON connected_sources TO authenticated;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_connected_sources_user_biz
  ON connected_sources (user_id, business_id);

-- source_sync_events
CREATE TABLE IF NOT EXISTS source_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES connected_sources(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  event_type text NOT NULL,
  message text,
  records_updated integer NOT NULL DEFAULT 0,
  error_details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE source_sync_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_sync_events" ON source_sync_events;
CREATE POLICY "select_own_sync_events" ON source_sync_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_sync_events" ON source_sync_events;
CREATE POLICY "insert_own_sync_events" ON source_sync_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_sync_events" ON source_sync_events;
CREATE POLICY "delete_own_sync_events" ON source_sync_events FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sync_events_source
  ON source_sync_events (source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_events_user
  ON source_sync_events (user_id, created_at DESC);
