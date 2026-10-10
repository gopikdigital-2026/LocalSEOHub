/*
# FIX 07.2.1 - Defensive validation for business improvement reservations

Hardens the database side of "Mejora tu negocio en 2 minutos" so the reservation
function decides on its own which recommendations, text types and keys are allowed,
instead of trusting what the server function sends.

1. New helper functions (internal, not callable from the browser)
- `business_improvement_rule_kind(rule_id)`: the single, explicit mapping of the three
  compatible rules to the text type they may produce. Any other rule returns NULL.
    optimize_services_keywords  -> business_description
    improve_service_description -> service_description
    write_faq_answers           -> faq
- `business_improvement_key_part(text)`: the service-key normalisation, identical to the
  app's (control characters to spaces, collapse whitespace, trim, max 80 chars, then
  NFKC, lowercase, collapse whitespace, trim, max 100 chars). Equivalent spellings of a
  service ("Tartas", " TARTAS ", "Ｔａｒｔａｓ") produce the same key.

2. Modified function
- `reserve_business_improvement(...)` (same 7-argument signature) now also refuses
  ('invalid') when:
  a. the action's rule is not one of the three compatible rules;
  b. the requested kind differs from the kind authorised for that rule;
  c. the semantic key is not exactly the key derived by the database from the action:
     the rule id itself, or for service descriptions `rule_id:` + the normalised
     service stored in the action's evidence;
  d. for service descriptions, the service is not among the first 8 non-empty services
     the owner declared on the business (same rule as the server function);
  e. an existing draft row for the key has a different kind.
  It also caps service-description drafts at 16 per business ('limit'), so rotating
  service names cannot create unlimited counters. Every previous rule is unchanged:
  ownership, open action status, 3 versions, 6 attempts, 90 s lease, unique token,
  owner-edit protection and the 40 requests per user per month cap.

3. Security
- No table, column, policy or grant on tables changes.
- The three RPC functions remain executable only by service_role; the two helpers are
  revoked from PUBLIC, anon and authenticated.

4. Important notes
1. Incremental and idempotent (CREATE OR REPLACE, same signatures, re-runnable).
2. Migration history: 20261010131105 (first version, 6-argument reserve, superseded) and
   20261010131430 (7-argument reserve) both stay recorded. Applied in order on a clean
   install they produce the same objects as the current database; this migration then
   gives both paths the same final definition of reserve_business_improvement.
3. Current definitions after this migration:
   - reserve_business_improvement(uuid, uuid, uuid, text, text, integer, boolean): this file.
   - complete_business_improvement(uuid, uuid, uuid, text, text, text, text): 20261010131430.
   - release_business_improvement(uuid, uuid, uuid): 20261010131430.
   - business_improvement_drafts_before_update(): 20261010131430 (same as 20261010131105).
   - Tables, constraints, indexes, policies and grants: 20261010131105 (unchanged by later files).
4. No data is modified; there were no drafts at the time of writing.
*/

