/*
# A3.7.4.1 - Meta publishing security & persistence foundation

## 1. What this does
Adds the server-owned foundation that a future publishing step will use: an auditable record of
every publish attempt per channel, a database-enforced idempotency identity, a single server-side
eligibility gate (preflight), derived publishing capabilities, and a SEPARATE explicit
"enable publishing" consent path for an already healthy Meta connection.
NOTHING here publishes, calls Meta, creates media containers, or exposes images. No existing row is
rewritten; no existing column, policy, grant or function is changed.

## 2. New tables
- `publication_publish_attempts` - one row per explicit publish attempt.
  - `id` (attempt UUID), `publication_id`, `user_id`, `business_id`, `channel` (facebook | instagram)
  - `draft_version`, `source_generation_id` - the frozen draft snapshot the attempt is bound to
  - `idempotency_key` - generated `publication_id:channel:vN` (never supplied by any caller)
  - `attempt_number` - 1..50 per (publication, channel)
  - `status` - publishing | succeeded | failed | unknown. NOT_REQUESTED is represented by the
    absence of any row for (publication, channel).
  - `meta_object_id`, `permalink` - only on succeeded
  - `error_code` - normalized taxonomy code only (never a raw Meta message/body/fbtrace_id)
  - `retryable`, `verification_required`, `verification_attempts`, `last_verified_at`
  - `started_at`, `finished_at`, `created_at`, `updated_at`
  - Never stores tokens, signed URLs, app secret, appsecret_proof, OAuth codes or raw responses.
- `meta_publishing_consent_states` - server-only, single-use state for the "enable publishing"
  consent flow (SHA-256 hashes only; pending token held in Vault until the same browser session
  confirms with its binding).

## 3. Modified tables (additive columns only)
- `meta_connections`: `page_tasks` (text[], NULL = never discovered), `permissions_checked_at`,
  `publishing_consent_at`. Reset automatically when the Page changes or the connection leaves
  `connected`.

## 4. Security
1. RLS enabled on both new tables.
2. `publication_publish_attempts`: browsers get SELECT only, owner-scoped (row owner AND business
   owner). No INSERT/UPDATE/DELETE privilege for anon, authenticated or service_role: every write
   goes through SECURITY DEFINER functions. A trigger enforces identity immutability, ownership
   coherence and the state machine for every writer.
3. `meta_publishing_consent_states`: no privileges and no policies for any API role.
4. All new functions: SECURITY DEFINER, `search_path = ''`, EXECUTE revoked from PUBLIC, anon and
   authenticated; only the service role may call the RPCs. Internal helpers have no grant at all.
5. Owner, business, Page and Instagram ids are always resolved from server rows.

## 5. State machine (server-owned)
publishing -> succeeded | failed | unknown
unknown -> succeeded | failed ONLY through a recorded verification (verification_attempts must
increase); unknown never becomes failed automatically. failed is terminal for that row; a NEW
attempt row may be started.

## 6. Idempotency & concurrency
Partial unique indexes: at most one live row per (publication, channel, draft_version) among
publishing/succeeded/unknown, at most one publishing/unknown row per (publication, channel), and at
most one succeeded row per (publication, channel). `publish_attempt_begin` locks the publication
row FOR UPDATE (same lock the draft editor takes) and maps a unique violation to
PUBLISH_IN_PROGRESS, so two simultaneous begins produce exactly one winner.

## 7. Important notes
1. Idempotent: safe to re-run.
2. No data is rewritten; existing publications and drafts are untouched.
*/

-- ─── meta_connections: additive publishing columns ──────────────────────────

ALTER TABLE public.meta_connections ADD COLUMN IF NOT EXISTS page_tasks text[];
ALTER TABLE public.meta_connections ADD COLUMN IF NOT EXISTS permissions_checked_at timestamptz;
ALTER TABLE public.meta_connections ADD COLUMN IF NOT EXISTS publishing_consent_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_connections_page_tasks_shape') THEN
    ALTER TABLE public.meta_connections ADD CONSTRAINT meta_connections_page_tasks_shape
      CHECK (page_tasks IS NULL OR cardinality(page_tasks) <= 32);
  END IF;
END $$;

GRANT SELECT (page_tasks, permissions_checked_at, publishing_consent_at) ON public.meta_connections TO authenticated;

CREATE OR REPLACE FUNCTION public.meta_connections_reset_publishing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status <> 'connected' OR NEW.page_id IS DISTINCT FROM OLD.page_id THEN
    NEW.page_tasks := NULL;
    NEW.publishing_consent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meta_connections_reset_publishing ON public.meta_connections;
