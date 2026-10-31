# A3.7.4.3 — Gate B.4 — FIX01 — AUTHORIZED FROZEN-CODE EXCEPTION — IMPLEMENTATION

Mode: controlled development-only security correction. Real Instagram publishing NOT authorized.
Nothing applied, deployed, activated or published. Publication D untouched.

Baseline: `localseohub-a3743-gateB4fix01.zip` (the FIX01 STOP delivery). Every "before" hash below was recomputed
from the bytes inside that ZIP; every "after" hash from the working tree.

## 1. Scope actually changed (complete list, from a recursive diff against the baseline)

| Path | Kind |
|---|---|
| supabase/functions/instagram-publishing/instagramPublish.ts | modified (IG only) |
| supabase/functions/instagram-publishing/index.ts | modified (IG only) |
| supabase/functions/instagram-publishing/graph.ts | modified (IG only) |
| supabase/functions/instagram-publishing/publishTarget.ts | NEW isolated helper |
| auditoria-a2/gate-b4-fix01-prepared/20261031190000_a3743_gateb4_fix01_publish_safety.sql | NEW prepared SQL (NOT applied, NOT in supabase/migrations) |
| src/features/publications/__tests__/gateB4Fix01DbModel.ts | NEW test model |
| src/features/publications/__tests__/a3743GateB4Fix01PublishSafety.test.ts | NEW tests (55) |
| src/features/publications/__tests__/a3743GateB4Fix01DatabaseAndFreeze.test.ts | NEW tests (31) |
| src/features/publications/__tests__/a3743InstagramGateA.test.ts | harness extension + T26 behavioural re-pin (F6) |
| src/features/publications/__tests__/a3743GateB2Part1Security.test.ts | harness extension only |
| src/features/publications/__tests__/a3743GateB3Fix01ConnectionPreflight.test.ts | hash re-pin only |
| src/features/publications/__tests__/a3743GateB3Fix02StatusAttemptGrant.test.ts | harness extension + hash re-pin |
| auditoria-a2/A3_7_4_3_GATE_B4_FIX01_EXCEPTION_*.md | these reports |

Unchanged: `shared.ts`, `derivative.ts`, `connectionPreflight.ts`, all of `supabase/functions/meta-publishing/**`
(Facebook), all of `src/**` UI, all 60 files in `supabase/migrations/`, all historical manifests and reports.

## 2. Before / after sha256 ledger

### 2.1 Production code
| File | Before | After |
|---|---|---|
| instagram-publishing/instagramPublish.ts | 5523a9c0481760a672e5d9373cd654f2af0a0c374614b39ca90e9682b95d63ca | df94b08fcbd2134d17a85a3ecdaefdfcdda51a36014771585a6510787ad200f1 |
| instagram-publishing/index.ts | f18551589ef75ad1ff9a6c4d55dd6b4bca8c7898a43f1ed2ff2a59c858780c28 | 6312ea2ebf7210d10e0319373d3cf48381e2925b23934a169a65b475334ea675 |
| instagram-publishing/graph.ts | 6a5909c494b09f653006affa8917cb7aa897b5ee9d2baa328aca24eb1416d28a | a107c840cba644967c9a911ef923755176de0b7674530372a506bdc1333bb61e |
| instagram-publishing/publishTarget.ts | (absent) | d58f363b11e2c02a027da341e0c46c97691fc0490d4435287442b09c16d1040d |
| instagram-publishing/shared.ts | 2de062eaf385236e303c043ff17434b45ff1d8b9200e12e65462bc8e95f623cd | unchanged |
| instagram-publishing/derivative.ts | be27cd6efba40260d86f09813316ccbcf36496de2615b62f1c3cb4e25f458dfa | unchanged |
| instagram-publishing/connectionPreflight.ts | b57c82c1d970ace3643b64de539ad5fdac8a2a3cb66d9e06e51a8570a356b9db | unchanged |
| meta-publishing/index.ts | 027ee4fe8f389fbb09b2d9d21efb105e5d14895141bdd98e5c7ab26cacfaab23 | unchanged |
| meta-publishing/handler.ts | b7525645c005ea3989609ea34800057cbcbb6ca51e65573c000ba7b7a41e1ffb | unchanged |
| meta-publishing/facebookPublish.ts | 48da8e2f81eb520dabb26c05932b039b4fe023138926b05218a458077b6628dd | unchanged |
| meta-publishing/facebookPhoto.ts | 7225bc3d5dd0493f41940e67207010db84e04231d475c2d33f79fd11b501726a | unchanged |

### 2.2 Prepared SQL
| File | sha256 |
|---|---|
| auditoria-a2/gate-b4-fix01-prepared/20261031190000_a3743_gateb4_fix01_publish_safety.sql (265 lines) | a3209acbc30f3a56c6c4d2260d023c1330d9966c5603552caba99e262bbb5981 |

