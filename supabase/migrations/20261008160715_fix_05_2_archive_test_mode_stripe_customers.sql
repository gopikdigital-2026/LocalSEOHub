/*
# FIX 05.2 - Archive test-mode Stripe customer links

LocalSEOHub now uses Stripe in live mode. Four users still pointed at customer
IDs created in Stripe test mode. Those IDs do not exist in the live account, so
Checkout failed for them. This migration archives those four links (soft delete)
so the server creates a fresh live customer the next time each user starts Checkout.

1. New Tables
- `stripe_customer_repairs` (server-only audit/backup)
  - `id` (bigint, identity, PK)
  - `customer_row_id` (bigint) - id of the archived stripe_customers row
  - `user_id` (uuid) - owner of the archived link
  - `old_customer_id` (text) - archived test-mode customer id
  - `subscription_snapshot` (jsonb) - full copy of the archived stripe_subscriptions row
  - `reason` (text)
  - `repaired_at` (timestamptz)
  - UNIQUE (customer_row_id) so re-running never duplicates backups

2. Modified Tables
- `stripe_customers`: UNIQUE(user_id) replaced by a partial unique index on
  user_id WHERE deleted_at IS NULL. A user still has at most one active link,
  but an archived link no longer blocks a new live one. customer_id stays unique.
- The four verified rows (and their `not_started` subscription rows) get
  `deleted_at = now()`. Nothing is deleted.

3. Security
- `stripe_customer_repairs`: RLS enabled, no policies, all client privileges
  revoked. Only the service role can read it.
- Removed legacy duplicate SELECT policies `select_own_customer` and
  `select_own_subscription`, which ignored `deleted_at`. The remaining
  own-row policies already restrict reads to the caller's active rows.

4. Important Notes
1. Pre-checks done in live Stripe: none of the four customers exist in the
   live account; no live subscriptions, charges, payment intents or invoices.
   Locally: subscription status `not_started`, no subscription id, no orders.
2. Idempotent: rows are only touched while still active AND still matching the
   verified state (not_started, no subscription id). Re-running is a no-op.
3. Does not touch users, businesses, trials, orders, webhooks, or any row
   outside the four verified customer ids.
*/

CREATE TABLE IF NOT EXISTS stripe_customer_repairs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_row_id bigint NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  old_customer_id text NOT NULL,
  subscription_snapshot jsonb,
  reason text NOT NULL,
  repaired_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE stripe_customer_repairs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON stripe_customer_repairs FROM anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS stripe_customers_active_user_id_key
  ON stripe_customers (user_id) WHERE deleted_at IS NULL;

ALTER TABLE stripe_customers DROP CONSTRAINT IF EXISTS stripe_customers_user_id_key;

DROP POLICY IF EXISTS "select_own_customer" ON stripe_customers;
DROP POLICY IF EXISTS "select_own_subscription" ON stripe_subscriptions;

DO $$
DECLARE
  verified text[] := ARRAY[
    'cus_Ulse5TTThPK75F',
    'cus_Us6MJhHthvzIjo',
    'cus_Us73Z6MRiIZymE',
    'cus_Ut0vinR7JB5VA3'
  ];
  r record;
BEGIN
  FOR r IN
    SELECT c.id, c.user_id, c.customer_id, to_jsonb(s.*) AS snap
    FROM stripe_customers c
    LEFT JOIN stripe_subscriptions s ON s.customer_id = c.customer_id
    WHERE c.customer_id = ANY (verified)
      AND c.deleted_at IS NULL
      AND (s.id IS NULL OR (s.status = 'not_started' AND s.subscription_id IS NULL))
      AND NOT EXISTS (SELECT 1 FROM stripe_orders o WHERE o.customer_id = c.customer_id)
  LOOP
    INSERT INTO stripe_customer_repairs (customer_row_id, user_id, old_customer_id, subscription_snapshot, reason)
    VALUES (r.id, r.user_id, r.customer_id, r.snap, 'test-mode customer absent from live Stripe account (FIX 05.2)')
    ON CONFLICT (customer_row_id) DO NOTHING;

    UPDATE stripe_subscriptions
      SET deleted_at = now()
      WHERE customer_id = r.customer_id AND deleted_at IS NULL
        AND status = 'not_started' AND subscription_id IS NULL;

    UPDATE stripe_customers SET deleted_at = now() WHERE id = r.id AND deleted_at IS NULL;
  END LOOP;
END $$;
