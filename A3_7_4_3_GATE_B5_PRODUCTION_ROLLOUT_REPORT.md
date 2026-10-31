# A3.7.4.3 GATE B.5 — CONTROLLED PRODUCTION ROLLOUT REPORT

**Verdict: NO-GO — INSTAGRAM GATE B.5 ROLLOUT INCOMPLETE OR UNSAFE**

The FIX01 database migration was applied and verified. The `instagram-publishing` deploy did not happen: the deploy tool reported "No Edge Functions changed since the last deploy. Nothing to deploy." Under the failure rule, the rollout stopped at that point. Real publishing remains disabled; no rollback was attempted.

## 1. Exact partial state (production)

| Item | State |
|---|---|
| FIX01 migration | APPLIED. Recorded as version `20261031234927`, name `a3743_gateb4_fix01_publish_safety`. schema_migrations 59 → 60. |
| The 4 corrected functions | Match the FIX01 fingerprints. |
| `instagram-publishing` edge function | NOT redeployed. id `a3008491-be86-40c3-ae41-0a93ee773be4`, ACTIVE. It is presumed to still run the pre-FIX01 code; the deployed artifact is UNKNOWN (no direct read access). |
| `meta-publishing` | NOT redeployed (deploy-state hash `ae6e628c…` unchanged). ACTIVE. |
| Real publishing | DISABLED. No `META_INSTAGRAM_REAL_PUBLISH_*` secrets exist. |
| Publication D, image, entitlement | Unchanged. |

## 2. Steps performed

1. **Pre-checks: all PASS** (`evidence/01_PRECHECKS.txt`).
2. **Promotion.** The FIX01 SQL was copied byte-identical to `supabase/migrations/20261031190000_a3743_gateb4_fix01_publish_safety.sql` (sha256 `a3209acbc30f3a56c6c4d2260d023c1330d9966c5603552caba99e262bbb5981`). Migration files: 60 → 61.
3. **Test re-pins.**
   - Only migration-count checks (60 → 61) and the hash freezes that depend on them were changed.
   - Every changed check carries an annotation with its "was" value (`evidence/03_REPIN_LIST.txt`, `evidence/04_REPIN_DIFF.patch`).
   - No assertion was removed or weakened. No historical migration or manifest was edited.
4. **Regression.**
   - vitest: 90 files and 3069/3069 tests passed.
   - tsc: 20 errors, with per-file counts identical to the pre-B.5 baseline.
   - build: exit 0.
   - Details: `evidence/02_REGRESSION.txt`.
5. **Migration.**
   - The live state was re-checked immediately before applying and still matched the baseline.
   - Applied through the standard migration tool with the verbatim file content. Result: success.
   - Details: `evidence/05_MIGRATION_APPLY.txt`.
6. **Database verification: PASS** (see the Security Verification document).
7. **Deploy: FAILED (nothing deployed)** (`evidence/06_DEPLOY_ATTEMPT.txt`).
   - The source differs from the deployed baseline only in `instagram-publishing`.
   - The tool's change tracker recorded `hasChanged:false` for that function and did not detect the change.
   - I did not force detection, for example by touching or altering files. That would be improvising outside the approved artifact.
8. **Post-state checks: PASS** for everything that applies (section 3).

## 3. Post-rollout checks

| Check | Result |
|---|---|
| The 4 corrected functions match their fingerprints | PASS |
| Other functions, permissions, RLS, policies, triggers unchanged | PASS (see Security Verification) |
| Facebook behaviour and permissions unchanged | PASS |
| `meta-publishing` not redeployed | PASS |
| `instagram-publishing` active with the new version | **FAIL.** Active, but not redeployed. |
| Publication D unchanged | PASS. Status `proposals_ready`, updated `2026-10-31 16:16:13.516242+00`; draft v3, updated `16:22:09.849195+00`, md5 `7c34b594…` |
| Instagram attempts | PASS. 0 attempts; 1 attempt in total (Facebook, last change `2026-10-30 22:40:42.724699+00`); 0 containers |
| Derivatives | PASS. 0 objects in `instagram-derivatives` |
| Real-publishing secrets absent | PASS. None present; the only Meta secrets are META_APP_ID, META_APP_SECRET and META_REDIRECT_URI |
| Entitlement unchanged | PASS. 1 row, rows md5 `0bd938b4d018ba9832d5eee43c66214f` (no prior row hash; the count matches) |
| No Meta POST | PASS. No function was invoked and no attempt was created. |
| No unrelated migrations or deploys | PASS. Exactly 1 migration was added after `20261031172241`; nothing was deployed. |
| Repository regression after apply | FAIL. 8 count checks fail because of the duplicate migration file (section 3b). |