CREATE TRIGGER meta_connections_reset_publishing
  BEFORE UPDATE ON public.meta_connections
  FOR EACH ROW EXECUTE FUNCTION public.meta_connections_reset_publishing();

-- ─── Publishing consent states (server-only) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meta_publishing_consent_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state_hash text NOT NULL UNIQUE CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  binding_hash text NOT NULL CHECK (binding_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  completion_hash text UNIQUE CHECK (completion_hash IS NULL OR completion_hash ~ '^[a-f0-9]{64}$'),
  completion_expires_at timestamptz,
  pending_token_ref text CHECK (pending_token_ref IS NULL OR pending_token_ref LIKE 'vault:%'),
  pending_token_expires_at timestamptz,
  pending_permissions text[],
  pending_page_tasks text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_publishing_consent_states_connection_key
  ON public.meta_publishing_consent_states (connection_id);

ALTER TABLE public.meta_publishing_consent_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.meta_publishing_consent_states FROM anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.meta_publishing_consent_forget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.meta_vault_forget(OLD.pending_token_ref);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS meta_publishing_consent_forget ON public.meta_publishing_consent_states;
CREATE TRIGGER meta_publishing_consent_forget
  AFTER DELETE ON public.meta_publishing_consent_states
  FOR EACH ROW EXECUTE FUNCTION public.meta_publishing_consent_forget();

CREATE OR REPLACE FUNCTION public.meta_connections_drop_publishing_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.status <> 'connected' THEN
    DELETE FROM public.meta_publishing_consent_states WHERE connection_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS meta_connections_drop_publishing_consent ON public.meta_connections;
CREATE TRIGGER meta_connections_drop_publishing_consent
  AFTER UPDATE ON public.meta_connections
  FOR EACH ROW EXECUTE FUNCTION public.meta_connections_drop_publishing_consent();

CREATE OR REPLACE FUNCTION public.meta_begin_publishing_consent(
  p_user_id uuid, p_business_id uuid, p_state_hash text, p_binding_hash text, p_expires_at timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_conn public.meta_connections%ROWTYPE;
BEGIN
  IF p_expires_at IS NULL OR p_expires_at <= now() OR p_expires_at > now() + interval '15 minutes' THEN
    RETURN 'invalid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = p_business_id AND user_id = p_user_id) THEN
    RETURN 'no_business';
  END IF;
  SELECT * INTO v_conn FROM public.meta_connections
  WHERE user_id = p_user_id AND business_id = p_business_id FOR UPDATE;
  IF NOT FOUND OR v_conn.status <> 'connected' OR v_conn.user_token_ref IS NULL
     OR v_conn.page_id IS NULL OR v_conn.meta_user_id IS NULL THEN
    RETURN 'not_connected';
  END IF;
  DELETE FROM public.meta_publishing_consent_states WHERE connection_id = v_conn.id;
  INSERT INTO public.meta_publishing_consent_states (connection_id, user_id, state_hash, binding_hash, expires_at)
  VALUES (v_conn.id, p_user_id, p_state_hash, p_binding_hash, p_expires_at);
  RETURN 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION public.meta_consume_publishing_state(p_state_hash text)
RETURNS TABLE (result text, connection_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_state public.meta_publishing_consent_states%ROWTYPE;
  v_conn public.meta_connections%ROWTYPE;
BEGIN
  SELECT * INTO v_state FROM public.meta_publishing_consent_states s WHERE s.state_hash = p_state_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown'::text, NULL::uuid; RETURN;
  END IF;
  IF v_state.consumed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'consumed'::text, NULL::uuid; RETURN;
  END IF;
  UPDATE public.meta_publishing_consent_states SET consumed_at = now() WHERE id = v_state.id;
  SELECT * INTO v_conn FROM public.meta_connections c WHERE c.id = v_state.connection_id;
  IF NOT FOUND OR v_conn.status <> 'connected' OR v_conn.user_id <> v_state.user_id THEN
    RETURN QUERY SELECT 'stale'::text, NULL::uuid; RETURN;
  END IF;
  IF v_state.expires_at <= now() THEN
    RETURN QUERY SELECT 'expired'::text, v_conn.id; RETURN;
  END IF;
  RETURN QUERY SELECT 'ok'::text, v_conn.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.meta_discard_publishing_state(p_state_hash text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.meta_publishing_consent_states WHERE state_hash = p_state_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.meta_store_publishing_consent(
  p_connection_id uuid, p_state_hash text, p_access_token text, p_expires_at timestamptz,
  p_meta_user_id text, p_permissions text[], p_pages jsonb,
  p_completion_hash text, p_completion_expires_at timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_conn public.meta_connections%ROWTYPE;
  v_state_id uuid;
  v_tasks text[];
  v_perms text[];
BEGIN
  SELECT s.id INTO v_state_id FROM public.meta_publishing_consent_states s
  WHERE s.connection_id = p_connection_id AND s.state_hash = p_state_hash
    AND s.consumed_at IS NOT NULL AND s.completion_hash IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'stale';
  END IF;
  SELECT * INTO v_conn FROM public.meta_connections WHERE id = p_connection_id FOR UPDATE;
  IF NOT FOUND OR v_conn.status <> 'connected' OR p_access_token IS NULL OR p_access_token = '' THEN
    DELETE FROM public.meta_publishing_consent_states WHERE id = v_state_id;
    RETURN 'stale';
  END IF;
  IF v_conn.meta_user_id IS DISTINCT FROM p_meta_user_id THEN
    DELETE FROM public.meta_publishing_consent_states WHERE id = v_state_id;
    RETURN 'account_mismatch';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT t ORDER BY t), '{}') INTO v_tasks
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_pages) = 'array' THEN p_pages ELSE '[]'::jsonb END) AS pg,
       jsonb_array_elements_text(CASE WHEN jsonb_typeof(pg->'tasks') = 'array' THEN pg->'tasks' ELSE '[]'::jsonb END) AS t
  WHERE pg->>'id' = v_conn.page_id AND t ~ '^[A-Z_]{1,32}$';
  SELECT COALESCE(array_agg(DISTINCT x ORDER BY x), '{}') INTO v_perms
  FROM unnest(COALESCE(p_permissions, '{}')) AS x WHERE x ~ '^[a-z_]{1,64}$';
  UPDATE public.meta_publishing_consent_states
  SET pending_token_ref = public.meta_vault_put(NULL, p_access_token),
      pending_token_expires_at = p_expires_at,
      pending_permissions = v_perms,
      pending_page_tasks = v_tasks,
      completion_hash = p_completion_hash,
      completion_expires_at = p_completion_expires_at
  WHERE id = v_state_id;
  RETURN 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION public.meta_complete_publishing_consent(
  p_user_id uuid, p_completion_hash text, p_binding_hash text)
RETURNS TABLE (result text, permissions text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_state public.meta_publishing_consent_states%ROWTYPE;
  v_ref text;
BEGIN
  SELECT * INTO v_state FROM public.meta_publishing_consent_states s
  WHERE s.completion_hash = p_completion_hash FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'unknown'::text, NULL::text[]; RETURN;
  END IF;
  IF v_state.user_id <> p_user_id THEN
    DELETE FROM public.meta_publishing_consent_states WHERE id = v_state.id;
    RETURN QUERY SELECT 'wrong_user'::text, NULL::text[]; RETURN;
  END IF;
  IF v_state.binding_hash <> p_binding_hash THEN
    DELETE FROM public.meta_publishing_consent_states WHERE id = v_state.id;
    RETURN QUERY SELECT 'binding_mismatch'::text, NULL::text[]; RETURN;
  END IF;
  IF v_state.completion_expires_at IS NULL OR v_state.completion_expires_at <= now()
     OR v_state.pending_token_ref IS NULL THEN
    DELETE FROM public.meta_publishing_consent_states WHERE id = v_state.id;
    RETURN QUERY SELECT 'expired'::text, NULL::text[]; RETURN;
  END IF;
  v_ref := v_state.pending_token_ref;
  -- Detach the ref first so the delete trigger does not forget the token being promoted.
  UPDATE public.meta_publishing_consent_states SET pending_token_ref = NULL WHERE id = v_state.id;
  UPDATE public.meta_connections
  SET user_token_ref = v_ref,
      token_expires_at = v_state.pending_token_expires_at,
      granted_permissions = COALESCE(v_state.pending_permissions, '{}'),
      page_tasks = COALESCE(v_state.pending_page_tasks, '{}'),
      permissions_checked_at = now(),
      publishing_consent_at = now(),
      updated_at = now()
  WHERE id = v_state.connection_id AND user_id = p_user_id AND status = 'connected';
  IF NOT FOUND THEN
    PERFORM public.meta_vault_forget(v_ref);
    DELETE FROM public.meta_publishing_consent_states WHERE id = v_state.id;
    RETURN QUERY SELECT 'stale'::text, NULL::text[]; RETURN;
  END IF;
  DELETE FROM public.meta_publishing_consent_states WHERE id = v_state.id;
  RETURN QUERY SELECT 'ok'::text, COALESCE(v_state.pending_permissions, '{}'::text[]);
END;
$$;

-- ─── Publish attempts ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.publication_publish_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('facebook', 'instagram')),
  draft_version integer NOT NULL CHECK (draft_version >= 1),
  source_generation_id uuid NOT NULL,
  idempotency_key text GENERATED ALWAYS AS (publication_id::text || ':' || channel || ':v' || draft_version::text) STORED,
  attempt_number integer NOT NULL CHECK (attempt_number BETWEEN 1 AND 50),
  status text NOT NULL DEFAULT 'publishing' CHECK (status IN ('publishing', 'succeeded', 'failed', 'unknown')),
  meta_object_id text CHECK (meta_object_id IS NULL OR meta_object_id ~ '^[0-9]{1,32}(_[0-9]{1,32})?$'),
  permalink text CHECK (permalink IS NULL OR (char_length(permalink) <= 512
    AND permalink ~ '^https://(www\.|m\.)?(facebook\.com|instagram\.com)/[A-Za-z0-9._/-]*$')),
  error_code text CHECK (error_code IS NULL OR error_code IN (
    'AUTH_REQUIRED', 'REAUTH_REQUIRED', 'PERMISSION_REQUIRED', 'CHANNEL_NOT_CONNECTED',
    'INVALID_PUBLICATION_STATE', 'VERSION_CONFLICT', 'IMAGE_UNAVAILABLE', 'IMAGE_UNSUPPORTED',
    'META_RATE_LIMITED', 'META_TEMPORARY_ERROR', 'META_REJECTED', 'PUBLISH_OUTCOME_UNKNOWN',
    'ALREADY_PUBLISHED', 'PUBLISH_IN_PROGRESS', 'INTERNAL_ERROR')),
  retryable boolean NOT NULL DEFAULT false,
  verification_required boolean NOT NULL DEFAULT false,
  verification_attempts integer NOT NULL DEFAULT 0 CHECK (verification_attempts BETWEEN 0 AND 100),
  last_verified_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publish_attempts_number_key UNIQUE (publication_id, channel, attempt_number),
  CONSTRAINT publish_attempts_state_shape CHECK (
    (status = 'publishing' AND meta_object_id IS NULL AND permalink IS NULL AND error_code IS NULL
      AND finished_at IS NULL AND NOT retryable AND NOT verification_required)
    OR (status = 'succeeded' AND meta_object_id IS NOT NULL AND error_code IS NULL
      AND finished_at IS NOT NULL AND NOT retryable AND NOT verification_required)
    OR (status = 'failed' AND meta_object_id IS NULL AND permalink IS NULL AND error_code IS NOT NULL
      AND error_code NOT IN ('PUBLISH_OUTCOME_UNKNOWN', 'ALREADY_PUBLISHED', 'PUBLISH_IN_PROGRESS')
      AND finished_at IS NOT NULL AND NOT verification_required)
    OR (status = 'unknown' AND meta_object_id IS NULL AND permalink IS NULL
      AND error_code = 'PUBLISH_OUTCOME_UNKNOWN' AND finished_at IS NOT NULL
      AND NOT retryable AND verification_required))
);