### 2.3 Tests (§9 re-pin ledger)
| File | Before | After | Change |
|---|---|---|---|
| a3743InstagramGateA.test.ts | b1dc0995d8c2db7499dc94e48a8c6e3788cfb9e025c32b7c9136d160795ed617 | a88b6a9749aa843a19a209ca01dbf8c828b198941e7cf0aeaba603bfc6c77eb8 | harness: `target`, `entitlementActive`, `downloadDerivative`; T26 behavioural re-pin (F6) |
| a3743GateB2Part1Security.test.ts | e045fe5baa91b331f9d283a3064b8584c120f193b591cc1cdf4f96266ed5f813 | 1721fca93aa83834e109cec2b2e5615c4375aeb0014a677cd974a48fa5f6d7d5 | harness only (target pinned to its own fixture, entitlement true, derivative read-back map) |
| a3743GateB3Fix01ConnectionPreflight.test.ts | bfc651657f457752ca00ca0b98c0ed90d8edb13961514e24124c705c93c03855 | 1a41e4efbea11ab67de05461c498ffcc64efd43c725e25e476c21f6a568e32e7 | 2 stale fingerprints re-pinned |
| a3743GateB3Fix02StatusAttemptGrant.test.ts | a45d72aac1626b69b1026734e811cc52b44abdae674a0d781ee2fbb50bbe9246 | 882a12c692b3f20da332631304cc0daba35d0f6233b90d4fbd6c260cc6184e24 | harness (real APPROVED_TARGET; entitlement/derivative throw if touched during status) + 3 stale fingerprints re-pinned |
| gateB4Fix01DbModel.ts | (absent) | 075c7aaed1093ca681083b9ce2bb4fa632f22193034e5448583534f168bd20f7 | new |
| a3743GateB4Fix01PublishSafety.test.ts | (absent) | a0d479e9c620b8d313be409b42ffa19c8a3507059ad415bfe977dbb81f25b13f | new, 55 tests |
| a3743GateB4Fix01DatabaseAndFreeze.test.ts | (absent) | 78ea9a2a48701e9a89884437a9c52400cf11b69e2580660453dad770442414fa | new, 31 tests |

Fingerprint re-pins (each carries `// A3.7.4.3 GATE B.4 FIX01 AUTHORIZED RE-PIN (was: <old>)`):

| Test | Key | Old | New |
|---|---|---|---|
| B3 FIX01 L429-432 | instagramPublish.ts | 5523a9c0…63ca | df94b08f…00f1 |
| B3 FIX01 L429-432 | graph.ts | 6a5909c4…d28a | a107c840…bb61e |
| B3 FIX02 L258-265 | index.ts | f1855158…0c28 | 6312ea2e…a675 |
| B3 FIX02 L258-265 | instagramPublish.ts | 5523a9c0…63ca | df94b08f…00f1 |
| B3 FIX02 L258-265 | graph.ts | 6a5909c4…d28a | a107c840…bb61e |

All new values are the sha256 of the real bytes on disk (§9). The `shared.ts`, `derivative.ts`,
`connectionPreflight.ts`, container_state migration and foundation migration pins were NOT touched because those
bytes did not change. The migration count (60) did not change, so the a281 / a33 / FIX02 count pins and the a3741
re-pin chain were NOT touched.

Behavioural re-pin (only one): Gate A T26 previously asserted that an error reply from `/media_publish` yields
`['FAILED','META_REJECTED']` and row status `failed`. F6 explicitly requires that outcome to be UNKNOWN; the
assertion now expects `['UNKNOWN','PUBLISH_OUTCOME_UNKNOWN']` and status `unknown`. This is a stricter (safer)
assertion, not a weaker one: the prior expectation is exactly the unsafe behaviour F6 removes. Its evidence checks
(stage `publish_requested`, container id kept) are preserved. No assertion was deleted, skipped or loosened.

No unidentified security-assertion dependency was found (§9 STOP condition not triggered).

## 3. Changes and rationale

### F1 — prepared forward-only SQL (NOT applied)
Redefines only four functions; `publish_attempt_mark_stale` and `publish_attempt_advance` are untouched.

1. `publish_attempt_record_verification` — reads `status` AND `external_stage` in one `SELECT … FOR UPDATE`.
   Verdict `absent` when the locked stage is `publish_requested` returns `unsafe_absent` and changes nothing; the
   attempt stays `unknown`, `verification_required = true`, non-retryable. A stale TS snapshot therefore cannot
   authorize `absent`.
2. `publish_attempt_finish` — reads `status` and `external_stage` under `FOR UPDATE`. Outcome `failed` at stage
   `publish_requested` is stored as `unknown` / `PUBLISH_OUTCOME_UNKNOWN` / `retryable = false` /
   `verification_required = true` and returns `ok_unknown`. No retryable state can exist once a publish may have
   occurred.
3. `publish_attempt_begin` — Instagram only: after the publication row lock and before
   `publication_publish_gate`, `internal_test_entitlement_active(p_user_id) IS NOT TRUE` returns
   `PERMISSION_REQUIRED` and inserts nothing. The Facebook branch is byte-for-byte the historical logic.
4. `publish_attempts_guard` (trigger) — adds one rule: `OLD.external_stage = 'publish_requested' AND
   NEW.status = 'failed'` raises `publish_attempt_outcome_unprovable`. This is the atomic DB backstop: no code
   path, present or future, can turn a possibly-published attempt into a retryable failure.

