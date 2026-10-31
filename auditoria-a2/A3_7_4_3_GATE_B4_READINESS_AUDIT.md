# A3.7.4.3 — INSTAGRAM GATE B.4 — CONTROLLED REAL-PUBLISH READINESS AUDIT

Mode: READ-ONLY. No code, test, migration, secret, deployment or Meta change was made. No Graph POST, no container, no derivative upload, no publication. Only these three reports and the audit ZIP were created.

Audit time (DB `now()`): 2026-10-31 18:12:32 UTC.

## VERDICT

**NO-GO — A3.7.4.3 INSTAGRAM GATE B.4 REQUIRES CORRECTION**

## 1. Executive findings

| # | Finding | Severity | Result |
|---|---|---|---|
| B4-F1 | TOCTOU race in `verify`. The action reads `externalStage` from `context()`, then calls `publish_attempt_mark_stale`, which checks only `status='publishing'` and `started_at` and does not re-read the stage. A still-running original request can `advance('publish_requested')` and POST `/media_publish` between those two steps. `verify` then records `absent`, the SQL makes the attempt `failed` with `retryable=true`, and a manual retry can create a **duplicate Instagram post**. `publish_attempt_record_verification('absent')` does not refuse `external_stage='publish_requested'`. No test covers this interleaving: T38 covers only the non-racing case. | Material (idempotency) | FAIL |
| B4-F2 | The internal entitlement (`internal_test_entitlement_active`) is enforced only in the connection preflight (index.ts:178-182). It is absent from the `instagram_publish` and `instagram_publish_verify` paths and from `publication_publish_gate` / `publish_attempt_begin`. | Material (authorization) | FAIL |
| B4-F3 | Caption integrity is not server-pinned. The caption comes from the begin RPC row (instagramPublish.ts:253) with only a non-empty check. There is no server comparison with the approved sha `537130…915e`. The only protection is `expectedVersion` equality against the live draft, and the caller supplies `expectedVersion` (any integer ≥ 1), so an edited draft v4 passes with `expectedVersion=4`. | Material (content integrity) | FAIL |
| B4-F4 | Image integrity is not server-pinned. The image path is owner/publication-scoped and the PNG/JPEG signature and bounds are checked, but there is no comparison with the approved sha `6edee998…853a7`. A replaced image at a new valid path would be published. | Material (content integrity) | FAIL |
| B4-F5 | "v3 enforcement" is relative, not absolute. The SQL gate rejects `expectedVersion ≠ live version` (VERSION_CONFLICT, T05), but nothing pins version 3. | Material | FAIL (same root cause as F3) |
| B4-F6 | A definite 4xx `META_RATE_LIMITED` / `META_TEMPORARY_ERROR` at `/media_publish` produces `failed` with `retryable=true` (publish_attempt_finish). A manual retry creates a new container and publish with no read-back first. There is no automatic retry. The residual duplicate risk is low and depends on Meta behaviour. | Residual | Documented risk |
| B4-F7 | If `/media_publish` succeeds and then `publish_attempt_finish` fails, the media ID is not persisted (the response returns 202 UNKNOWN). Recovery relies on stale-marking plus a caption scan. That works, but it is exposed to F1. | Residual | Documented risk |
| B4-F8 | The deployed function bundle cannot be independently compared with the local source. `functions-deploy-state.json` reports `hasChanged:false` and hash `7daa1d63…2284`, but that hash is computed by the tooling and cannot be checked against the deployed bundle. | Evidence gap | UNKNOWN |
| B4-F9 | The internal entitlement expires on **2026-11-01 22:21:13 UTC**. Any later real-publish window needs a new entitlement. This is noted here; it is not itself a defect. | Operational | Note |

### Controls verified PASS (direct evidence)