CREATE UNIQUE INDEX IF NOT EXISTS publish_attempts_identity_live
  ON public.publication_publish_attempts (publication_id, channel, draft_version)
  WHERE status IN ('publishing', 'succeeded', 'unknown');
CREATE UNIQUE INDEX IF NOT EXISTS publish_attempts_one_active
  ON public.publication_publish_attempts (publication_id, channel)
  WHERE status IN ('publishing', 'unknown');
CREATE UNIQUE INDEX IF NOT EXISTS publish_attempts_one_success
  ON public.publication_publish_attempts (publication_id, channel)
  WHERE status = 'succeeded';
CREATE INDEX IF NOT EXISTS publish_attempts_user_idx ON public.publication_publish_attempts (user_id);
CREATE INDEX IF NOT EXISTS publish_attempts_business_idx ON public.publication_publish_attempts (business_id);
CREATE INDEX IF NOT EXISTS publish_attempts_latest_idx
  ON public.publication_publish_attempts (publication_id, channel, created_at DESC);

ALTER TABLE public.publication_publish_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publication_publish_attempts FROM anon, authenticated, service_role;
GRANT SELECT ON public.publication_publish_attempts TO authenticated;

DROP POLICY IF EXISTS "select_own_publish_attempts" ON public.publication_publish_attempts;
CREATE POLICY "select_own_publish_attempts" ON public.publication_publish_attempts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND b.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.publish_attempts_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'publishing' THEN
      RAISE EXCEPTION 'publish_attempt_must_start_publishing';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.publications p
      JOIN public.businesses b ON b.id = p.business_id AND b.user_id = p.user_id
      WHERE p.id = NEW.publication_id AND p.user_id = NEW.user_id AND p.business_id = NEW.business_id) THEN
      RAISE EXCEPTION 'publish_attempt_owner_mismatch';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.publication_id <> OLD.publication_id OR NEW.user_id <> OLD.user_id
     OR NEW.business_id <> OLD.business_id OR NEW.channel <> OLD.channel
     OR NEW.draft_version <> OLD.draft_version OR NEW.source_generation_id <> OLD.source_generation_id
     OR NEW.attempt_number <> OLD.attempt_number OR NEW.started_at <> OLD.started_at
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'publish_attempt_identity_immutable';
  END IF;
  IF OLD.status = 'publishing' AND NEW.status IN ('succeeded', 'failed', 'unknown') THEN
    NULL;
  ELSIF OLD.status = 'unknown' AND NEW.status IN ('unknown', 'succeeded', 'failed') THEN
    IF NEW.verification_attempts <= OLD.verification_attempts OR NEW.last_verified_at IS NULL THEN
      RAISE EXCEPTION 'publish_attempt_unknown_requires_verification';
    END IF;
  ELSE
    RAISE EXCEPTION 'publish_attempt_invalid_transition';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS publish_attempts_guard ON public.publication_publish_attempts;
