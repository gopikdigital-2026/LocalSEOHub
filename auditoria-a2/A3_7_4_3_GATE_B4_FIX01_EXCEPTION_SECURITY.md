# A3.7.4.3 — Gate B.4 — FIX01 — AUTHORIZED FROZEN-CODE EXCEPTION — SECURITY

Real Instagram publishing NOT authorized. Prepared SQL NOT applied. Nothing deployed.

## 1. Production state (read-only queries, this session)
| Check | Result |
|---|---|
| Instagram attempts | 0 (all channels: 1, pre-existing Facebook history) |
| schema_migrations rows | 59 (unchanged) |
| Publication D 875587f5-0137-4477-904c-609e8e406ad6 | status `proposals_ready`, draft version 3 (unchanged) |
| META_INSTAGRAM_* secrets | none configured (unchanged) |
| Entitlement window | expires 2026-11-01 22:21:13 UTC (not renewed) |

Live function bodies (md5 of `prosrc`) — still the historical versions, i.e. the prepared SQL is NOT applied:

| Function | md5(prosrc) | SECURITY DEFINER | search_path | EXECUTE |
|---|---|---|---|---|
| publish_attempt_begin | da3dd162e202d8bd2fe543693c860e11 | yes | "" | postgres, service_role |
| publish_attempt_finish | 3aa73a16006e496b7ebc5247384e2fdd | yes | "" | postgres, service_role |
| publish_attempt_record_verification | 22113083df79c30eb6d6edcd86639a2c | yes | "" | postgres, service_role |
| publish_attempt_mark_stale | 1042747630e9cff8d7da0b7ece08fdfe | yes | "" | postgres, service_role |
| publish_attempt_advance | 8b23859c0abeac3b3b3c5ba08fc3c476 | yes | "" | postgres, service_role |
| publish_attempts_guard | 33d76842d66ce269584c8044a706399b | yes | "" | postgres only |
| internal_test_entitlement_active | a63a14bf153a9d308ce03d3a8a6f153e | yes | public | postgres, service_role |

The prepared SQL keeps exactly this privilege shape (anon / authenticated never gain EXECUTE; guard not callable).

## 2. DB concurrency proof (F1)

Actors: P = publisher (`advance` → POST), V = verifier (`mark_stale` → `record_verification`). Every DB step is a
single statement on the attempt row taken with a row lock (`FOR UPDATE` or `UPDATE`), so steps on one attempt are
totally ordered. The guard trigger runs inside the same statement.

Key invariants after the prepared SQL:
- I1 `advance` can only move a row whose status is `publishing` (guard: publishing→publishing transitions only, +1
  stage, IG only). Once V has made the row `unknown`, any later stage change raises `publish_attempt_stage_frozen`.
- I2 `/media_publish` is POSTed only after P's `advance('publish_requested')` committed `ok`.
- I3 `record_verification('absent')` reads the stage under the same lock as its UPDATE and refuses at
  `publish_requested` (`unsafe_absent`).
- I4 `finish('failed')` at `publish_requested` is stored as `unknown`; the guard additionally rejects any row update
  `publish_requested → failed`.

