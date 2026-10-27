/*
# A3.7.3.1 - Proposal selection & channel draft data foundation

## 1. Purpose
Lets the owner of a publication pick one of its three AI proposals. The pick is stored as a
server-side snapshot so it survives later proposal deletion, and it is the future anchor for
channel (Facebook / Instagram) adaptation. No AI is called and nothing is published anywhere.

## 2. New table `publication_drafts` (1:1 with `publications`)
- `publication_id` (uuid, primary key, FK publications ON DELETE CASCADE) - one draft per publication.
- `user_id` (uuid, FK auth.users ON DELETE CASCADE) - owner, copied from the publication by the server.
- `business_id` (uuid, FK businesses ON DELETE CASCADE) - tenant scope, copied from the publication;
  kept for tenant-level queries and cascades, consistent with `publications`.
- `source_generation_id`, `source_position`, `source_role`, `source_lang`, `source_body`, `source_cta`
  - exact snapshot of the selected proposal (same CHECKs as `publication_proposals`).
- `selected_at` - when the current selection was made.
- `facebook_generated`, `facebook_text`, `instagram_generated`, `instagram_text`, `adapted_at`
  - reserved for A3.7.3.2+; always NULL in this phase and cleared whenever the selection changes.
- `version` (integer >= 1) - optimistic-concurrency version; +1 exactly once per changed selection.
- `adaptation_claim_id`, `adaptation_claimed_at` - reserved single-flight claim for a future adaptation
  run; a claim younger than 3 minutes blocks a selection change (returns `busy`).
- `adaptations_used` (integer >= 0) - reserved per-draft adaptation counter; not reset by a selection
  change so flipping the selection can never reset a future per-draft cap.
- `created_at`, `updated_at`.

## 3. Modified objects
- `publications`: NO column, constraint, grant or existing trigger changes. One new AFTER UPDATE trigger
  `publications_invalidate_draft` deletes the draft when `proposal_generation_id` or `image_path`
  changes (regeneration or photo replacement), so a draft can never masquerade as current.
  Deleting a publication cascades to its draft through the FK.

## 4. New function `select_publication_proposal(p_publication_id, p_position, p_expected_generation_id)`
SECURITY DEFINER, `search_path = public`, uses `auth.uid()`; EXECUTE only for `authenticated`.
Locks the publication FOR UPDATE, requires owner + `proposals_ready` + matching generation + existing
proposal of the current generation, and copies the snapshot server-side. Returns jsonb
`{result, version}` where result is one of: `selected`, `unchanged`, `unauthenticated`, `not_found`
(missing or foreign - indistinguishable), `not_ready`, `stale_generation`, `invalid_position`,
`proposal_not_found`, `busy`.

## 5. Security
- RLS enabled. Only policy: owner SELECT (`auth.uid() = user_id`) for `authenticated`.
- All default privileges revoked from PUBLIC/anon/authenticated; `authenticated` gets SELECT only;
  `service_role` gets SELECT only. No client INSERT/UPDATE/DELETE: writes happen only inside the
  SECURITY DEFINER function and trigger.
- The trigger function is not callable as an RPC (EXECUTE revoked from everyone).

## 6. Data safety
Purely additive. No existing row, column, constraint, policy or function is changed or dropped.
*/

