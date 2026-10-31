# A3.7.4.3 — GATE B.4 — SECURITY AND RECOVERY

All evidence below is read-only: catalog queries, the deployed SQL function definitions, and source line references. Verdict: **NO-GO** (see READINESS_AUDIT).

## §4 Authorization audit

| Control | Where enforced | Server-side / fail-closed | Result |
|---|---|---|---|
| Owner JWT | index.ts:34-37 `auth.getUser`; instagramPublish.ts:363-366 → 401; `verify_jwt=true` | Yes / Yes | PASS |
| Business ownership | `publication_publish_gate` (businesses.user_id = p_user_id); `publish_attempts_guard` INSERT join; `meta_publish_channel_issue` | Yes / Yes | PASS |
| Internal entitlement | Connection preflight only (index.ts:178-182). Not checked in publish or verify, nor in the SQL gate or begin | Not on the publish path | **FAIL** |
| Publication ownership | Gate: `p.id = … AND p.user_id = p_user_id`; begin uses `FOR UPDATE` with the same predicate | Yes / Yes | PASS |
| Exact publication-ID allowlist | `isPublicationAllowed` (instagramPublish.ts:109-115). Any malformed or wildcard entry disables all | Yes / Yes | PASS |
| Exact owner-ID allowlist | `isArmed` (:102-106) requires membership. Malformed entries are dropped, so they can never match | Yes / Yes | PASS |
| Server arming | `ARMED==="true"` on entry (:197, :325) and before each Graph write (`stillAuthorized`, :284, :297) | Yes / Yes | PASS |
| v3 enforcement | Only `expectedVersion == live draft.version` (gate). The caller supplies the version; no constant 3 | Partial | **FAIL** |
| Caption integrity | Begin returns the live `instagram_text`; checked only for non-empty and ≤2200 characters; no sha pin | No | **FAIL** |
| Image integrity | Path regex (owner/business/publication), signature, MIME and bounds; no sha pin | Partial | **FAIL** |
| Reject unauthorized user | Allowlist → 403; gate ownership → INVALID_PUBLICATION_STATE (T04) | Yes | PASS |
| Reject unauthorized publication | Allowlist → 403 | Yes | PASS |
| Reject stale version | Gate → VERSION_CONFLICT (T05) | Yes | PASS |
| Reject missing or partial arming | Any one of the three conditions absent → 403 (T35, B.2/B.3 suites) | Yes | PASS |

## §5 Workflow audit (static and mocked)

The steps run in this order:

1. preflight
2. begin, which takes row locks and inserts the attempt
3. token derivation
4. download the original from `publication-images`; check signature and MIME
5. build the derivative (`ig-jpeg-centrecrop-v1`)
6. upload to `instagram-derivatives/{user}/{business}/{publication}/{attempt}.jpg` (no upsert)
7. signed URL (600 s)
8. arming recheck → advance `container_requested`
9. POST `/media`
10. advance `container_created`, persisting the container ID
11. poll (6 checks × 2 s)
12. arming recheck → advance `publish_requested`
13. POST `/media_publish`
14. GET read-back (reported, not decisive)
15. finish `succeeded`, storing the media ID, permalink and `finished_at`
16. `finally`: delete the derivative

Covered by Gate A tests T07–T27.

## §6 Idempotency and concurrency

| Item | Evidence | Result |
|---|---|---|
| Key construction | Stored generated column `idempotency_key = publication_id:channel:v<draft_version>` | PASS |
| One live attempt per publication/channel/version | Unique `publish_attempts_identity_live` WHERE status IN (publishing, succeeded, unknown) | PASS |
| One active per publication/channel | Unique `publish_attempts_one_active` | PASS |
| One success per publication/channel | Unique `publish_attempts_one_success` | PASS |
| Duplicate click | UI `sending` guard (Harness:86); server unique_violation → PUBLISH_IN_PROGRESS | PASS |
| Concurrency on begin | `FOR UPDATE` on publication and draft, plus unique indexes | PASS |
| Retry | Requires `retry:true` plus last attempt FAILED; META_REJECTED also requires the draft to be saved after the failure | PASS |
| UNKNOWN state | Blocks begin (gate → PUBLISH_OUTCOME_UNKNOWN); retryable=false; verification_required=true (CHECK) | PASS |
| No duplicate after timeout | Timeouts at `/media` or `/media_publish` → unknown | PASS |
| No automatic retry after /media_publish | No loop; a single write with a 30 s timeout | PASS |
| Crash recovery | stale after 120 s → unknown → verify | **FAIL**: TOCTOU (F1) |
| Side-effect uncertainty | `absent` is allowed by SQL even when stage = publish_requested | **FAIL** (F1) |

### F1 sequence