Interleavings (V's TS snapshot taken while the stage was before `publish_requested`):

| # | Order | Pre-fix result | Fixed result |
|---|---|---|---|
| 1 | V mark_stale → V absent → P advance | failed/retryable; P advance rejected (stage_frozen) → no POST | same; safe (no POST was ever sent) |
| 2 | V mark_stale → P advance | P rejected (stage_frozen) → P closes, no POST | same |
| 3 | P advance(publish_requested) → V mark_stale → V absent (stale snapshot) | **failed + retryable while the post may exist → retry → 2nd media_publish (the finding)** | `unsafe_absent`, row untouched, stays UNKNOWN; V falls back to read-only search; no retry possible |
| 4 | P advance → P POST error → P finish('failed') | failed (retryable for some codes) | TS sends `unknown` (F6); even a `failed` call is stored `unknown` (`ok_unknown`); direct UPDATE raises `outcome_unprovable` |
| 5 | P advance → crash before finish → V mark_stale → V absent | V snapshot is fresh (`publish_requested`) → TS never asks `absent` | same, plus DB refusal if asked |
| 6 | two P concurrently | begin serializes on the publication row lock; one attempt | same |

Mechanised in tests (DB model mirrors the functions; `fixed:false` = currently applied bodies):
- pre-fix model reproduces #3 (2 media_publish calls); fixed model: 1 publish, UNKNOWN, retry refused;
- `unsafe_absent` then an exact listing → SUCCEEDED;
- verifier wins before publish_requested → stage frozen → 0 media_publish, 500;
- non-stale attempt → PUBLISH_IN_PROGRESS; double publish → 1 attempt / 1 container / 1 publish;
- guard model rejects `publish_requested → failed` and every backwards / frozen stage move.

The model is the proof vehicle because §12 forbids applying the SQL. The prepared SQL text itself is asserted
(locks, branch placement, line diff vs historical bodies) so model and SQL cannot silently diverge. A live
two-session concurrency test is a deployment-time requirement (MANIFEST §5 step 3).

## 3. Facebook preservation (§8)

Behaviour: FB `meta-publishing/index.ts` calls `publish_attempt_begin` (L103) and `publish_attempt_finish` (L114)
only. It never calls `advance`, `mark_stale`, `record_verification` or the entitlement (asserted by source scan).
FB attempts are inserted at stage `none` and can never advance (guard: publishing→publishing is IG-only).

Why FB is unaffected:
- begin: entitlement check sits inside `IF p_channel = 'instagram'`; FB path unchanged.
- finish: the only new branch requires `v_stage = 'publish_requested'`, unreachable for FB.
- record_verification: the only new branch requires `publish_requested`; FB never calls it.
- guard: the only new rule requires `OLD.external_stage = 'publish_requested'`, unreachable for FB.
- No TS file under `meta-publishing/` changed (4 sha pins asserted).

Regression evidence: 11 FB sequences (begin, finish succeeded/failed with every code/unknown, double finish,
invalid payloads, retries, entitlement on and off) return identical results AND identical rows under fixed and
pre-fix models. All pre-existing FB suites in the full run pass unchanged.

Privileges / RLS: no table, column, policy or grant on tables changes. Function EXECUTE remains service_role only;
guard not executable by any API role. Verdict: Facebook preservation demonstrated; §8 STOP not triggered.

## 4. Entitlement and allowlists (F2)
| Boundary | Check |
|---|---|
| publish request, before begin | arming + user allowlist + publication allowlist + server target + entitlement (403, nothing written) |
| begin (DB) | entitlement under publication lock → PERMISSION_REQUIRED |
| before container POST | full `mayWrite` again → attempt closed, no POST |
| before media_publish POST | full `mayWrite` again → attempt closed, no POST |
| verify | JWT owner + arming + allowlists; NOT entitlement (read-only recovery must survive expiry) |
| status | read-only; entitlement never called |

Entitlement RPC errors / exceptions / non-`true` → denied. Tests: false, throw, DB refusal, expiry before
container, expiry before publish, 3 checks on a successful run, verify after expiry, allowlist off / wrong user /
wrong publication / other JWT / allowlisted-but-not-target.

## 5. Content integrity (F3–F5)
Server pins only; browser hash fields rejected. Verified against real bytes: caption (locked draft and re-read),
original image download, stored derivative re-download. Re-checked before both Graph writes. Tested: wrong
version, draft version changed, edited caption, substituted image, mid-flow caption/version/image-path change,
derivative replaced or removed — before container and between container and publish (no media_publish).

## 6. F6 matrix (after media_publish was sent)
429 with/without body, Graph code 2 transient, 400, 403, 500, 503 non-JSON, network throw, AbortError timeout,
`{}`, non-numeric id, non-JSON success → all 202 UNKNOWN, exactly 1 media_publish, retry blocked. Lost success
(finish throws) → 202, recoverable via verify. DB failure while recording UNKNOWN → 202, attempt stays
publishing → stale → UNKNOWN path. No auto-retry anywhere.

## 7. Risks
1. DB protections inactive until the prepared SQL is applied. Until then, race #3 remains possible at the DB layer;
   TS alone prevents the `failed` path after publish_requested but cannot stop a stale-snapshot `absent`.
2. Code and SQL must ship together. New code + old DB: `absent` race open (risk 1). Old code + new DB: `ok_unknown`
   is not understood → 500 PUBLISHING (fail-closed, never retryable).
3. Entitlement expires 2026-11-01 22:21:13 UTC; afterwards publish is refused (verify still works). Renewal is out
   of scope and was not done.
4. `APPROVED_TARGET` is hard-coded; any change to D's caption/image/version blocks publishing until an authorized
   re-pin (intended).
5. A lost media id (F7) yields UNKNOWN; resolution depends on the read-only listing match.
6. Deployed-code equivalence is NOT verified (nothing deployed); see MANIFEST §5.
7. Applying the SQL later as a migration file changes the migration count (60 → 61) pinned by existing tests; that
   requires a separately authorized re-pin at deployment time.
8. The concurrency proof is model-based plus SQL-text assertions; live two-session verification is pending.
