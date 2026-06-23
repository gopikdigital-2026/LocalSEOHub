/*
# Create saved_seo table

1. New Tables
- `saved_seo`
  - `id` (uuid, primary key, auto-generated)
  - `user_id` (uuid, FK to auth.users, defaults to auth.uid() — client can omit it on insert)
  - `product` (text, product or service name)
  - `city` (text, optional target city/region)
  - `platform` (text, optional platform: Etsy, Shopify, Amazon, Google Business)
  - `title` (text, the generated SEO title)
  - `description` (text, the generated SEO description)
  - `tags` (text[], array of SEO tags)
  - `created_at` (timestamptz, auto-set on insert)

2. Security
  - RLS enabled.
  - 4 owner-scoped policies (select, insert, update, delete) restricted to authenticated users only.
  - Users can only see and manage their own saved texts.

3. Notes
  - `DEFAULT auth.uid()` on user_id means `.insert({ product, ... })` works without the client passing user_id.
  - Index on (user_id, created_at DESC) for efficient per-user history queries sorted by newest first.
*/

CREATE TABLE IF NOT EXISTS saved_seo (
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

CREATE INDEX IF NOT EXISTS saved_seo_user_created
  ON saved_seo (user_id, created_at DESC);

ALTER TABLE saved_seo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_saved_seo" ON saved_seo;
CREATE POLICY "select_own_saved_seo" ON saved_seo FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_saved_seo" ON saved_seo;
CREATE POLICY "insert_own_saved_seo" ON saved_seo FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_saved_seo" ON saved_seo;
CREATE POLICY "update_own_saved_seo" ON saved_seo FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_saved_seo" ON saved_seo;
CREATE POLICY "delete_own_saved_seo" ON saved_seo FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
