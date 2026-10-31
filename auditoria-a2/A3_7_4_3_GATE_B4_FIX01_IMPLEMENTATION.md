# A3.7.4.3 — Instagram Gate B.4 — FIX01: Publish Safety Hardening — IMPLEMENTATION REPORT

Mode: controlled security correction. Real Instagram publishing NOT authorized.
Baseline: ZIP 39 `localseohub-a3743-gateB4-audit.zip` (sha256 93cdc40b4b4aa6185289f952d8d7412d98c82c963f7381c95c95908d90bff735).
Outcome: **STOPPED BEFORE MODIFYING FROZEN CODE / FROZEN DATABASE LOGIC** (FIX01 prompt §2: "If a safe solution requires changing frozen database logic, identify the exact dependency and STOP before modifying it"; §7: "No existing tests may be disabled, skipped or weakened").

## 1. Result summary

| Finding | Correction designed | Applied | Blocking frozen dependency |
|---|---|---|---|
| B4-F1 stale-verification TOCTOU | Yes (§3.1) | NO | Frozen SQL `publish_attempt_record_verification`, `publish_attempt_mark_stale` (migration 20261028132929_a3741, inspected by a3741 test L200-203, L321-323); `instagramPublish.ts` L324-357; `index.ts` L119-127 |
| B4-F2 entitlement not enforced on publish path | Yes (§3.2) | NO | `instagramPublish.ts` L196-215, L239; `index.ts` L178-182 (only call site); optionally `publication_publish_gate` SQL |
| B4-F3/F4/F5 content/version pin | Yes (§3.3) | NO | `instagramPublish.ts` L196-300, L370-378; `derivative.ts`; `index.ts` L86-96 |
| B4-F6 unsafe retry after /media_publish | Yes (§3.4) | NO | `graph.ts` L42-82; `instagramPublish.ts` L297-310; frozen SQL `publish_attempt_finish` |
| B4-F8 deployment evidence | Procedure designed (§3.5) | Documentation only | none (procedure only; deploy prohibited) |

Zero workspace source, test, migration, config or production changes were made. Only these three reports were added.

## 2. Root causes (confirmed against the baseline source)

- **F1.** `verify()` (instagramPublish.ts L324-357) reads a context snapshot, then calls `markStale` (L331), then decides `absent` from the **snapshot** `attempt.externalStage` (L336-337). `publish_attempt_mark_stale` returns only a boolean and not the locked stage. `publish_attempt_record_verification(... 'absent' ...)` locks the row, but checks only `status = 'unknown'`; it never checks `external_stage`, and it sets `failed / META_TEMPORARY_ERROR / retryable = true`. Interleaving: verify reads snapshot (stage `container_created`) → publisher advances to `publish_requested` and POSTs /media_publish → 2 min elapse, markStale flips the row to `unknown` → verify records `absent` → the row becomes retryable `failed` although a post may exist → retry can double-post.
- **F2.** `internal_test_entitlement_active` is called only in the connection preflight (index.ts L178-182). `publish()`, `verify()` and `stillAuthorized()` (L239, L284, L297) check env arming and allowlists, but not the entitlement. An expired entitlement (expires 2026-11-01 22:21:13 UTC) would not stop a publish.
- **F3/F4/F5.** `expectedVersion` comes from the browser (L370-378) and is forwarded to the begin RPC. No server constant pins publication D (875587f5-0137-4477-904c-609e8e406ad6), v3, the caption sha 537130129640e265530b14f0c6630124906ceae7964501ef76002eae2603915e or the original image sha 6edee998611958567dead90b82eebc39bd15db2ea85fe02c3135942adcf853a7. Image bytes are never hashed. Nothing is revalidated before /media_publish.
- **F6.** In `graph.ts` `write()`, a 4xx at /media_publish mapped to META_RATE_LIMITED or META_TEMPORARY_ERROR becomes `failed(code)`. `publish_attempt_finish` then sets `retryable = true`. Meta can return such errors after the media was actually created, so the outcome is uncertain but is recorded as safely retryable.

## 3. Exact corrections (designed, NOT applied)

### 3.1 F1 — database-enforced transition safety (new migration, prepared only)
1. Replace `publish_attempt_record_verification`, keeping the signature, SECURITY DEFINER, `search_path=''` and the service_role-only EXECUTE grant:
   - Lock with `SELECT status, external_stage, user_id ... FOR UPDATE`.
   - Require `user_id = p_user_id`, or else return `not_found`.
   - Verdict `absent` is allowed ONLY when `external_stage IN ('none','container_requested')`. If the stage is `container_created` or `publish_requested`, return `invalid_transition` and leave the row `unknown`, `verification_required = true`.
   - The result of `absent` stays `failed` + `retryable = true` only for those pre-container stages.
