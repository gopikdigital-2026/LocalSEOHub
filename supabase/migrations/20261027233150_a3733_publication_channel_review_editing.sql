/*
# A3.7.3.3 - Channel review, safe editing and final draft foundation

## 1. What this does
Adds ONE narrow, server-owned write path that lets the owner of a publication edit (or restore)
the final Facebook and Instagram texts of an already-adapted draft. No AI is called, no usage is
reserved, nothing is published. No table, column, policy or grant of the frozen A3.7.3.1 /
A3.7.3.2 objects is changed.

## 2. Data model (reused, unchanged)
`publication_drafts`:
- `facebook_generated`, `instagram_generated` - immutable AI adaptation (written only by the
  frozen A3.7.3.2 `complete_publication_adaptation`). This function NEVER writes them.
- `facebook_text`, `instagram_text` - the user's final, editable texts. This function writes
  only these, plus `version` (+1) and `updated_at`.

## 3. New function
`save_publication_channel_drafts(p_publication_id uuid, p_expected_version integer,
  p_facebook text, p_instagram text, p_restore_facebook boolean, p_restore_instagram boolean)`
-> jsonb `{result, ...}`.
- Per channel: text = set this text; NULL = keep current; restore = copy the generated text.
- Results: `saved`, `unchanged`, `unauthenticated`, `not_found`, `forbidden`, `not_ready`,
  `busy`, `stale_draft`, `invalid_payload`, `payload_too_large`, `invalid_facebook_text`,
  `invalid_instagram_text` (with `reason`: empty, too_long, control_chars, markup).

## 4. Security
1. SECURITY DEFINER with fixed search_path; actor is always `auth.uid()`.
2. Publication must belong to the caller; another owner's publication returns `not_found`
   (no existence oracle). Business must belong to the caller, else `forbidden`.
3. No identifier other than the publication id is accepted; ownership, business, source
   snapshot, generated texts, claim and usage columns cannot be set by the caller.
4. Optimistic concurrency: rows are locked (publication then draft, same order as
   `select_publication_proposal`) and the UPDATE also requires `version = p_expected_version`.
5. Refuses while an adaptation claim is active (`busy`) so an in-flight adaptation is never
   invalidated after its AI usage was counted.
6. EXECUTE revoked from PUBLIC and anon; granted to authenticated only. The text helper is not
   callable by any client role.

## 5. Text validation (technical safety only, not content moderation)
Human edits may contain prices, hours, phones, URLs, dates, offers. Rejected only: empty or
whitespace-only, over the DB limits (Facebook 5000, Instagram 2200 characters), control
characters other than tab/newline, bidi override characters, and HTML-like tags (`<` directly
followed by a letter, `/` or `!`). CRLF is normalised to LF. Each field is capped at 32 KB before
any other check (`payload_too_large`).
*/