CREATE TRIGGER publish_attempts_guard
  BEFORE INSERT OR UPDATE ON public.publication_publish_attempts
  FOR EACH ROW EXECUTE FUNCTION public.publish_attempts_guard();

-- ─── Eligibility (internal, no grants) ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.meta_publish_channel_issue(p_user_id uuid, p_business_id uuid, p_channel text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE c public.meta_connections%ROWTYPE;
BEGIN
  IF p_channel IS NULL OR p_channel NOT IN ('facebook', 'instagram') THEN
    RETURN 'INVALID_PUBLICATION_STATE';
  END IF;
  SELECT * INTO c FROM public.meta_connections m
  WHERE m.user_id = p_user_id AND m.business_id = p_business_id
    AND EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = m.business_id AND b.user_id = p_user_id);
  IF NOT FOUND THEN
    RETURN 'CHANNEL_NOT_CONNECTED';
  END IF;
  IF c.status = 'reauth_required' THEN
    RETURN 'REAUTH_REQUIRED';
  END IF;
  IF c.status <> 'connected' THEN
    RETURN 'CHANNEL_NOT_CONNECTED';
  END IF;
  IF c.user_token_ref IS NULL OR c.revocation_status IS NOT NULL
     OR (c.token_expires_at IS NOT NULL AND c.token_expires_at <= now()) THEN
    RETURN 'REAUTH_REQUIRED';
  END IF;
  IF c.page_id IS NULL THEN
    RETURN 'CHANNEL_NOT_CONNECTED';
  END IF;
  IF p_channel = 'facebook' THEN
    IF NOT (c.granted_permissions @> ARRAY['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']) THEN
      RETURN 'PERMISSION_REQUIRED';
    END IF;
    IF c.page_tasks IS NULL OR NOT ('CREATE_CONTENT' = ANY (c.page_tasks)) THEN
      RETURN 'PERMISSION_REQUIRED';
    END IF;
  ELSE
    IF c.instagram_status IS DISTINCT FROM 'connected' OR c.instagram_account_id IS NULL THEN
      RETURN 'CHANNEL_NOT_CONNECTED';
    END IF;
    IF NOT (c.granted_permissions @> ARRAY['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish']) THEN
      RETURN 'PERMISSION_REQUIRED';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.publication_publish_gate(
  p_user_id uuid, p_publication_id uuid, p_channel text, p_expected_version integer)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_pub public.publications%ROWTYPE;
  v_draft public.publication_drafts%ROWTYPE;
  v_attempt text;
  v_text text;
  v_ratio numeric;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 'AUTH_REQUIRED';
  END IF;
  IF p_channel IS NULL OR p_channel NOT IN ('facebook', 'instagram') THEN
    RETURN 'INVALID_PUBLICATION_STATE';
  END IF;
  SELECT * INTO v_pub FROM public.publications p WHERE p.id = p_publication_id AND p.user_id = p_user_id;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.id = v_pub.business_id AND b.user_id = p_user_id) THEN
    RETURN 'INVALID_PUBLICATION_STATE';
  END IF;

  SELECT a.status INTO v_attempt FROM public.publication_publish_attempts a
  WHERE a.publication_id = v_pub.id AND a.channel = p_channel AND a.status IN ('succeeded', 'publishing', 'unknown')
  ORDER BY CASE a.status WHEN 'succeeded' THEN 0 WHEN 'unknown' THEN 1 ELSE 2 END
  LIMIT 1;
  IF v_attempt = 'succeeded' THEN RETURN 'ALREADY_PUBLISHED'; END IF;
  IF v_attempt = 'unknown' THEN RETURN 'PUBLISH_OUTCOME_UNKNOWN'; END IF;
  IF v_attempt = 'publishing' THEN RETURN 'PUBLISH_IN_PROGRESS'; END IF;

  IF v_pub.status <> 'proposals_ready' OR v_pub.proposal_generation_id IS NULL THEN
    RETURN 'INVALID_PUBLICATION_STATE';
  END IF;
  IF v_pub.image_path IS NULL OR v_pub.image_mime IS NULL OR v_pub.image_width IS NULL OR v_pub.image_height IS NULL
     OR v_pub.image_path !~ ('^' || v_pub.user_id::text || '/' || v_pub.business_id::text || '/'
                             || v_pub.id::text || '/[0-9a-f-]{36}\.(jpg|png)$')
     OR (v_pub.image_mime = 'image/jpeg') <> (v_pub.image_path ~ '\.jpg$')
     OR NOT EXISTS (SELECT 1 FROM storage.objects o
                    WHERE o.bucket_id = 'publication-images' AND o.name = v_pub.image_path) THEN
    RETURN 'IMAGE_UNAVAILABLE';
  END IF;

  SELECT * INTO v_draft FROM public.publication_drafts d
  WHERE d.publication_id = v_pub.id AND d.user_id = p_user_id AND d.business_id = v_pub.business_id;
  IF NOT FOUND OR v_draft.source_generation_id IS DISTINCT FROM v_pub.proposal_generation_id
     OR v_draft.source_body IS NULL OR v_draft.facebook_generated IS NULL OR v_draft.instagram_generated IS NULL
     OR (v_draft.adaptation_claim_id IS NOT NULL AND v_draft.adaptation_claimed_at > now() - interval '3 minutes') THEN
    RETURN 'INVALID_PUBLICATION_STATE';
  END IF;
  IF p_expected_version IS NULL OR v_draft.version <> p_expected_version THEN
    RETURN 'VERSION_CONFLICT';
  END IF;
  v_text := CASE p_channel WHEN 'facebook' THEN v_draft.facebook_text ELSE v_draft.instagram_text END;
  IF public.publication_channel_text_issue(v_text, CASE p_channel WHEN 'facebook' THEN 5000 ELSE 2200 END) IS NOT NULL THEN
    RETURN 'INVALID_PUBLICATION_STATE';
  END IF;

  IF p_channel = 'instagram' THEN
    v_ratio := v_pub.image_width::numeric / v_pub.image_height::numeric;
    IF v_pub.image_mime <> 'image/jpeg' OR v_ratio < 0.8 OR v_ratio > 1.91 THEN
      RETURN 'IMAGE_UNSUPPORTED';
    END IF;
  END IF;

  RETURN public.meta_publish_channel_issue(p_user_id, v_pub.business_id, p_channel);