1. Request R1 is in `container_created` (it has been running more than 120 s).
2. The verify request V reads `context()`: status publishing, stage `container_created`.
3. R1 runs `advance('publish_requested')` and gets `ok`, because the status is still publishing. R1 POSTs `/media_publish`, and the post goes live.
4. V calls `mark_stale`, which succeeds because the status is still publishing. V then acts on its outdated stage snapshot and calls `record_verification('absent')`. The SQL accepts this (it checks only status = unknown), so the attempt becomes `failed`, retryable.
5. R1's `finish` returns `invalid_transition`, and R1 returns 202 UNKNOWN to its caller. The DB row says failed and retryable, so the owner can retry and publish a **duplicate**.

Whether this happens depends on R1's run time exceeding 120 s. The worst case is about 96 s plus token, decode and upload latency, so it is plausible under slow conditions.

## §7 Error and recovery matrix

| # | Case | Stage | DB state after | Retry eligible | Duplicate risk | Operator action | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | No or invalid JWT | entry | none | n/a | none | sign in | :363-366; B.2 suite |
| 2 | Not armed / partial arming | entry | none | n/a | none | none (intended) | :197, :325; T35 |
| 3 | Publication not allowlisted | entry | none | n/a | none | none | :109-115; B.2 suite |
| 4 | Foreign user or publication | preflight | none | no | none | none | gate SQL; T04 |
| 5 | Stale version | preflight / begin | none | no | none | reload draft | gate VERSION_CONFLICT; T05 |
| 6 | Missing permission / no IG account | preflight | none | no | none | reconnect Meta | `meta_publish_channel_issue`; T01–T03 |
| 7 | Token expired or revoked | preflight / token | none, or failed REAUTH_REQUIRED | after reauth | none | reconnect | channel_issue; graph.ts:35-48 |
| 8 | Image unavailable or unsupported | pre-/media | failed IMAGE_* | no | none | replace image | T07, T08, T14b |
| 9 | Derivative upload or signing failure | pre-/media | failed INTERNAL_ERROR | manual (retry:true) | none | retry | instagramPublish.ts:277-280 |
| 10 | Duplicate click / concurrent begin | begin | one attempt only | n/a | none | wait | unique indexes; Harness:86 |
| 11 | /media definite 4xx | container | failed (code) | per code | none (no container) | per code | T18 |
| 12 | /media timeout / 5xx / malformed | container | unknown | no (verify) | none | verify | T19 |
| 13 | Container ERROR / not ready | polling | failed META_REJECTED / TEMPORARY | TEMPORARY only | none (unpublished container expires) | retry or edit | T23 |
| 14 | Container ID persist failure | container_created | unknown | no | none | verify | :290 |
| 15 | /media_publish definite 4xx | publish | failed; retryable if RATE/TEMP | manual | **low residual** (F6) | inspect Instagram before retry | T26; finish SQL |
| 16 | /media_publish timeout / 5xx; or success then finish failure | publish | unknown, or still publishing → stale | no (verify) | none with an accurate stage; media ID lost (F7) | verify | T27, T28 |
| 17 | Process crash mid-run / long run past 120 s | any | publishing → stale → verify | after `absent` | **material** (F1) | none safe | T38 (non-racing only) |

## §8 DB security

| Check | Evidence | Result |
|---|---|---|
| 9-column service_role SELECT grant unchanged | attempt_number, channel, external_stage, id, meta_container_id, publication_id, started_at, status, user_id | PASS |
| No extra write privileges | anon/authenticated INSERT/UPDATE/DELETE/TRUNCATE on attempts, meta_connections, internal_test_entitlements, publications, publication_drafts: none | PASS |
| Table grants on attempts | only `authenticated:SELECT` | PASS |
| RLS | Enabled on attempts. No public table has RLS off. Attempts policy `select_own_publish_attempts`: owner plus business owner | PASS |
| SECURITY DEFINER publish functions | All `search_path=''`, except `internal_test_entitlement_active` (`search_path=public`; LANGUAGE sql, schema-qualified, not client-executable). anon and authenticated EXECUTE = false on every publish/meta function, including `meta_read_token` | PASS |
| SECURITY DEFINER callable by clients | select_publication_proposal, save_publication_channel_drafts, billing_status, current_user_has_premium, start_trial. Pre-existing, outside the publish path, and not changed by this gate | Noted |
| State guards | `publish_attempts_guard` trigger; `publish_attempts_state_shape` and `stage_shape` CHECKs | PASS |
| Cross-business capability | Gate, guard and channel_issue all join businesses.user_id | PASS |
| Public bucket access | Both buckets `public=false`. The only storage policy is `publication_images_select_own` (authenticated SELECT). None on instagram-derivatives | PASS |
| Remaining exposures | `record_verification('absent')` ignores stage (F1). `mark_stale` takes no user argument; it is service-role only and called via owner-scoped `context()`. CORS `*` (platform standard; the JWT is required) | F1 FAIL; others acceptable |
