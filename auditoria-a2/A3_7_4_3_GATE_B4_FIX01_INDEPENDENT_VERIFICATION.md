# A3.7.4.3 — INSTAGRAM GATE B.4 FIX01 — INDEPENDENT PRE-DEPLOYMENT VERIFICATION

Mode: AUDIT ONLY. No production migration, deployment, secret change, Meta POST or publication was performed.

## VERDICT

**GO — GATE B.4 FIX01 VERIFIED AND READY FOR SEPARATE PRODUCTION ROLLOUT AUTHORIZATION**

This verdict does not authorize rollout. The rollout (section 8) requires its own explicit authorization.

## 1. Candidate under audit

| Item | Value |
|---|---|
| Candidate archive | ZIP (41) `localseohub-a3743-gateB4fix01-exception.zip` |
| ZIP (41) sha256 | `545a65ec8f7aa4a33925f3eb27a422dae5facd70eafdaeeb6234790615ad2909` |
| Prepared SQL | `auditoria-a2/gate-b4-fix01-prepared/20261031190000_a3743_gateb4_fix01_publish_safety.sql` |
| Prepared SQL sha256 | `a3209acbc30f3a56c6c4d2260d023c1330d9966c5603552caba99e262bbb5981` |
| Exception reports | `A3_7_4_3_GATE_B4_FIX01_EXCEPTION*.md` (3 files) |

`diff -rq` between the pre-FIX01 baseline archive and ZIP (41) shows only the 12 authorized ledger files and the 3 EXCEPTION reports.

## 2. Disposable database environment (real SQL, not simulated)

- Engine: real PostgreSQL **17.6**, the same major/minor version as production (embedded-postgres linux-x64 binaries). It ran locally on `localhost:55432`, was created only for this audit and was **stopped and discarded afterwards**.
- `harness/bootstrap.sql` creates the Supabase roles and schemas the migrations use (`anon`, `authenticated`, `service_role`, `auth.users`, `auth.uid()`, `storage.objects/buckets`).
- `harness/replay.cjs` replays all **60/60** files of `supabase/migrations` in order. On the replay, the whitespace-free md5 of all 9 publish-safety functions equals the production values (section 6), so the replay matches production.
- Databases:
  - `audit`: replay only (= production today).
  - `audit_fixed`: replay + prepared SQL.
  - `audit_rollback`: replay + prepared SQL + generated rollback.
- Each SQL file is applied in a single transaction by `harness/applyFix.cjs`.
- Logs: `gate-b4-fix01-verification/evidence/SQL_EXECUTION_LOG.txt` and `ROLLBACK_REHEARSAL_LOG.txt`.

Result: **SQL execution check = PASS (real execution). 168/168 expectations matched, 0 mismatches. The harness exit code was 0 on both runs.**

## 3. SQL behaviour (pre-fix `audit` vs fixed `audit_fixed`)

| Area | Check | Pre-fix (production today) | Fixed |
|---|---|---|---|
| Stale verification | S1.3: verdict `absent` while stage is `publish_requested` | `ok`: row becomes `failed`/retryable, retry `begin` succeeds, **2 attempts** (duplicate-post risk) | `unsafe_absent`: row stays `unknown`, retry gives `PUBLISH_OUTCOME_UNKNOWN` |
| Stale verification | S1.12–14: `absent` at `container_created` (nothing sent yet) | allowed, retry OK | still allowed, retry OK (no over-blocking) |
| Concurrency | C1.2 / C2.1 / C3.1: second session blocks on the row lock (observed in `pg_stat_activity`) | blocks | blocks |
| Concurrency | C1.4: verification racing publish request | `ok` | `unsafe_absent` |
| Concurrency | C3.2: `finish('failed')` racing `publish_requested` | `ok` (becomes failed) | `ok_unknown` |
| Concurrency | C4/C5: 8 parallel `begin` per channel | exactly 1 attempt (IG and FB) | exactly 1 attempt (IG and FB) |
| UNKNOWN | U-series: unknown requires verification; retry blocked while unknown; U12 failed-after-request | U12 `ok` | U12 `ok_unknown`; retry blocked |
| Forbidden transitions | T3/T4: direct UPDATE `publish_requested` → `failed` | **updated** | `ERR: publish_attempt_outcome_unprovable` |
| Forbidden transitions | T5 stage backwards, T6 identity immutable, T7 container immutable, T8 unknown requires verification, T10 stage frozen after stale, T11 invalid transition, T13 must start publishing | rejected | rejected |
| Retry blocking | retry after unknown / unsafe absent | not blocked after `absent` | blocked |
| Entitlement | E1: Instagram `begin` without an active entitlement (E2 expired, revoked) | `OK` (attempt created) | `PERMISSION_REQUIRED`, 0 attempts |
| Entitlement | E3: Facebook `begin` without an entitlement | OK | OK (unchanged) |
| Privileges | P1: `anon` / `authenticated` calling the RPCs | permission denied | permission denied |

## 4. Shared Facebook behaviour and permissions

