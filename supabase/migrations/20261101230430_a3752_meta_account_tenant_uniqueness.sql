/*
# A3.7.5.2 — Meta account tenant uniqueness

## Plain-English summary
A Facebook Page or an Instagram professional account can now be held by only one
LocalSEOHub account at a time. A second customer who tries to connect a Page or
Instagram account that is already assigned elsewhere gets a neutral
"already connected to another account" answer; nothing about the other customer is revealed.

## Modified tables
- `meta_connections`
  - New partial unique index `meta_connections_page_assignment_key` on `page_id`
    (only rows where `page_id IS NOT NULL`).
  - New partial unique index `meta_connections_instagram_assignment_key` on
    `instagram_account_id` (only rows where `instagram_account_id IS NOT NULL`).
  - No columns added, removed or changed. No rows touched.

## When an account is "held"
The existing lifecycle trigger already clears `page_id` / `instagram_account_id`
when a connection becomes `disconnected` or `connecting`. Therefore an account is
held while the owning connection is `connected`, `error` or `reauth_required`
and released as soon as the owner disconnects or starts a new connection attempt.
NULL values never conflict (partial index excludes them).

## New function
- `meta_claim_page_selection(connection, user, page, page name, ig status, ig id, ig username)`
  returns text: `ok` | `not_pending` | `page_assigned` | `instagram_assigned`.
  Same checks as the previous page-selection step plus: the connection must belong
  to the given user, and the Page / Instagram id must not be held by a different
  connection. Concurrent claims are serialized by the unique indexes; the loser gets
  `page_assigned` / `instagram_assigned` instead of an error.

## Security
- SECURITY DEFINER, empty search_path.
- EXECUTE revoked from PUBLIC, anon, authenticated; granted to service_role only.
- No RLS or grant changes on tables.

## Safety for existing records (verified before apply)
1. Production has 1 `meta_connections` row (connected, with Page and Instagram id).
2. Zero duplicate `page_id` and zero duplicate `instagram_account_id` values.
3. Index creation therefore cannot fail and no data changes.
4. Frozen publishing engines and publish attempts are untouched.
*/

CREATE UNIQUE INDEX IF NOT EXISTS meta_connections_page_assignment_key
  ON public.meta_connections (page_id) WHERE page_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS meta_connections_instagram_assignment_key
  ON public.meta_connections (instagram_account_id) WHERE instagram_account_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.meta_claim_page_selection(
  p_connection_id uuid, p_user_id uuid, p_page_id text, p_page_name text,
  p_instagram_status text, p_instagram_id text, p_instagram_username text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_constraint text;
BEGIN
  IF p_connection_id IS NULL OR p_user_id IS NULL OR p_page_id IS NULL OR p_page_id = '' THEN
    RETURN 'not_pending';
  END IF;
  IF EXISTS (SELECT 1 FROM public.meta_connections c
             WHERE c.page_id = p_page_id AND c.id <> p_connection_id) THEN
    RETURN 'page_assigned';
  END IF;
  IF p_instagram_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.meta_connections c
       WHERE c.instagram_account_id = p_instagram_id AND c.id <> p_connection_id) THEN
    RETURN 'instagram_assigned';
  END IF;
  BEGIN
    UPDATE public.meta_connections
    SET status = 'connected',
        page_id = p_page_id,
        page_name = p_page_name,
        instagram_status = p_instagram_status,
        instagram_account_id = p_instagram_id,
        instagram_username = p_instagram_username,
        available_pages = '[]'::jsonb,
        last_error = NULL,
        last_error_at = NULL,
        connected_at = now(),
        last_synced_at = now(),
        updated_at = now()
    WHERE id = p_connection_id
      AND user_id = p_user_id
      AND status = 'page_selection_required'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(available_pages) p WHERE p->>'id' = p_page_id);
    IF NOT FOUND THEN
      RETURN 'not_pending';
    END IF;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'meta_connections_instagram_assignment_key' THEN
      RETURN 'instagram_assigned';
    END IF;
    RETURN 'page_assigned';
  END;
  RETURN 'ok';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.meta_claim_page_selection(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.meta_claim_page_selection(uuid, uuid, text, text, text, text, text) TO service_role;