CREATE TABLE IF NOT EXISTS public.publication_drafts (
  publication_id uuid PRIMARY KEY REFERENCES public.publications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  source_generation_id uuid NOT NULL,
  source_position smallint NOT NULL,
  source_role text NOT NULL,
  source_lang text NOT NULL,
  source_body text NOT NULL,
  source_cta text NOT NULL,
  selected_at timestamptz NOT NULL DEFAULT now(),
  facebook_generated text,
  facebook_text text,
  instagram_generated text,
  instagram_text text,
  adapted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  adaptation_claim_id uuid,
  adaptation_claimed_at timestamptz,
  adaptations_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_drafts_source_role_check CHECK (
    (source_position = 1 AND source_role = 'direct')
    OR (source_position = 2 AND source_role = 'close')
    OR (source_position = 3 AND source_role = 'professional')
  ),
  CONSTRAINT publication_drafts_source_lang_check CHECK (source_lang IN ('es', 'en')),
  CONSTRAINT publication_drafts_source_body_check CHECK (char_length(source_body) BETWEEN 1 AND 1000),
  CONSTRAINT publication_drafts_source_cta_check CHECK (char_length(source_cta) BETWEEN 1 AND 120),
  CONSTRAINT publication_drafts_facebook_len CHECK (
    (facebook_generated IS NULL OR char_length(facebook_generated) BETWEEN 1 AND 5000)
    AND (facebook_text IS NULL OR char_length(facebook_text) BETWEEN 1 AND 5000)
  ),
  CONSTRAINT publication_drafts_instagram_len CHECK (
    (instagram_generated IS NULL OR char_length(instagram_generated) BETWEEN 1 AND 2200)
    AND (instagram_text IS NULL OR char_length(instagram_text) BETWEEN 1 AND 2200)
  ),
  CONSTRAINT publication_drafts_version_check CHECK (version >= 1),
  CONSTRAINT publication_drafts_adaptations_used_check CHECK (adaptations_used >= 0),
  CONSTRAINT publication_drafts_claim_pair CHECK (
    (adaptation_claim_id IS NULL) = (adaptation_claimed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS publication_drafts_user_idx ON public.publication_drafts (user_id);
CREATE INDEX IF NOT EXISTS publication_drafts_business_idx ON public.publication_drafts (business_id);

ALTER TABLE public.publication_drafts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.publication_drafts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.publication_drafts TO authenticated;
GRANT SELECT ON public.publication_drafts TO service_role;

DROP POLICY IF EXISTS "select_own_publication_drafts" ON public.publication_drafts;
CREATE POLICY "select_own_publication_drafts" ON public.publication_drafts FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.publication_drafts_invalidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.publication_drafts WHERE publication_id = NEW.id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.publication_drafts_invalidate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS publications_invalidate_draft ON public.publications;
CREATE TRIGGER publications_invalidate_draft
  AFTER UPDATE ON public.publications
  FOR EACH ROW
  WHEN (
    OLD.proposal_generation_id IS DISTINCT FROM NEW.proposal_generation_id
    OR OLD.image_path IS DISTINCT FROM NEW.image_path
  )
  EXECUTE FUNCTION public.publication_drafts_invalidate();

CREATE OR REPLACE FUNCTION public.select_publication_proposal(
  p_publication_id uuid, p_position integer, p_expected_generation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pub public.publications;
  v_prop public.publication_proposals;
  v_draft public.publication_drafts;
  v_version integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('result', 'unauthenticated');
  END IF;
  IF p_publication_id IS NULL THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;
  IF p_position IS NULL OR p_position NOT IN (1, 2, 3) THEN
    RETURN jsonb_build_object('result', 'invalid_position');
  END IF;

  SELECT * INTO v_pub FROM public.publications
    WHERE id = p_publication_id AND user_id = v_uid
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;

  IF v_pub.status <> 'proposals_ready' OR v_pub.proposal_generation_id IS NULL THEN
    RETURN jsonb_build_object('result', 'not_ready');
  END IF;
  IF p_expected_generation_id IS NULL
     OR v_pub.proposal_generation_id <> p_expected_generation_id THEN
    RETURN jsonb_build_object('result', 'stale_generation');
  END IF;

  SELECT * INTO v_prop FROM public.publication_proposals
    WHERE publication_id = v_pub.id
      AND position = p_position
      AND generation_id = v_pub.proposal_generation_id
      AND user_id = v_pub.user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'proposal_not_found');
  END IF;

  SELECT * INTO v_draft FROM public.publication_drafts
    WHERE publication_id = v_pub.id
    FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.publication_drafts (
      publication_id, user_id, business_id,
      source_generation_id, source_position, source_role, source_lang, source_body, source_cta
    ) VALUES (
      v_pub.id, v_pub.user_id, v_pub.business_id,
      v_prop.generation_id, v_prop.position, v_prop.role, v_prop.lang, v_prop.body, v_prop.cta
    )
    RETURNING version INTO v_version;
    RETURN jsonb_build_object('result', 'selected', 'version', v_version);
  END IF;

  IF v_draft.source_generation_id = v_prop.generation_id
     AND v_draft.source_position = v_prop.position THEN
    RETURN jsonb_build_object('result', 'unchanged', 'version', v_draft.version);
  END IF;

  IF v_draft.adaptation_claim_id IS NOT NULL
     AND v_draft.adaptation_claimed_at > now() - interval '3 minutes' THEN
    RETURN jsonb_build_object('result', 'busy', 'version', v_draft.version);
  END IF;

  UPDATE public.publication_drafts SET
    user_id = v_pub.user_id,
    business_id = v_pub.business_id,
    source_generation_id = v_prop.generation_id,
    source_position = v_prop.position,
    source_role = v_prop.role,
    source_lang = v_prop.lang,
    source_body = v_prop.body,
    source_cta = v_prop.cta,
    selected_at = now(),
    facebook_generated = NULL,
    facebook_text = NULL,
    instagram_generated = NULL,
    instagram_text = NULL,
    adapted_at = NULL,
    adaptation_claim_id = NULL,
    adaptation_claimed_at = NULL,
    version = v_draft.version + 1,
    updated_at = now()
  WHERE publication_id = v_pub.id
  RETURNING version INTO v_version;

  RETURN jsonb_build_object('result', 'selected', 'version', v_version);
END;
$$;

REVOKE ALL ON FUNCTION public.select_publication_proposal(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.select_publication_proposal(uuid, integer, uuid) TO authenticated;