- **F1:** an identical Facebook call sequence on both databases returns identical results and leaves identical rows: **PASS**.
- **G1:** function attributes are unchanged (SECURITY DEFINER, `search_path=''`, volatility, owner).
- **G2:** the EXECUTE ACLs of all 9 functions are identical before and after. Guard and gate are `postgres` only; the others are `postgres` + `service_role`.
- **G3:** table grants are unchanged.
- **G4:** all 94 RLS policies are unchanged.
- **G5:** RLS enablement is unchanged.
- **G6:** of 91 functions in `public`, exactly the 4 intended functions differ; none were added or removed.
- These 5 publish-safety functions are byte-identical (whitespace-free md5) before and after: `publish_attempt_advance`, `publish_attempt_mark_stale`, `publication_publish_gate`, `publication_publish_preflight` and `internal_test_entitlement_active`.

## 5. TypeScript inspection (`supabase/functions/instagram-publishing`)

- **Pinned target (`publishTarget.ts`):** the frozen `APPROVED_TARGET` contains:
  - publication `875587f5-0137-4477-904c-609e8e406ad6`;
  - version `3`;
  - caption sha256 `537130129640e265530b14f0c6630124906ceae7964501ef76002eae2603915e`;
  - original image sha256 `6edee998611958567dead90b82eebc39bd15db2ea85fe02c3135942adcf853a7`.

  Hashes are computed with WebCrypto SHA-256 on the server. No hash is accepted from the browser; the request body only accepts `action`, `publicationId`, `expectedVersion` and `retry`.
- **Authorization (`instagramPublish.ts`):**
  - Writing to Meta requires `mayWrite` = armed AND allowlisted AND target publication AND entitled. It fails closed.
  - A requested version other than the pinned version returns `VERSION_CONFLICT`.
  - After `begin`, the draft version and caption hash are re-checked, and the original image hash must match the pin.
  - `stillAuthorized` and `snapshotIntact` (draft plus derivative read-back hash) run before container creation and again before `media_publish`.
  - `entitlementActive` is true only when `!error && data === true`.
  - The `verify` action is read-only and is not entitlement-gated.
- **Graph error handling (`graph.ts`):**
  - Once `media_publish` has been sent, any failed reply, 5xx, transport error or malformed success is recorded as UNKNOWN, never as failed.
  - An invalid id gives `INTERNAL_ERROR` without any network request.
  - The non-created publish result maps to unknown; `ok_unknown` returns HTTP 202.

  This matches the SQL `finish` → `ok_unknown` rule.

Result: **PASS**.

## 6. Fingerprints and correction to the FIX01 manifest

Production stores function bodies with indentation stripped, so raw `md5(prosrc)` values differ between production and a replay. Use the whitespace-free md5, `md5(regexp_replace(prosrc,'\s','','g'))`. **The FIX01 EXCEPTION manifest section 5, step 3 used raw md5s. This report supersedes that step with the whitespace-free values below.** The historical manifest itself is not edited.

| Function | Before (production = replay = after rollback) | Expected after FIX01 |
|---|---|---|
| publish_attempt_begin | 165e0a4164230dc6db8bcdb6380a32bc | c7a783fc795bb4f5eb5ebbc1246e943b |
| publish_attempt_finish | 104a927804a445e5485cba3d5521ef2d | b899c48ece67be21664ec8564e475cbb |
| publish_attempt_record_verification | 4761518141834367425557445611d2f0 | eabb8a45d15c3127aecedbf2d5201255 |
| publish_attempts_guard | 913576bd366a66a6b60151af16030d98 | 3ae610d5cbf419af15dce170cb853d7a |
| publish_attempt_advance | e13cee809bdeaa8381ba02096761454f | unchanged |
| publish_attempt_mark_stale | b99f5731dca7b2d9a6df5b6c345b78a1 | unchanged |
| publication_publish_gate | 12f9d6cfa192af2efc55038f2a2745d0 | unchanged |
| publication_publish_preflight | 356c5e36cba82ea003cf9654fededef7 | unchanged |
| internal_test_entitlement_active | 325e375c25b198448ec80d9334065a12 | unchanged |

## 7. Freeze manifests, ledger and regression

- **Manifests:** all 23 historical report hashes listed in `A3_7_4_3_GATE_B4_FIX01_EXCEPTION_MANIFEST.md` match in three places: the working tree, ZIP (41) and the baseline archive. Historical freeze manifests are **unchanged**.
- **Ledger:** all 12 authorized fingerprint/ledger entries match in the working tree and ZIP (41).
- **Re-pinned tests:** the 4 re-pinned older tests contain only harness extensions and re-pins. Each is marked `A3.7.4.3 GATE B.4 FIX01 AUTHORIZED` and shows the prior value (`was:`). The only behavioural re-pin is T26: a `media_publish` error reply now gives UNKNOWN (finding F6). Every fingerprint update is documented.
- **Deploy state:** the sha256 of `supabase/functions-deploy-state.json` is `87f8bfce…` in the tree, the baseline archive and ZIP (41). The `instagram-publishing` deploy hash `7daa1d63…` is unchanged.
- **Test suite:** 90 files, **3069/3069 passed** (`evidence/VITEST_SUMMARY.txt`).
- **TypeScript (`tsc`):** 20 errors, all pre-existing in landing/admin pages (`evidence/TSC_OUTPUT.txt`). None of them is in Instagram or Meta publishing code. **No new errors.**
- **Production build:** OK (`evidence/BUILD_SUMMARY.txt`).