## 3b. Repository side effect of the migration tool (open item)

**What happened.** `apply_migration` also wrote `supabase/migrations/20261031234927_a3743_gateb4_fix01_publish_safety.sql`. It is byte-identical to the promoted `20261031190000_…` file (sha `a3209acb…`). The repository therefore holds the same migration twice, and 62 migration files.

**Test impact.**

| Run | Result |
|---|---|
| Before the apply | 3069/3069 PASS |
| After the apply | 8 FAIL, 3061 PASS |

All 8 failures are migration-count or newest-file checks (62 vs 61). No behavioural test fails.

**Left unresolved.** After the stop point, deleting either file would be an unapproved change.

**Resolution options (need approval):**

- **Option A:** keep `20261031234927_…`, which matches production's recorded version. Remove `20261031190000_…`, and repoint the FIX01 promotion test to the 234927 name.
- **Option B:** remove the tool copy and keep `20261031190000_…`, accepting a local/production version-name difference. A similar difference already exists for silent_coast.

Evidence: `evidence/07_POST_APPLY_REPO_SIDE_EFFECT.txt`.

## 4. Risk of the current mixed state

The database now runs FIX01 while `instagram-publishing` presumably still runs the pre-FIX01 code.

- **Publishing is disabled.** The old code returns `REAL_PUBLISH_DISABLED` before any database or Graph call when the arming secrets are absent, and they are absent.
- **Instagram cannot start.** No Instagram attempt can begin, so none of the new database responses (`ok_unknown`, `unsafe_absent`, Instagram `PERMISSION_REQUIRED`) are reachable from the old code.
- **The database is the stricter side.** The FIX01 guard trigger adds protection that applies whatever code runs. The mixed state is therefore at least as safe as the pre-B.5 state.
- **Facebook is unaffected.** Its paths (stage `none`, channel `facebook`) are unchanged by FIX01.
- **Residual risk.** If the arming secrets were added while the old function code is live, the old Instagram code would run against the new database. This is not authorized and must not happen until the B.5 deploy is completed and verified.

## 5. Required next step (needs new authorization)

Get `instagram-publishing` deployed from the approved source:

| File | sha256 |
|---|---|
| graph.ts | `a107c840…` |
| index.ts | `6312ea2e…` |
| instagramPublish.ts | `df94b08f…` |
| publishTarget.ts | `d58f363b…` |
| connectionPreflight.ts, derivative.ts, shared.ts | unchanged |

The deploy needs a mechanism that actually registers the change. Then re-run the post-deploy checks.

The migration does NOT need to be re-applied.

## 6. Rollback (not executed)

- **Database.** Apply `auditoria-a2/gate-b4-fix01-verification/rollback/ROLLBACK_a3743_gateb4_fix01_publish_safety.sql` (sha `87a7ecf9…`; rehearsed earlier) as a new forward migration. Then verify the 4 functions return to the pre-fix md5s (`165e0a41`, `104a9278`, `47615181`, `913576bd`) and that the ACLs are unchanged.
- **Edge function.** Not needed, because nothing was deployed. If a later deploy has to be reverted, redeploy the baseline sources from `localseohub-a3743-gateB4-audit.zip`.
- **Throughout:** keep the `META_INSTAGRAM_REAL_PUBLISH_*` secrets absent.
