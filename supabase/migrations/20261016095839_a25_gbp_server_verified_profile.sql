/*
# Server-verified Google Business Profile snapshot

1. Modified Tables
- `connected_sources`
  - `verified_profile` (jsonb, nullable): profile fields fetched from Google by the gbp-sync
    edge function (service role). This is the only data the app shows as "verified by Google".
  - `verified_at` (timestamptz, nullable): moment the server stored that snapshot.

2. Security
- Clients may READ both columns on their own rows (existing RLS select_own_sources applies).
- Clients receive NO insert/update privilege on these columns: only the service role
  (gbp-sync) can write them. Client-written `metadata`, `status` and `last_sync_at`
  can therefore no longer produce a verified label.

3. Important notes
1. Additive only: no data is deleted, no column is changed or dropped.
2. Existing rows keep working; they simply have no verified snapshot until the next
   server-side sync, so tools show Google data as "not checked" instead of verified.
*/

ALTER TABLE connected_sources ADD COLUMN IF NOT EXISTS verified_profile jsonb;
ALTER TABLE connected_sources ADD COLUMN IF NOT EXISTS verified_at timestamptz;

GRANT SELECT (verified_profile, verified_at) ON connected_sources TO authenticated;