## 8. Production read-only checks (no production change occurred)

| Check | Result |
|---|---|
| Applied migrations | 59 records, latest `20261031172241`; prepared FIX01 **not applied** |
| Function fingerprints / ACLs | equal to the pre-fix values in section 6 |
| `publication_publish_attempts` | 1 total, **0 Instagram**; last change 2026-10-30 22:40:42 (before FIX01) |
| Publication D (`875587f5…`) | `proposals_ready`, version 3, draft `updated_at` 2026-10-31 16:22:09.849195+00 |
| `instagram-derivatives` storage | 0 objects |
| Secrets | no `META_INSTAGRAM_*` secret (publishing disarmed) |
| Edge function `instagram-publishing` | ACTIVE with the previous code; FIX01 code **not deployed** (deploy state unchanged) |

Conclusion: no production migration, no deployment, no Meta POST and no publish attempt has occurred.

## 9. Production rollout procedure (REQUIRES SEPARATE EXPLICIT AUTHORIZATION)

1. Obtain written authorization naming this report and the prepared SQL sha256 `a3209acb…5981`.
2. Re-verify the preconditions:
   - the prepared SQL sha256;
   - production fingerprints equal the "Before" column in section 6;
   - 0 Instagram attempts;
   - no `META_INSTAGRAM_*` secrets.
3. As one authorized development change, copy the prepared SQL into `supabase/migrations/` and re-pin the migration-count tests from 60 to 61. Affected pins: `a3743GateB4Fix01DatabaseAndFreeze` (prepared file currently expected to be absent), plus the a281, a33 and B3 FIX02 count pins. Run the full suite and build.
4. Apply the SQL once, via the Bolt migration tool (it wraps the file in one transaction; the file has no top-level transaction statements and nothing destructive). If the tool times out, check the fingerprints before any re-apply; the file is idempotent (`CREATE OR REPLACE` plus re-asserted grants).
5. Post-migration check:
   - the 4 changed functions equal the "Expected after" column;
   - the other 5 are unchanged;
   - ACLs are unchanged;
   - `get_advisors` shows no new security finding.
6. Only after step 5 passes, deploy only `instagram-publishing`. Never deploy the FIX01 code without the SQL. Confirm that `meta-publishing` and all other functions keep their deploy hashes, and record the new deploy hash and version.
7. Run independent post-checks:
   - 0 Instagram attempts;
   - publication D unchanged;
   - still no `META_INSTAGRAM_*` secrets (disarmed).

   Arming and any real Instagram publication are separate gates and are not covered by this verdict.

## 10. Rollback procedure (emergency, REQUIRES SEPARATE AUTHORIZATION)

- File: `gate-b4-fix01-verification/rollback/ROLLBACK_a3743_gateb4_fix01_publish_safety.sql`, sha256 `87a7ecf9c6a0552f689da70b69f8283ee60bbb6ba22053e0d64d1ffaf8b3c60a`.
- It was generated with `pg_get_functiondef` from the faithful pre-fix replay. It restores the 4 functions and the original REVOKE/GRANT statements, and changes no tables, data, policies or grants.
- **Rehearsed** on `audit_rollback` (replay → FIX01 → rollback):
  - all 9 fingerprints and ACLs returned exactly to the pre-fix values;
  - the full pre-fix expectation set ran against `audit_rollback` with 168/168 matched.

Steps:
1. Keep publishing disarmed (no `META_INSTAGRAM_*` secrets). Do not attempt verification or retries while the rollback is in effect.
2. Apply the rollback as a new forward migration through the migration tool. Never edit or delete the applied FIX01 migration record.
3. Verify that the fingerprints equal the "Before" column in section 6.
4. Redeploy the previous `instagram-publishing` source from the pre-FIX01 baseline archive (deploy hash `7daa1d63…`).
5. Record the event. Note: a rollback re-opens the stale-verification, failed-after-publish-request and missing-entitlement findings.

## 11. Residual risks

- Production runs on aarch64 while the disposable database ran on x86-64, with the same PostgreSQL 17.6. The tested logic is platform-independent PL/pgSQL.
- The disposable database recreates the Supabase roles and schemas, not the full platform. The behaviours relevant here (roles, grants, RLS, row locks, triggers) are core PostgreSQL.
- Edge-function behaviour was verified by code inspection and the unit-test suite, not by a live Meta call (none is permitted).

## 12. Evidence index

See `A3_7_4_3_GATE_B4_FIX01_INDEPENDENT_VERIFICATION_MANIFEST.md` for the sha256 of every harness, evidence and rollback file.
