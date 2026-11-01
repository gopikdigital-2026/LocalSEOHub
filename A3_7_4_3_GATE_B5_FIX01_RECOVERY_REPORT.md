# A3.7.4.3 GATE B.5 — FIX01 DEPLOYMENT RECOVERY REPORT

**Verdict: NO-GO — INSTAGRAM GATE B.5 RECOVERY INCOMPLETE**

## 1. Outcome

| Part | Result |
|---|---|
| Migration reconciliation | DONE |
| Regression | 3069/3069 PASS, 0 skipped; tsc 20 errors, per-file counts identical to the B.5 baseline; build OK |
| `instagram-publishing` deployment | **BLOCKED.** No supported mechanism can deploy the approved bundle (section 3). |
| Production | Unchanged by this recovery. Real publishing remains disabled. |

## 2. Database migration reconciliation

- **Files identical.** `20261031190000_…` and `20261031234927_…` both had sha256 `a3209acbc30f3a56c6c4d2260d023c1330d9966c5603552caba99e262bbb5981` (`cmp` identical).
- **Production version confirmed.** schema_migrations holds 60 rows; the newest is `20261031234927 a3743_gateb4_fix01_publish_safety`.
- **Redundant copy removed.** `supabase/migrations/20261031190000_a3743_gateb4_fix01_publish_safety.sql` was deleted.
  - Kept: `20261031234927_…`.
  - The prepared SQL in `auditoria-a2/gate-b4-fix01-prepared/` and all historical evidence are untouched.
  - Local migrations: 61; the newest is `20261031234927_…`.
- **One test re-pin** (`a3743GateB4Fix01DatabaseAndFreeze.test.ts`, promotion test):
  - The expected file name and sort boundary changed from 20261031190000 to 20261031234927, with a "was" annotation.
  - A new assertion checks that the 190000 copy is absent.
  - The sha and count (61) assertions are unchanged.
  - No other test needed changes: the 61-count checks are correct again.
- **No SQL was applied.**

## 3. Deployment blocker

| Item | Detail |
|---|---|
| Approved sources | All 4 changed files match the mandated sha256 values; the 3 unchanged files match the baseline. |
| Deploy tool | `deploy_edge_functions` takes no function or bundle argument. It deploys only functions its change tracker flags (`hasChanged`). Every function is `false`. |
| Two calls | Both returned "No Edge Functions changed since the last deploy. Nothing to deploy." |
| Change-tracker fingerprint | Content-derived: identical sources share a fingerprint. The formula could not be reproduced (~180 variants), so it is unknown whether the stored instagram-publishing value `7daa1d63…` is for the old or the new bundle. It equals the value in the pre-FIX01 baseline archive. |
| Likely cause | The FIX01 source was written in an earlier session, and the tracker's changed-state was settled without a deploy. The tool trusts its tracker rather than comparing against the deployed artifact. |
| Other routes | Supabase CLI: unsupported here. No other MCP deploy tool. Editing the deploy-state file or touching source to force detection: forbidden. |

**Required to proceed (needs a new decision):**

- Option A: explicitly authorize a controlled, content-neutral way to make the tracker register the function as changed, with the bundle re-verified byte-for-byte afterwards.
- Option B: deploy from outside this environment, e.g. the Supabase dashboard or CLI, run by the owner, from the archived approved sources.

Deployed-code equivalence is UNKNOWN; the evidence suggests the live function is still pre-FIX01.

## 4. Production verification (read-only)

All checks PASS except the deploy (see `A3_7_4_3_GATE_B5_FIX01_SECURITY.md`):

- The FIX01 function fingerprints are retained.
- Facebook behaviour and permissions are unchanged; `meta-publishing` was not redeployed.
- Publication D draft is v3 and unchanged (md5 `7c34b594…`).
- 0 Instagram attempts, 0 containers, 0 derivatives.
- No `META_INSTAGRAM_*` secrets; entitlement unchanged.
- No new migration; no function was invoked, so no Meta POST.

## 5. Risk

Same as the B.5 report. The database runs FIX01; the old Instagram code refuses to publish while the arming secrets are absent, and they are absent.

The arming secrets must not be added until the approved bundle is deployed and verified.

## 6. Rollback

- Migration reconciliation: restore `20261031190000_…` from the prepared copy (same sha) and revert the one test re-pin.
- Database: unchanged by this recovery. The FIX01 rollback SQL is still available as described in the B.5 report.

Evidence: `auditoria-a2/gate-b5-fix01-recovery/evidence/01–03`.