CREATE OR REPLACE FUNCTION public.publication_channel_text_issue(p_text text, p_max integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_text IS NULL OR btrim(p_text, E' \t\n\r') = '' THEN 'empty'
    WHEN char_length(p_text) > p_max THEN 'too_long'
    WHEN translate(p_text, E'\t\n', '') ~ '[[:cntrl:]]'
      OR p_text ~ '[\u200E\u200F\u202A-\u202E\u2066-\u2069]' THEN 'control_chars'
    WHEN p_text ~ '<[/!]?[A-Za-z]' THEN 'markup'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.publication_channel_text_issue(text, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_publication_channel_drafts(
  p_publication_id uuid,
  p_expected_version integer,
  p_facebook text DEFAULT NULL,
  p_instagram text DEFAULT NULL,
  p_restore_facebook boolean DEFAULT false,
  p_restore_instagram boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_pub public.publications;
  v_draft public.publication_drafts;
  v_fb text;
  v_ig text;
  v_issue text;
  v_version integer;
  v_updated timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('result', 'unauthenticated');
  END IF;
  IF p_publication_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_restore_facebook IS NULL OR p_restore_instagram IS NULL
     OR (p_restore_facebook AND p_facebook IS NOT NULL)
     OR (p_restore_instagram AND p_instagram IS NOT NULL)
     OR (p_facebook IS NULL AND p_instagram IS NULL AND NOT p_restore_facebook AND NOT p_restore_instagram) THEN
    RETURN jsonb_build_object('result', 'invalid_payload');
  END IF;
  IF coalesce(octet_length(p_facebook), 0) > 32768 OR coalesce(octet_length(p_instagram), 0) > 32768 THEN
    RETURN jsonb_build_object('result', 'payload_too_large');
  END IF;

  SELECT * INTO v_pub FROM public.publications
    WHERE id = p_publication_id AND user_id = v_uid
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = v_pub.business_id AND user_id = v_uid) THEN
    RETURN jsonb_build_object('result', 'forbidden');
  END IF;
  IF v_pub.status <> 'proposals_ready' OR v_pub.proposal_generation_id IS NULL THEN
    RETURN jsonb_build_object('result', 'not_ready');
  END IF;

  SELECT * INTO v_draft FROM public.publication_drafts
    WHERE publication_id = v_pub.id AND user_id = v_uid AND business_id = v_pub.business_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'not_found');
  END IF;
  IF v_draft.source_generation_id IS DISTINCT FROM v_pub.proposal_generation_id THEN
    RETURN jsonb_build_object('result', 'stale_draft', 'version', v_draft.version);
  END IF;
  IF v_draft.facebook_generated IS NULL OR v_draft.instagram_generated IS NULL
     OR v_draft.facebook_text IS NULL OR v_draft.instagram_text IS NULL THEN
    RETURN jsonb_build_object('result', 'not_ready');
  END IF;
  IF v_draft.adaptation_claim_id IS NOT NULL
     AND v_draft.adaptation_claimed_at > now() - interval '3 minutes' THEN
    RETURN jsonb_build_object('result', 'busy', 'version', v_draft.version);
  END IF;
  IF v_draft.version <> p_expected_version THEN
    RETURN jsonb_build_object('result', 'stale_draft', 'version', v_draft.version);
  END IF;

  v_fb := CASE
    WHEN p_restore_facebook THEN v_draft.facebook_generated
    WHEN p_facebook IS NULL THEN v_draft.facebook_text
    ELSE replace(replace(p_facebook, E'\r\n', E'\n'), E'\r', E'\n')
  END;
  v_ig := CASE
    WHEN p_restore_instagram THEN v_draft.instagram_generated
    WHEN p_instagram IS NULL THEN v_draft.instagram_text
    ELSE replace(replace(p_instagram, E'\r\n', E'\n'), E'\r', E'\n')
  END;

  v_issue := public.publication_channel_text_issue(v_fb, 5000);
  IF v_issue IS NOT NULL THEN
    RETURN jsonb_build_object('result', 'invalid_facebook_text', 'reason', v_issue);
  END IF;
  v_issue := public.publication_channel_text_issue(v_ig, 2200);
  IF v_issue IS NOT NULL THEN
    RETURN jsonb_build_object('result', 'invalid_instagram_text', 'reason', v_issue);
  END IF;

  IF v_fb = v_draft.facebook_text AND v_ig = v_draft.instagram_text THEN
    RETURN jsonb_build_object(
      'result', 'unchanged',
      'draft', jsonb_build_object(
        'version', v_draft.version, 'updated_at', v_draft.updated_at,
        'facebook_text', v_draft.facebook_text, 'instagram_text', v_draft.instagram_text,
        'facebook_generated', v_draft.facebook_generated, 'instagram_generated', v_draft.instagram_generated));
  END IF;

  UPDATE public.publication_drafts SET
    facebook_text = v_fb,
    instagram_text = v_ig,
    version = v_draft.version + 1,
    updated_at = now()
  WHERE publication_id = v_pub.id AND version = p_expected_version
  RETURNING version, updated_at INTO v_version, v_updated;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result', 'stale_draft');
  END IF;

  RETURN jsonb_build_object(
    'result', 'saved',
    'draft', jsonb_build_object(
      'version', v_version, 'updated_at', v_updated,
      'facebook_text', v_fb, 'instagram_text', v_ig,
      'facebook_generated', v_draft.facebook_generated, 'instagram_generated', v_draft.instagram_generated));
END;
$$;

REVOKE ALL ON FUNCTION public.save_publication_channel_drafts(uuid, integer, text, text, boolean, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_publication_channel_drafts(uuid, integer, text, text, boolean, boolean) TO authenticated;