- **Owner JWT.** `auth.getUser(jwt)`; missing or invalid → 401. `verify_jwt=true` is deployed.
- **Arming.** `ARMED==="true"` plus the user allowlist plus a strict publication allowlist (any malformed entry disables the whole list). Arming is checked on entry and again before each Graph write. Covered by T35 and the B.2/B.3 suites.
- **Publication and business ownership.** Enforced in SQL by `publication_publish_gate` (publication.user_id plus businesses.user_id), the `publish_attempts_guard` insert check, and `meta_publish_channel_issue`.
- **Single attempt.** Unique indexes `publish_attempts_one_active`, `publish_attempts_one_success` and `publish_attempts_identity_live (publication, channel, draft_version)`. A `unique_violation` in begin → PUBLISH_IN_PROGRESS. The UI has a `sending` guard (InstagramPublishHarness.tsx:86).
- **State machine.** advance and finish refuse anything not in `publishing`, so `invalid_transition` is returned. The advance failure before `publish_requested` returns FAILED without POSTing `/media_publish`. The guard trigger keeps identity fields and container IDs immutable and stops stages moving backwards.
- **UNKNOWN on ambiguity.** Timeouts, 5xx, malformed responses and a container already PUBLISHED all produce `unknown`. There is no automatic retry, and UNKNOWN blocks begin.
- **IG permissions.** `instagram_basic` and `instagram_content_publish` are checked server-side before begin.
- **Buckets private; derivatives service-role only.** There is no storage policy on `instagram-derivatives`.

## 2. §11 Readiness matrix

| Area | Result | Evidence / reason |
|---|---|---|
| Authorization | **FAIL** | F2 (entitlement not on the publish path), F3–F5 (no caption, image or v3 pin) |
| Account and permissions | PASS | meta_connections: connected, IG 17841462487279994, page 1393994523793266, both IG permissions present, no revocation, no expiry; SQL `meta_publish_channel_issue` |
| Media | PASS (static/mocked) | derivative.ts, T07–T16; private bucket; 600 s signed URL; deletion in `finally` |
| Idempotency | **FAIL** | F1 TOCTOU duplicate path; F6 residual |
| Recovery | **FAIL** | F1 lets recovery mark a published post "absent"; F7 depends on F1 |
| DB security | PASS | See SECURITY_AND_RECOVERY §8 |
| Deployment integrity | **UNKNOWN** | ACTIVE, JWT on, id a3008491…; deployed bundle not verifiable (F8) |
| Observability | PASS (with limits) | Redacted structured logs; stage persisted write-ahead; persisted attempt rows; no external alerting |
| Production baseline | PASS | See EVIDENCE_MANIFEST §3 |

The GO rule (no material FAIL/UNKNOWN) is not met.

## 3. Regression (§10)

| Check | Result |
|---|---|
| Full Vitest | 88/88 files, **2983 passed, 0 failed, 0 skipped** |
| Targeted (a3743 ×4, a3741, a3742) | 6 files, 232 passed |
| tsc (`tsconfig.app.json`) | 20 errors (inherited, as expected) |
| Build | OK |
| Tests modified | None |

## 4. Required corrections (recommendation for next gate)

1. **F1.** Make the stale and absent decision atomic in SQL:
   - `publish_attempt_record_verification('absent')` must refuse `external_stage='publish_requested'`; or
   - `mark_stale` must return the locked stage, and `verify` must use that value instead of the snapshot from `context()`.
   - Add a test for the interleaving: verify reads, the original advances, then verify marks.
2. **F2.** Call `internal_test_entitlement_active(p_user_id)` in the publish and verify paths, preferably inside `publish_attempt_begin`, so the check fails closed.
3. **F3–F5.** Pin the approved content server-side, for example with a `META_INSTAGRAM_REAL_PUBLISH_EXPECTED` triple (publication ID, version 3, caption sha256, image sha256). The values must be checked after begin and before any Graph write, against the begin row's caption and the downloaded original's bytes.
4. **F6 (optional hardening).** Treat any non-success at `/media_publish` as UNKNOWN, requiring verification before any retry.
5. **F8.** Provide independently verifiable deployment evidence, such as a redeploy record tied to the source hashes in EVIDENCE_MANIFEST §2.

Each correction needs separate written authorization. **Real publishing remains NOT authorized.**
