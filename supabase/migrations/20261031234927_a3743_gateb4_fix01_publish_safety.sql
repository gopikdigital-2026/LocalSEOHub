/*
# A3.7.4.3 Gate B.4 FIX01 — Instagram publish safety hardening (PREPARED, NOT APPLIED)

Forward-only. Kept outside supabase/migrations/ until separately authorized; to apply, it must be
submitted unchanged through the migration tool. Replaces four existing functions; no tables,
columns, data, policies or grants change.

1. publish_attempt_record_verification
   - Reads status and external_stage under the same FOR UPDATE row lock.
   - Verdict 'absent' is refused ('unsafe_absent', row untouched) when the locked stage is
     'publish_requested': /media_publish may have been reached, so absence can never be proven.
   - Facebook attempts never leave stage 'none', so their behaviour is unchanged.

2. publish_attempt_finish
   - Under the row lock, any 'failed' outcome for an attempt whose stage is 'publish_requested'
     is stored as 'unknown' (PUBLISH_OUTCOME_UNKNOWN, retryable=false, verification_required=true)
     and returns 'ok_unknown'. Facebook (stage 'none') is unchanged.

3. publish_attempt_begin
   - Instagram only: requires public.internal_test_entitlement_active(p_user_id) after the
     publication row lock and before the gate; otherwise returns 'PERMISSION_REQUIRED' and no
     attempt is created. The Facebook path is unchanged.

4. publish_attempts_guard (trigger)
   - Additional invariant independent of every function: a row whose OLD.external_stage is
     'publish_requested' can never become 'failed' (raises publish_attempt_outcome_unprovable).

## Security
- All functions keep SECURITY DEFINER and an empty search_path.
- EXECUTE privileges are re-asserted exactly as before: service_role only for RPCs; the trigger
  function is not executable by any API role.
- RLS and table grants are untouched.
*/

CREATE OR REPLACE FUNCTION public.publish_attempt_record_verification(
  p_user_id uuid, p_attempt_id uuid, p_verdict text, p_meta_object_id text, p_permalink text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_status text; v_stage text;
BEGIN
  SELECT a.status, a.external_stage INTO v_status, v_stage FROM public.publication_publish_attempts a
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
      IF v_stage = 'publish_requested' THEN
        RETURN 'unsafe_absent';
      END IF;
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

CREATE OR REPLACE FUNCTION public.publish_attempt_finish(
  p_user_id uuid, p_attempt_id uuid, p_outcome text,
  p_meta_object_id text, p_permalink text, p_error_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_status text; v_stage text;
BEGIN
  SELECT a.status, a.external_stage INTO v_status, v_stage FROM public.publication_publish_attempts a
  WHERE a.id = p_attempt_id AND a.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_status <> 'publishing' THEN
    RETURN 'invalid_transition';
  END IF;
  BEGIN
    IF p_outcome = 'failed' AND v_stage = 'publish_requested' THEN
      UPDATE public.publication_publish_attempts
      SET status = 'unknown', error_code = 'PUBLISH_OUTCOME_UNKNOWN', retryable = false,
          verification_required = true, finished_at = now()
      WHERE id = p_attempt_id;
      RETURN 'ok_unknown';
    ELSIF p_outcome = 'succeeded' THEN
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
  IF p_channel = 'instagram' AND public.internal_test_entitlement_active(p_user_id) IS NOT TRUE THEN
    RETURN QUERY SELECT 'PERMISSION_REQUIRED'::text, NULL::uuid, NULL::integer, NULL::text,
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
IF OLD.external_stage = 'publish_requested' AND NEW.status = 'failed' THEN
RAISE EXCEPTION 'publish_attempt_outcome_unprovable';
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

REVOKE ALL ON FUNCTION public.publish_attempts_guard() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.publish_attempt_begin(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_attempt_finish(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_attempt_record_verification(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_attempt_begin(uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_attempt_finish(uuid, uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_attempt_record_verification(uuid, uuid, text, text, text) TO service_role;