All four keep `SECURITY DEFINER` and an empty `search_path`. Privileges: guard REVOKEd from PUBLIC, anon,
authenticated, service_role; the three RPCs REVOKEd from PUBLIC, anon, authenticated and GRANTed EXECUTE to
`service_role` only (exactly three GRANT statements). No DROP, ALTER, DELETE, TRUNCATE or transaction control.
No table, column, RLS policy or data is changed.

Diff against the historical bodies (a3741 foundation migration for record_verification / finish / begin;
container_state migration for the guard) is additions only, except the DECLARE/SELECT lines that also read
`external_stage` and `IF p_outcome = 'succeeded'` becoming `ELSIF`. This is asserted line-by-line in
`a3743GateB4Fix01DatabaseAndFreeze.test.ts`.

The file is kept outside `supabase/migrations/` so it cannot be applied by accident and so the frozen migration
count (60) and chain remain intact. The full text is reproduced in §6.

### F2 — entitlement required
- `index.ts` injects `entitlementActive(userId)` = RPC `internal_test_entitlement_active`, true only when
  `!error && data === true` (fail-closed).
- `instagramPublish.ts` `mayWrite` = arming + user/publication allowlists (`isAuthorizedToPublish`, unchanged)
  AND publication = server target AND entitlement. Any exception → false.
- Checked: before `begin` (403 `REAL_PUBLISH_DISABLED`, nothing written); re-checked before the container POST
  and before the `/media_publish` POST (`stillAuthorized`, otherwise the attempt is closed and nothing is sent);
  and enforced again by the DB inside `begin` (F1.3).
- `verify` is owner-authorized (JWT user + arming + allowlists) but deliberately NOT entitlement-dependent, so an
  UNKNOWN can still be investigated (read-only) after expiry. `status` remains read-only and never calls the
  entitlement (asserted: the harness throws if it is touched).

### F3–F5 — server-side pins, real bytes, snapshot kept to the final write
- `publishTarget.ts`: frozen `APPROVED_TARGET` = publication `875587f5-0137-4477-904c-609e8e406ad6`, version 3,
  caption sha `537130129640e265530b14f0c6630124906ceae7964501ef76002eae2603915e`, image sha
  `6edee998611958567dead90b82eebc39bd15db2ea85fe02c3135942adcf853a7`. WebCrypto SHA-256 helpers. No fetch, no
  Graph access.
- Browser-supplied hashes are never read; extra hash keys in the request are rejected (400, existing strict
  body validation; asserted).
- Request version ≠ 3 → `VERSION_CONFLICT` before any write; preflight and begin use the server version.
- After `begin`: locked draft version must be 3 and the locked caption must hash to the pin, else the attempt is
  closed `failed/INTERNAL_ERROR` (stage `none`, nothing sent).
- The original image bytes actually downloaded must hash to the pin, else `IMAGE_UNSUPPORTED`.
- The derivative's sha is computed from the bytes stored. `snapshotIntact()` re-reads the draft (version, image
  path, mime, caption identical and hash-matching) and re-downloads the stored derivative (sha must match) before
  the container POST AND again before the `/media_publish` POST. Any mismatch → closed before that write.
- D is only read. No code path writes publications, drafts or the original image.

### F6 — any non-conclusive result after `/media_publish` is UNKNOWN
- `graph.ts` `publishContainer`: once the request is sent, every `failed` result (429, 4xx, 5xx, Graph error
  codes) becomes `{kind:"unknown"}`. Network throw, timeout, malformed / non-numeric / missing id were already
  UNKNOWN. Only an invalid id that prevents sending stays `failed INTERNAL_ERROR` (no request).
- `instagramPublish.ts`: anything other than `created` after `/media_publish` → UNKNOWN (202). `finish` result
  `ok_unknown` → 202 UNKNOWN; any other non-`ok` → 500 PUBLISHING (fail-closed, never retryable).
- No automatic retry exists anywhere; a retry requires an explicit request and is refused while an UNKNOWN or
  in-flight attempt exists.

## 4. Verify flow after the change
`verify` asks the DB to record `absent` only when its snapshot stage is before `publish_requested`. If the DB
answers `unsafe_absent` (the stage moved under the lock), it falls through to the existing read-only
`findPublishedMedia` search: an exact match → SUCCEEDED; otherwise inconclusive → stays UNKNOWN. Any other DB
answer → 500 and the attempt stays UNKNOWN.

## 5. Facebook
Callers of the shared RPCs: `supabase/functions/meta-publishing/index.ts` L103 (`publish_attempt_begin`) and
L114 (`publish_attempt_finish`), plus the Instagram function. No other caller exists (scan asserted). Facebook
attempts always stay at stage `none`, so none of the new branches can apply to them; the entitlement check is
inside `IF p_channel = 'instagram'`. Evidence in the SECURITY report §3.

## 6. Prepared SQL (verbatim; sha256 a3209acbc30f3a56c6c4d2260d023c1330d9966c5603552caba99e262bbb5981)

```sql
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
```