CREATE OR REPLACE FUNCTION public.business_improvement_rule_kind(p_rule_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_rule_id
    WHEN 'optimize_services_keywords' THEN 'business_description'
    WHEN 'improve_service_description' THEN 'service_description'
    WHEN 'write_faq_answers' THEN 'faq'
  END;
$$;

CREATE OR REPLACE FUNCTION public.business_improvement_key_part(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT left(btrim(regexp_replace(lower(normalize(
    regexp_replace(
      left(btrim(regexp_replace(regexp_replace(coalesce(p_text, ''), '[\x01-\x1f\x7f]', ' ', 'g'), '\s+', ' ', 'g')), 80),
      '[\x01-\x1f\x7f]', ' ', 'g'),
    NFKC)), '\s+', ' ', 'g')), 100);
$$;

CREATE OR REPLACE FUNCTION public.reserve_business_improvement(
  p_user_id uuid, p_business_id uuid, p_action_id uuid, p_semantic_key text, p_kind text,
  p_expected_generations integer, p_allow_overwrite boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.business_improvement_drafts;
  v_action public.business_actions;
  v_kind text;
  v_service_part text;
  v_expected_key text;
  v_token uuid := gen_random_uuid();
  v_period date := date_trunc('month', timezone('utc', now()))::date;
  v_used integer;
BEGIN
  IF p_user_id IS NULL OR p_business_id IS NULL OR p_action_id IS NULL OR p_semantic_key IS NULL
     OR char_length(p_semantic_key) NOT BETWEEN 1 AND 160
     OR p_kind IS NULL OR p_kind NOT IN ('business_description', 'service_description', 'faq') THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.businesses WHERE id = p_business_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT * INTO v_action FROM public.business_actions
  WHERE id = p_action_id AND user_id = p_user_id AND business_id = p_business_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  v_kind := public.business_improvement_rule_kind(v_action.rule_id);
  IF v_kind IS NULL OR v_kind <> p_kind THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  IF v_kind = 'service_description' THEN
    IF jsonb_typeof(v_action.metadata -> 'evidence' -> 'service') IS DISTINCT FROM 'string' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    v_service_part := public.business_improvement_key_part(v_action.metadata -> 'evidence' ->> 'service');
    IF v_service_part = '' THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM (
        SELECT public.business_improvement_key_part(s) AS k
        FROM public.businesses b, unnest(coalesce(b.services, '{}'::text[])) WITH ORDINALITY AS u(s, ord)
        WHERE b.id = p_business_id AND public.business_improvement_key_part(s) <> ''
        ORDER BY ord
        LIMIT 8
      ) declared
      WHERE declared.k = v_service_part
    ) THEN
      RETURN jsonb_build_object('status', 'invalid');
    END IF;
    v_expected_key := v_action.rule_id || ':' || v_service_part;
  ELSE
    v_expected_key := v_action.rule_id;
  END IF;

  IF p_semantic_key <> v_expected_key THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF v_action.status NOT IN ('PENDING', 'IN_PROGRESS') THEN
    RETURN jsonb_build_object('status', 'closed');
  END IF;

  IF v_kind = 'service_description'
     AND NOT EXISTS (SELECT 1 FROM public.business_improvement_drafts WHERE business_id = p_business_id AND semantic_key = p_semantic_key)
     AND (SELECT count(*) FROM public.business_improvement_drafts WHERE business_id = p_business_id AND kind = 'service_description') >= 16 THEN
    RETURN jsonb_build_object('status', 'limit', 'generations', 0);
  END IF;

  INSERT INTO public.business_improvement_drafts (user_id, business_id, semantic_key, kind, action_id)
  VALUES (p_user_id, p_business_id, p_semantic_key, v_kind, p_action_id)
  ON CONFLICT (business_id, semantic_key) DO NOTHING;

  SELECT * INTO v_row FROM public.business_improvement_drafts
  WHERE business_id = p_business_id AND semantic_key = p_semantic_key
  FOR UPDATE;

  IF v_row.user_id <> p_user_id THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF v_row.kind <> v_kind THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;
  IF p_expected_generations IS DISTINCT FROM v_row.generations THEN
    RETURN jsonb_build_object('status', 'stale', 'generations', v_row.generations);
  END IF;
  IF v_row.generations >= 3 THEN
    RETURN jsonb_build_object('status', 'limit', 'generations', v_row.generations);
  END IF;
  IF v_row.generating_since IS NOT NULL AND v_row.generating_since > now() - interval '90 seconds' THEN
    RETURN jsonb_build_object('status', 'busy', 'generations', v_row.generations);
  END IF;
  IF v_row.attempts >= 6 THEN
    RETURN jsonb_build_object('status', 'attempts', 'generations', v_row.generations, 'attempts', v_row.attempts);
  END IF;
  IF v_row.edited_at IS NOT NULL AND p_allow_overwrite IS NOT TRUE THEN
    RETURN jsonb_build_object('status', 'edited', 'generations', v_row.generations);
  END IF;

  INSERT INTO public.business_improvement_usage AS u (user_id, period_start, requests)
  VALUES (p_user_id, v_period, 1)
  ON CONFLICT (user_id, period_start)
  DO UPDATE SET requests = u.requests + 1, updated_at = now()
  WHERE u.requests < 40
  RETURNING u.requests INTO v_used;

  IF v_used IS NULL THEN
    RETURN jsonb_build_object('status', 'global', 'generations', v_row.generations);
  END IF;

  UPDATE public.business_improvement_drafts
  SET generating_since = now(), reservation_id = v_token, attempts = attempts + 1, action_id = p_action_id
  WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'status', 'reserved', 'id', v_row.id, 'reservation', v_token,
    'generations', v_row.generations, 'attempts', v_row.attempts + 1, 'global_used', v_used
  );
END;
$$;

DROP FUNCTION IF EXISTS public.reserve_business_improvement(uuid, uuid, uuid, text, text, integer);

REVOKE ALL ON FUNCTION public.business_improvement_rule_kind(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_improvement_key_part(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_business_improvement(uuid, uuid, uuid, text, text, integer, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_business_improvement(uuid, uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_business_improvement(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_improvement_rule_kind(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.business_improvement_key_part(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_business_improvement(uuid, uuid, uuid, text, text, integer, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_business_improvement(uuid, uuid, uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_business_improvement(uuid, uuid, uuid) TO service_role;
