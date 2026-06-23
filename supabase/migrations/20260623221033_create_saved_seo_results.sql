/*
# Create saved_seo_results table

1. New Tables
- `saved_seo_results`
  - `id` (uuid, primary key, auto-generated)
  - `user_id` (uuid, FK to auth.users, defaults to auth.uid() so the frontend can omit it)
  - `product` (text, the product/service name entered by the user)
  - `city` (text, optional target city/region)
  - `platform` (text, optional platform: Etsy, Shopify, Amazon, Google Business)
  - `title` (text, the generated SEO title)
  - `description` (text, the generated SEO description)
  - `tags` (text[], array of SEO tags)
  - `created_at` (timestamptz, auto-set on insert)

2. Security
  - RLS enabled.
  - 4 owner-scoped policies (select, insert, update, delete) restricted to authenticated users.
  - Each user can only see and modify their own rows.

3. Notes
  - `user_id` defaults to `auth.uid()` so the client can do `.insert({ product, ... })` without passing user_id.
  - Index on (user_id, created_at DESC) for efficient history queries.
*/

CREATE TABLE IF NOT EXISTS saved_seo_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product text NOT NULL,
  city text NOT NULL DEFAULT '',
  platform text NOT NULL DEFAULT '',
  title text NOT NULL,
  description text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_seo_results_user_created
  ON saved_seo_results (user_id, created_at DESC);

ALTER TABLE saved_seo_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_saved" ON saved_seo_results;
CREATE POLICY "select_own_saved" ON saved_seo_results FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_saved" ON saved_seo_results;
CREATE POLICY "insert_own_saved" ON saved_seo_results FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_saved" ON saved_seo_results;
CREATE POLICY "update_own_saved" ON saved_seo_results FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_saved" ON saved_seo_results;
CREATE POLICY "delete_own_saved" ON saved_seo_results FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
