/*
# A3.7.4.3 Gate A — Instagram two-step publishing state + derivable image preflight

## Plain-English summary
Instagram publishing needs two separate requests to Meta: first an image "container" is created,
then that container is published. This migration lets an Instagram publish attempt remember how far
it got (and the container id Meta returned) so an interrupted attempt can never be retried blindly.
Facebook attempts are untouched: they can never carry these new fields.

## 1. Modified table: publication_publish_attempts (additive only)
- `meta_container_id` (text, nullable) — the Instagram container (creation) id. Numeric only. Write-once.
- `external_stage` (text, NOT NULL, default 'none') — write-ahead marker of the furthest external step:
  - `none`                — nothing has been requested from Meta
  - `container_requested` — POST /{ig-user}/media is about to be / has been sent (outcome may be unknown)
  - `container_created`   — Meta returned a container id (stored in meta_container_id); no publish requested
  - `publish_requested`   — POST /{ig-user}/media_publish is about to be / has been sent (a public post MAY exist)
- New check `publish_attempts_stage_shape`:
  - Facebook rows: external_stage = 'none' AND meta_container_id IS NULL (always).
  - Instagram rows: container id present exactly when stage is container_created/publish_requested;
    a succeeded Instagram attempt must have reached publish_requested.
- The frozen `publish_attempts_state_shape` check is NOT changed.

## 2. Modified trigger function: publish_attempts_guard
- Inserts must start at stage 'none' without a container id.
- The container id can never be changed once set; the stage can never move backwards.
- New narrowly-scoped transition publishing -> publishing, allowed ONLY for Instagram, ONLY to move the
  stage exactly one step forward, and ONLY when no other column changes.
- Finishing / verification transitions can no longer alter stage or container id (evidence preserved).
- All previous rules (identity immutability, allowed status transitions, verification requirement) unchanged.

## 3. New function: publish_attempt_advance(user, attempt, stage, container_id)
- SECURITY DEFINER, search_path '', EXECUTE revoked from PUBLIC/anon/authenticated, granted to service_role.
- Verifies owner, channel = instagram, status = publishing, strictly next stage, container id write-once.

## 4. New function: instagram_image_derivable(mime, width, height)
- True when the private original (JPEG or PNG) can be turned server-side into a compliant Instagram JPEG
  (centre-crop to 4:5..1.91:1, width 320..1440). Uploads are already >= 320 px per side, so cropped width
  is always >= 320 in either orientation. Source capped at 25 MP so decoding stays within edge memory.

## 5. Modified function: publication_publish_gate
- Only the Instagram image clause changes: "original must be JPEG with ratio 0.8..1.91" becomes
  "original must be derivable" (section 4). Facebook logic is byte-for-byte the same.

## 6. Storage: new private bucket `instagram-derivatives`
- public = false, JPEG only, 8 MiB. No storage policies are created, so only the service role can touch it.
  Temporary signed URLs (10 minutes) are created server-side only for Meta to fetch the derivative.

## Important notes
1. No existing row is modified; the single Facebook attempt satisfies the new constraint with defaults.
2. No data is dropped, no column type changes.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='publication_publish_attempts' AND column_name='meta_container_id') THEN
    ALTER TABLE public.publication_publish_attempts ADD COLUMN meta_container_id text NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='publication_publish_attempts' AND column_name='external_stage') THEN
    ALTER TABLE public.publication_publish_attempts ADD COLUMN external_stage text NOT NULL DEFAULT 'none';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='publish_attempts_container_id_format') THEN
    ALTER TABLE public.publication_publish_attempts ADD CONSTRAINT publish_attempts_container_id_format
      CHECK (meta_container_id IS NULL OR meta_container_id ~ '^[0-9]{1,32}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='publish_attempts_external_stage_values') THEN
    ALTER TABLE public.publication_publish_attempts ADD CONSTRAINT publish_attempts_external_stage_values
      CHECK (external_stage IN ('none', 'container_requested', 'container_created', 'publish_requested'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='publish_attempts_stage_shape') THEN
    ALTER TABLE public.publication_publish_attempts ADD CONSTRAINT publish_attempts_stage_shape CHECK (
      (channel = 'facebook' AND external_stage = 'none' AND meta_container_id IS NULL)
      OR (channel = 'instagram'
        AND ((external_stage IN ('none', 'container_requested') AND meta_container_id IS NULL)
          OR (external_stage IN ('container_created', 'publish_requested') AND meta_container_id IS NOT NULL))
        AND (status <> 'succeeded' OR external_stage = 'publish_requested'))
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.publish_attempts_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
v_old_rank integer;
v_new_rank integer;
BEGIN
IF TG_OP = 'INSERT' THEN
IF NEW.status <> 'publishing' THEN
RAISE EXCEPTION 'publish_attempt_must_start_publishing';
END IF;
IF NEW.external_stage <> 'none' OR NEW.meta_container_id IS NOT NULL THEN
RAISE EXCEPTION 'publish_attempt_must_start_without_stage';
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
IF OLD.meta_container_id IS NOT NULL AND NEW.meta_container_id IS DISTINCT FROM OLD.meta_container_id THEN
RAISE EXCEPTION 'publish_attempt_container_immutable';
END IF;
v_old_rank := CASE OLD.external_stage WHEN 'none' THEN 0 WHEN 'container_requested' THEN 1 WHEN 'container_created' THEN 2 ELSE 3 END;
v_new_rank := CASE NEW.external_stage WHEN 'none' THEN 0 WHEN 'container_requested' THEN 1 WHEN 'container_created' THEN 2 ELSE 3 END;
IF v_new_rank < v_old_rank THEN
RAISE EXCEPTION 'publish_attempt_stage_backwards';
END IF;
IF OLD.status = 'publishing' AND NEW.status = 'publishing' THEN
IF NEW.channel <> 'instagram' OR v_new_rank <> v_old_rank + 1
OR NEW.meta_object_id IS DISTINCT FROM OLD.meta_object_id OR NEW.permalink IS DISTINCT FROM OLD.permalink
OR NEW.error_code IS DISTINCT FROM OLD.error_code OR NEW.finished_at IS DISTINCT FROM OLD.finished_at
OR NEW.retryable <> OLD.retryable OR NEW.verification_required <> OLD.verification_required
OR NEW.verification_attempts <> OLD.verification_attempts
OR NEW.last_verified_at IS DISTINCT FROM OLD.last_verified_at THEN
RAISE EXCEPTION 'publish_attempt_invalid_transition';
END IF;
NEW.updated_at := now();
RETURN NEW;
END IF;
IF NEW.external_stage <> OLD.external_stage OR NEW.meta_container_id IS DISTINCT FROM OLD.meta_container_id THEN
RAISE EXCEPTION 'publish_attempt_stage_frozen';
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
$function$;

CREATE OR REPLACE FUNCTION public.publish_attempt_advance(p_user_id uuid, p_attempt_id uuid, p_stage text, p_container_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
v_channel text;
v_status text;
v_stage text;
v_from integer;
v_to integer;
BEGIN
SELECT a.channel, a.status, a.external_stage INTO v_channel, v_status, v_stage
FROM public.publication_publish_attempts a
WHERE a.id = p_attempt_id AND a.user_id = p_user_id
FOR UPDATE;
IF NOT FOUND THEN
RETURN 'not_found';
END IF;
IF v_channel <> 'instagram' THEN
RETURN 'invalid_channel';
END IF;
IF v_status <> 'publishing' THEN
RETURN 'invalid_transition';
END IF;
v_from := CASE v_stage WHEN 'none' THEN 0 WHEN 'container_requested' THEN 1 WHEN 'container_created' THEN 2 ELSE 3 END;
v_to := CASE p_stage WHEN 'container_requested' THEN 1 WHEN 'container_created' THEN 2 WHEN 'publish_requested' THEN 3 ELSE NULL END;
IF v_to IS NULL THEN
RETURN 'invalid_payload';
END IF;
IF v_to <> v_from + 1 THEN
RETURN 'invalid_transition';
END IF;
IF p_stage = 'container_created' THEN
IF p_container_id IS NULL OR p_container_id !~ '^[0-9]{1,32}$' THEN
RETURN 'invalid_payload';
END IF;
ELSIF p_container_id IS NOT NULL THEN
RETURN 'invalid_payload';
END IF;
UPDATE public.publication_publish_attempts
SET external_stage = p_stage,
meta_container_id = CASE WHEN p_stage = 'container_created' THEN p_container_id ELSE meta_container_id END
WHERE id = p_attempt_id;
RETURN 'ok';
END;
$function$;

REVOKE ALL ON FUNCTION public.publish_attempt_advance(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_attempt_advance(uuid, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.instagram_image_derivable(p_mime text, p_width integer, p_height integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
SELECT COALESCE(
p_mime IN ('image/jpeg', 'image/png')
AND p_width BETWEEN 320 AND 8192
AND p_height BETWEEN 320 AND 8192
AND p_width::bigint * p_height::bigint <= 25000000,
false);
$function$;

REVOKE ALL ON FUNCTION public.instagram_image_derivable(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.instagram_image_derivable(text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.publication_publish_gate(p_user_id uuid, p_publication_id uuid, p_channel text, p_expected_version integer)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
v_pub public.publications%ROWTYPE;
v_draft public.publication_drafts%ROWTYPE;
v_attempt text;
v_text text;
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
IF NOT public.instagram_image_derivable(v_pub.image_mime, v_pub.image_width, v_pub.image_height) THEN
RETURN 'IMAGE_UNSUPPORTED';
END IF;
END IF;

RETURN public.meta_publish_channel_issue(p_user_id, v_pub.business_id, p_channel);
END;
$function$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('instagram-derivatives', 'instagram-derivatives', false, 8388608, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;