2. Replace `publish_attempt_mark_stale` with a function that returns `TABLE(marked boolean, external_stage text)`, read from the row locked by the UPDATE ... RETURNING. As an alternative that keeps the signature, add `publish_attempt_stale_stage(p_attempt_id)`, which locks and returns the stage.
3. In `verify()`, decide `absent` vs `search` from the DB-returned stage, never from the snapshot. Treat any RPC error as fail-closed (`PUBLISH_IN_PROGRESS` / 503, no write).
4. Extend `publish_attempts_guard` so that any `unknown → failed` transition with `retryable = true` is rejected when `OLD.external_stage = 'publish_requested'`. This is a second layer, independent of the function.
5. Deterministic test that replays the exact interleaving against an in-memory model of the SQL: snapshot(container_created) → advance(publish_requested) → markStale → record('absent'). Expected: `invalid_transition`, the row stays `unknown`, retry is refused.

### 3.2 F2 — entitlement on every authorizing path
- Add `entitlementActive(userId)` to the deps (RPC `internal_test_entitlement_active`). Any error, null or false → fail closed (`NOT_AUTHORIZED`, no write).
- Call it in `publish()` before `begin`, inside `stillAuthorized()` before the container POST and again before /media_publish, and in `verify()` before markStale or any Graph read.
- Defense in depth: in `publish_attempt_begin`, add `IF NOT public.internal_test_entitlement_active(p_user_id) THEN RAISE ... 'NOT_AUTHORIZED'`.
- Existing owner, business and publication allowlists are kept unchanged. There is no renewal or creation path.

### 3.3 F3/F4/F5 — server-side content pin
- Add a server constant `APPROVED_TARGET = { publicationId: 875587f5-…, version: 3, captionSha256: 5371…915e, originalImageSha256: 6edee998…53a7 }`. It is never read from the request body.
- `expectedVersion` from the browser must equal `APPROVED_TARGET.version`. The value passed to the RPC is the constant.
- After `begin`: sha256(`begun.caption`) must equal the pin. Otherwise call finish with failed INTERNAL_ERROR (non-retryable path; no Graph write has happened yet).
- After `downloadImage`: sha256 of the actual bytes must equal the pin BEFORE `buildDerivative` and `storeDerivative`.
- Record sha256 of the derivative bytes at build time. Before /media_publish, re-download the stored derivative and compare it, and re-check the caption hash against the begin snapshot. On mismatch → do not POST, finish failed (stage `container_created`, provably no publish).
- D is not modified.

### 3.4 F6 — no retryable failure after /media_publish
- In `graph.ts`, `publishContainer` maps every non-2xx to `unknown`, except a 400 whose error subcode proves pre-validation rejection (allowlisted) → META_REJECTED (non-retryable).
- In SQL `publish_attempt_finish`, if `external_stage = 'publish_requested'` and the outcome is `failed` with RATE_LIMITED or TEMPORARY_ERROR → store `unknown`, `verification_required = true`, `retryable = false`.
- There is no automatic retry path.
- Tests: 429 rate limit, 4xx code 2 / 4 / 17 / 32 / 613 temporary, AbortError timeout, 200 with malformed or empty body, and 5xx. All must yield UNKNOWN with retry refused.

### 3.5 F8 — deployment evidence procedure
See SECURITY §5. No deploy was performed.

## 4. Prepared migration (NOT written to disk, NOT applied)
Writing a file under `supabase/migrations/` would itself break two pinned tests (migration count = 60), so the SQL is kept in this report only, at design level, in §3.1-§3.4. Name reserved: `a3743_gateb4_fix01_publish_safety.sql`.

## 5. Modified files
None. Added files are the three reports in this directory, with hashes in the MANIFEST.

## 6. Regression (baseline intact)
See MANIFEST §3.

## 7. Unresolved authorization dependencies (owner decision required)
1. Authorization to modify the frozen IG function files instagramPublish.ts, index.ts and graph.ts, and possibly derivative.ts.
2. Authorization to change frozen SQL functions (record_verification, mark_stale, finish, begin, guard) through a new migration. `record_verification` and `mark_stale` are defined in the A3.7.4.1 foundation migration; `begin` and `finish` are shared with the frozen Facebook path.
3. Exact SHA-256 re-pins (listed in MANIFEST §2) in:
   - B3 FIX01 test L429-432
   - B3 FIX02 test L250-262
   - migration count 60→61 in a281 L157 and a33 L138, plus the FIX02 test L287-292, which asserts the exact "60 ... FIX02 AUTHORIZED RE-PIN" text
   - and the cascading hash pins of those tests (a3741 AUTHORIZED_REPINS → Gate A T36 L782).
4. A separate later authorization for production migration and deploy.