END;
$$;

-- ─── Service-role RPCs ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.meta_publish_capabilities(p_user_id uuid, p_business_id uuid)
RETURNS TABLE (channel text, issue text, missing_permissions text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_granted text[];
BEGIN
  SELECT m.granted_permissions INTO v_granted FROM public.meta_connections m
  WHERE m.user_id = p_user_id AND m.business_id = p_business_id AND m.status = 'connected';
  v_granted := COALESCE(v_granted, '{}');
  RETURN QUERY
  SELECT ch.name,
         public.meta_publish_channel_issue(p_user_id, p_business_id, ch.name),
         ARRAY(SELECT x FROM unnest(ch.needed) AS x WHERE NOT (x = ANY (v_granted)) ORDER BY x)
  FROM (VALUES
    ('facebook'::text, ARRAY['pages_show_list', 'pages_read_engagement', 'pages_manage_posts']),
    ('instagram'::text, ARRAY['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish'])
  ) AS ch(name, needed);
END;
$$;

CREATE OR REPLACE FUNCTION public.publication_publish_preflight(
  p_user_id uuid, p_publication_id uuid, p_expected_version integer)
RETURNS TABLE (
  channel text, issue text, draft_version integer, attempt_status text, attempt_error_code text,
  meta_object_id text, permalink text, attempt_updated_at timestamptz,
  attempt_retryable boolean, attempt_verification_required boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  v_owned boolean;
  v_version integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.publications p JOIN public.businesses b ON b.id = p.business_id AND b.user_id = p_user_id
    WHERE p.id = p_publication_id AND p.user_id = p_user_id) INTO v_owned;
  IF v_owned THEN
    SELECT d.version INTO v_version FROM public.publication_drafts d
    WHERE d.publication_id = p_publication_id AND d.user_id = p_user_id;
  END IF;
  RETURN QUERY
  SELECT ch.name,
         public.publication_publish_gate(p_user_id, p_publication_id, ch.name, p_expected_version),
         v_version,
         la.status, la.error_code, la.meta_object_id, la.permalink, la.updated_at,
         la.retryable, la.verification_required
  FROM (VALUES ('facebook'::text), ('instagram'::text)) AS ch(name)
  LEFT JOIN LATERAL (
    SELECT a.status, a.error_code, a.meta_object_id, a.permalink, a.updated_at, a.retryable, a.verification_required
    FROM public.publication_publish_attempts a
    WHERE v_owned AND a.publication_id = p_publication_id AND a.user_id = p_user_id AND a.channel = ch.name
    ORDER BY a.created_at DESC
    LIMIT 1
  ) AS la ON true;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_attempt_begin(
  p_user_id uuid, p_publication_id uuid, p_channel text, p_expected_version integer)
RETURNS TABLE (
  result text, attempt_id uuid, draft_version integer, caption text,
  image_path text, image_mime text, page_id text, instagram_account_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
#variable_conflict use_column
DECLARE
  v_pub public.publications%ROWTYPE;
  v_draft public.publication_drafts%ROWTYPE;
  v_conn public.meta_connections%ROWTYPE;
  v_issue text;
  v_number integer;
  v_id uuid;
BEGIN
  SELECT * INTO v_pub FROM public.publications p
  WHERE p.id = p_publication_id AND p.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'INVALID_PUBLICATION_STATE'::text, NULL::uuid, NULL::integer, NULL::text,
      NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  v_issue := public.publication_publish_gate(p_user_id, p_publication_id, p_channel, p_expected_version);
  IF v_issue IS NOT NULL THEN
    RETURN QUERY SELECT v_issue, NULL::uuid, NULL::integer, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;
  SELECT * INTO v_draft FROM public.publication_drafts d WHERE d.publication_id = v_pub.id FOR UPDATE;
  SELECT * INTO v_conn FROM public.meta_connections m
  WHERE m.user_id = p_user_id AND m.business_id = v_pub.business_id;
  SELECT COALESCE(max(a.attempt_number), 0) + 1 INTO v_number
  FROM public.publication_publish_attempts a WHERE a.publication_id = v_pub.id AND a.channel = p_channel;
  BEGIN
    INSERT INTO public.publication_publish_attempts
      (publication_id, user_id, business_id, channel, draft_version, source_generation_id, attempt_number)
    VALUES (v_pub.id, p_user_id, v_pub.business_id, p_channel, v_draft.version, v_draft.source_generation_id, v_number)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT 'PUBLISH_IN_PROGRESS'::text, NULL::uuid, NULL::integer, NULL::text,
      NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END;
  RETURN QUERY SELECT 'OK'::text, v_id, v_draft.version,
    CASE p_channel WHEN 'facebook' THEN v_draft.facebook_text ELSE v_draft.instagram_text END,
    v_pub.image_path, v_pub.image_mime, v_conn.page_id,
    CASE p_channel WHEN 'instagram' THEN v_conn.instagram_account_id ELSE NULL END;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_attempt_finish(
  p_user_id uuid, p_attempt_id uuid, p_outcome text,
  p_meta_object_id text, p_permalink text, p_error_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_status text;
BEGIN
  SELECT a.status INTO v_status FROM public.publication_publish_attempts a
  WHERE a.id = p_attempt_id AND a.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_status <> 'publishing' THEN
    RETURN 'invalid_transition';
  END IF;
  BEGIN
    IF p_outcome = 'succeeded' THEN
      IF p_meta_object_id IS NULL THEN RETURN 'invalid_payload'; END IF;
      UPDATE public.publication_publish_attempts
      SET status = 'succeeded', meta_object_id = p_meta_object_id, permalink = p_permalink,
          error_code = NULL, retryable = false, verification_required = false, finished_at = now()
      WHERE id = p_attempt_id;
    ELSIF p_outcome = 'failed' THEN
      IF p_error_code IS NULL OR p_error_code NOT IN (
        'REAUTH_REQUIRED', 'PERMISSION_REQUIRED', 'CHANNEL_NOT_CONNECTED', 'IMAGE_UNAVAILABLE',
        'IMAGE_UNSUPPORTED', 'META_RATE_LIMITED', 'META_TEMPORARY_ERROR', 'META_REJECTED', 'INTERNAL_ERROR') THEN
        RETURN 'invalid_payload';
      END IF;
      UPDATE public.publication_publish_attempts
      SET status = 'failed', error_code = p_error_code,
          retryable = p_error_code IN ('META_RATE_LIMITED', 'META_TEMPORARY_ERROR'),
          verification_required = false, finished_at = now()
      WHERE id = p_attempt_id;
    ELSIF p_outcome = 'unknown' THEN
      UPDATE public.publication_publish_attempts
      SET status = 'unknown', error_code = 'PUBLISH_OUTCOME_UNKNOWN', retryable = false,
          verification_required = true, finished_at = now()
      WHERE id = p_attempt_id;
    ELSE
      RETURN 'invalid_payload';
    END IF;
  EXCEPTION WHEN check_violation THEN
    RETURN 'invalid_payload';
  END;
  RETURN 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_attempt_record_verification(
  p_user_id uuid, p_attempt_id uuid, p_verdict text, p_meta_object_id text, p_permalink text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_status text;
BEGIN
  SELECT a.status INTO v_status FROM public.publication_publish_attempts a
  WHERE a.id = p_attempt_id AND a.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_status <> 'unknown' THEN
    RETURN 'invalid_transition';
  END IF;
  BEGIN
    IF p_verdict = 'found' THEN
      IF p_meta_object_id IS NULL THEN RETURN 'invalid_payload'; END IF;
      UPDATE public.publication_publish_attempts
      SET status = 'succeeded', meta_object_id = p_meta_object_id, permalink = p_permalink,
          error_code = NULL, retryable = false, verification_required = false,
          verification_attempts = verification_attempts + 1, last_verified_at = now(), finished_at = now()
      WHERE id = p_attempt_id;
    ELSIF p_verdict = 'absent' THEN
      UPDATE public.publication_publish_attempts
      SET status = 'failed', error_code = 'META_TEMPORARY_ERROR', retryable = true, verification_required = false,
          verification_attempts = verification_attempts + 1, last_verified_at = now(), finished_at = now()
      WHERE id = p_attempt_id;
    ELSIF p_verdict = 'inconclusive' THEN
      UPDATE public.publication_publish_attempts
      SET verification_attempts = verification_attempts + 1, last_verified_at = now()
      WHERE id = p_attempt_id;
    ELSE
      RETURN 'invalid_payload';
    END IF;
  EXCEPTION WHEN check_violation THEN
    RETURN 'invalid_payload';
  END;
  RETURN 'ok';
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_attempt_mark_stale(p_attempt_id uuid, p_stale_before timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_stale_before IS NULL OR p_stale_before > now() - interval '2 minutes' THEN
    RETURN false;
  END IF;
  UPDATE public.publication_publish_attempts
  SET status = 'unknown', error_code = 'PUBLISH_OUTCOME_UNKNOWN', retryable = false,
      verification_required = true, finished_at = now()
  WHERE id = p_attempt_id AND status = 'publishing' AND started_at < p_stale_before;
  RETURN FOUND;
END;
$$;

-- ─── Privileges ──────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.meta_connections_reset_publishing() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.meta_publishing_consent_forget() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.meta_connections_drop_publishing_consent() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.publish_attempts_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.meta_publish_channel_issue(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.publication_publish_gate(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.meta_begin_publishing_consent(uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_consume_publishing_state(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_discard_publishing_state(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_store_publishing_consent(uuid, text, text, timestamptz, text, text[], jsonb, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_complete_publishing_consent(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.meta_publish_capabilities(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publication_publish_preflight(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_attempt_begin(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_attempt_finish(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_attempt_record_verification(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_attempt_mark_stale(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.meta_begin_publishing_consent(uuid, uuid, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_consume_publishing_state(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_discard_publishing_state(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_store_publishing_consent(uuid, text, text, timestamptz, text, text[], jsonb, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_complete_publishing_consent(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.meta_publish_capabilities(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.publication_publish_preflight(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_attempt_begin(uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_attempt_finish(uuid, uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_attempt_record_verification(uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_attempt_mark_stale(uuid, timestamptz) TO service_role;
